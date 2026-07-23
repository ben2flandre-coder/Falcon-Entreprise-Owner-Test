export const BACKUP_RECOVERY_VERSION = "BackupRecoveryCoordinator@1.0";
export const BACKUP_PACKAGE_SCHEMA = "falcon.backup.package.v1";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeError(error) {
  return Object.freeze({
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Unknown recovery error")
  });
}

export function createBackupRecoveryCoordinator({
  persistence,
  integrity,
  appVersion,
  now = () => new Date().toISOString(),
  idGenerator = () => `backup-${Date.now()}`
} = {}) {
  if (!persistence || typeof persistence.save !== "function" || typeof persistence.restoreEnvelope !== "function") {
    throw new TypeError("Backup recovery requires save() and restoreEnvelope() persistence APIs.");
  }
  if (!integrity || typeof integrity.digest !== "function") {
    throw new TypeError("Backup recovery requires an integrity digest API.");
  }
  const expectedAppVersion = assertText(appVersion, "Application version");
  if (typeof now !== "function") throw new TypeError("Backup recovery clock must be a function.");
  if (typeof idGenerator !== "function") throw new TypeError("Backup recovery id generator must be a function.");

  const audit = [];
  const restorePlans = new Map();

  function trace(operation, status, context = {}) {
    audit.unshift(freezeDeep({
      at: String(now()),
      operation,
      status,
      actor: context.actor || null,
      reason: context.reason || null,
      backupId: context.backupId || null,
      planId: context.planId || null,
      error: context.error ? normalizeError(context.error) : null
    }));
  }

  function validateContext({ actor, reason } = {}) {
    return Object.freeze({
      actor: assertText(actor, "Operator identity"),
      reason: assertText(reason, "Operation reason")
    });
  }

  async function createBackup(context = {}) {
    const operation = validateContext(context);
    try {
      const envelope = await persistence.save({ origin: "backup-recovery" });
      const payload = clone(envelope);
      const digest = await integrity.digest(canonicalize(payload));
      const backupId = assertText(idGenerator(), "Backup id");
      const createdAt = String(now());
      const backup = freezeDeep({
        schema: BACKUP_PACKAGE_SCHEMA,
        version: BACKUP_RECOVERY_VERSION,
        manifest: {
          backupId,
          createdAt,
          appVersion: expectedAppVersion,
          payloadSchema: String(payload.schema || "unknown"),
          commitId: String(payload.commitId || "unknown"),
          participantCount: Object.keys(payload.participants || {}).length,
          integrity: { algorithm: String(integrity.algorithm || "external"), digest: String(digest) },
          actor: operation.actor,
          reason: operation.reason
        },
        payload
      });
      trace("backup.create", "completed", { ...operation, backupId });
      return backup;
    } catch (error) {
      trace("backup.create", "failed", { ...operation, error });
      throw error;
    }
  }

  async function validateBackup(backup) {
    const issues = [];
    if (!backup || typeof backup !== "object" || Array.isArray(backup)) issues.push("Backup package must be an object.");
    if (backup?.schema !== BACKUP_PACKAGE_SCHEMA) issues.push(`Unsupported backup schema: ${String(backup?.schema)}.`);
    if (backup?.manifest?.appVersion !== expectedAppVersion) issues.push(`Incompatible application version: ${String(backup?.manifest?.appVersion)}.`);
    if (!backup?.payload || typeof backup.payload !== "object") issues.push("Backup payload is missing.");
    if (typeof backup?.manifest?.integrity?.digest !== "string") issues.push("Backup integrity digest is missing.");

    if (issues.length === 0) {
      const actual = String(await integrity.digest(canonicalize(backup.payload)));
      if (actual !== backup.manifest.integrity.digest) issues.push("Backup integrity verification failed.");
    }

    return freezeDeep({
      valid: issues.length === 0,
      compatible: !issues.some((issue) => issue.startsWith("Incompatible")),
      integrityVerified: !issues.includes("Backup integrity verification failed.") && !issues.includes("Backup integrity digest is missing."),
      issues
    });
  }

  async function prepareRestore(backup, context = {}) {
    const operation = validateContext(context);
    const validation = await validateBackup(backup);
    if (!validation.valid) {
      const error = new Error(`Backup cannot be restored: ${validation.issues.join(" ")}`);
      trace("restore.prepare", "refused", { ...operation, backupId: backup?.manifest?.backupId || null, error });
      throw error;
    }

    const planId = `restore-plan-${assertText(idGenerator(), "Restore plan id")}`;
    const confirmationToken = `CONFIRM-${backup.manifest.backupId}`;
    const plan = freezeDeep({
      planId,
      backupId: backup.manifest.backupId,
      createdAt: String(now()),
      actor: operation.actor,
      reason: operation.reason,
      status: "awaiting-confirmation",
      confirmationToken,
      impacts: [
        "Current persisted state may be replaced.",
        "Runtime participants may be restored through the Persistence contract.",
        "A post-restore verification is required."
      ],
      validation,
      backup: clone(backup)
    });
    restorePlans.set(planId, plan);
    trace("restore.prepare", "awaiting-confirmation", { ...operation, backupId: plan.backupId, planId });
    return plan;
  }

  async function executeRestore({ planId, confirmationToken, actor } = {}) {
    const normalizedPlanId = assertText(planId, "Restore plan id");
    const operator = assertText(actor, "Operator identity");
    const plan = restorePlans.get(normalizedPlanId);
    if (!plan) throw new Error(`Unknown restore plan: ${normalizedPlanId}.`);
    if (operator !== plan.actor) throw new Error("Restore operator does not match the prepared plan.");
    if (confirmationToken !== plan.confirmationToken) {
      trace("restore.execute", "refused", { actor: operator, reason: plan.reason, backupId: plan.backupId, planId: plan.planId });
      throw new Error("Restore confirmation token is invalid.");
    }

    try {
      const result = await persistence.restoreEnvelope(clone(plan.backup.payload), {
        origin: "backup-recovery",
        actor: operator,
        reason: plan.reason
      });
      restorePlans.delete(normalizedPlanId);
      trace("restore.execute", "completed", { actor: operator, reason: plan.reason, backupId: plan.backupId, planId: plan.planId });
      return freezeDeep({
        status: "restored",
        backupId: plan.backupId,
        planId: plan.planId,
        restoredAt: String(now()),
        verificationRequired: true,
        result: clone(result)
      });
    } catch (error) {
      trace("restore.execute", "failed", { actor: operator, reason: plan.reason, backupId: plan.backupId, planId: plan.planId, error });
      throw error;
    }
  }

  function recommendRecovery({ severity, condition } = {}) {
    const normalizedSeverity = assertText(severity, "Recovery severity");
    const normalizedCondition = assertText(condition, "Recovery condition");
    const procedure = normalizedSeverity === "critical"
      ? ["Stop write operations.", "Create a current-state backup if possible.", "Validate a known-good backup.", "Prepare an operator-confirmed restore.", "Verify the restored state."]
      : ["Inspect persistence diagnostics.", "Create a current-state backup.", "Validate integrity before any restore decision."];
    return freezeDeep({ severity: normalizedSeverity, condition: normalizedCondition, automatic: false, procedure });
  }

  function recentAudit() {
    return freezeDeep(clone(audit));
  }

  return Object.freeze({
    version: BACKUP_RECOVERY_VERSION,
    createBackup,
    validateBackup,
    prepareRestore,
    executeRestore,
    recommendRecovery,
    recentAudit
  });
}
