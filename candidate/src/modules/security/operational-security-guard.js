export const OPERATIONAL_SECURITY_GUARD_VERSION = "OperationalSecurityGuard@1.1";

const CAPABILITY_PATTERN = /^[a-z][a-z0-9._-]{2,79}$/;
const SENSITIVE_KEY_PATTERN = /(secret|token|password|passphrase|api.?key|private.?key|credential|authorization|cookie)/i;

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function cloneExecutionInput(value) {
  try {
    return freezeDeep(structuredClone(value));
  } catch (error) {
    throw new TypeError(`Operational security input must be cloneable: ${error?.message || error}`);
  }
}

function normalizeCapability(value) {
  if (typeof value !== "string") throw new TypeError("Security capability must be a string.");
  const normalized = value.trim().toLowerCase();
  if (!CAPABILITY_PATTERN.test(normalized)) throw new TypeError(`Invalid security capability: ${String(value)}.`);
  return normalized;
}

function normalizeContext(context = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new TypeError("Security context must be an object.");
  }
  const actor = typeof context.actor === "string" ? context.actor.trim() : "";
  const reason = typeof context.reason === "string" ? context.reason.trim() : "";
  if (!actor) throw new TypeError("Security context requires an actor.");
  if (!reason) throw new TypeError("Security context requires a reason.");
  return Object.freeze({ actor, reason });
}

function redact(value, depth = 0) {
  if (depth > 6) return "[REDACTED_DEPTH]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(nested, depth + 1);
  }
  return output;
}

function safeError(error) {
  return Object.freeze({
    name: String(error?.name || "Error"),
    code: error?.code ? String(error.code) : null,
    message: "Operational action failed. Consult internal diagnostics."
  });
}

export function createOperationalSecurityGuard({
  authorize,
  capabilities = [],
  now = () => new Date().toISOString(),
  auditLimit = 200
} = {}) {
  if (typeof authorize !== "function") throw new TypeError("Operational security guard requires an authorize function.");
  if (!Array.isArray(capabilities)) throw new TypeError("Operational security capabilities must be an array.");
  if (typeof now !== "function") throw new TypeError("Operational security clock must be a function.");
  if (!Number.isInteger(auditLimit) || auditLimit < 1) throw new RangeError("Operational security audit limit must be positive.");

  const allowedCapabilities = Object.freeze([...new Set(capabilities.map(normalizeCapability))].sort());
  const audit = [];

  function trace(entry) {
    audit.unshift(freezeDeep({ at: String(now()), ...entry }));
    if (audit.length > auditLimit) audit.length = auditLimit;
  }

  function assertCapability(capability) {
    const normalized = normalizeCapability(capability);
    if (!allowedCapabilities.includes(normalized)) throw new Error(`Capability is not exposed: ${normalized}.`);
    return normalized;
  }

  async function execute({ capability, permission, context, input = null, operation } = {}) {
    const normalizedCapability = assertCapability(capability);
    const normalizedPermission = normalizeCapability(permission);
    const normalizedContext = normalizeContext(context);
    if (typeof operation !== "function") throw new TypeError("Operational security execution requires an operation function.");

    const authorized = await authorize({
      actor: normalizedContext.actor,
      permission: normalizedPermission,
      capability: normalizedCapability,
      reason: normalizedContext.reason
    });

    if (authorized !== true) {
      trace({
        capability: normalizedCapability,
        permission: normalizedPermission,
        actor: normalizedContext.actor,
        reason: normalizedContext.reason,
        status: "denied",
        input: redact(input)
      });
      throw new Error("Operational action is not authorized.");
    }

    try {
      const executionInput = cloneExecutionInput(input);
      const result = await operation(executionInput);
      trace({
        capability: normalizedCapability,
        permission: normalizedPermission,
        actor: normalizedContext.actor,
        reason: normalizedContext.reason,
        status: "completed",
        input: redact(input)
      });
      return freezeDeep({ status: "completed", capability: normalizedCapability, result: redact(result) });
    } catch (error) {
      trace({
        capability: normalizedCapability,
        permission: normalizedPermission,
        actor: normalizedContext.actor,
        reason: normalizedContext.reason,
        status: "failed",
        input: redact(input),
        error: safeError(error)
      });
      const exposed = new Error("Operational action failed. Consult internal diagnostics.");
      exposed.code = "OPERATIONAL_ACTION_FAILED";
      throw exposed;
    }
  }

  function snapshot() {
    return freezeDeep({
      version: OPERATIONAL_SECURITY_GUARD_VERSION,
      capabilities: [...allowedCapabilities],
      auditEntries: audit.length
    });
  }

  function recentAudit() {
    return freezeDeep(redact(audit));
  }

  return Object.freeze({
    version: OPERATIONAL_SECURITY_GUARD_VERSION,
    execute,
    snapshot,
    recentAudit
  });
}
