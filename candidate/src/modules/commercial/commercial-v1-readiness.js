export const COMMERCIAL_V1_READINESS_VERSION = "CommercialV1Readiness@1.0";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function issue(code, message, phase) {
  return Object.freeze({ code, message, phase });
}

function passed(value) {
  return Boolean(value && value.executed === true && value.result === "passed");
}

export function qualifyCommercialV1({
  sourceCommit,
  productMode,
  licensing,
  onboarding,
  documentation,
  support,
  knownLimits,
  pilot,
  engineeringGate
} = {}) {
  const issues = [];
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(sourceCommit)) issues.push(issue("SOURCE_COMMIT_INVALID", "A full source commit SHA is required.", "baseline"));
  if (!productMode || productMode.mode !== "production" || productMode.productionDefault !== true || productMode.demoExplicit !== true || productMode.demoIsolated !== true) issues.push(issue("PRODUCT_MODE_NOT_READY", "Production and demonstration modes are not safely isolated.", "product-mode"));
  if (!licensing || licensing.offlineEvaluation !== true || licensing.dataAccessRevoked !== false) issues.push(issue("LICENSING_NOT_READY", "Licensing must remain local-first and must not confiscate user data.", "licensing"));
  if (!passed(onboarding)) issues.push(issue("ONBOARDING_NOT_READY", "Commercial and administrative onboarding is not qualified.", "onboarding"));
  if (!passed(documentation)) issues.push(issue("DOCUMENTATION_NOT_READY", "User and administrator documentation is incomplete.", "documentation"));
  if (!passed(support)) issues.push(issue("SUPPORT_NOT_READY", "Support and recovery model is not qualified.", "support"));
  if (!Array.isArray(knownLimits) || knownLimits.length === 0) issues.push(issue("KNOWN_LIMITS_MISSING", "Known limits must be explicitly versioned.", "limits"));
  if (!pilot || pilot.executed !== true || pilot.decision !== "accepted" || !Array.isArray(pilot.evidence) || pilot.evidence.length === 0) issues.push(issue("PILOT_SIGNOFF_MISSING", "Pilot acceptance evidence is missing.", "pilot"));
  if (!passed(engineeringGate)) issues.push(issue("ENGINEERING_GATE_NOT_GREEN", "Falcon Engineering Gate must pass.", "qualification"));

  return freezeDeep({
    version: COMMERCIAL_V1_READINESS_VERSION,
    sourceCommit: /^[0-9a-f]{40}$/.test(sourceCommit || "") ? sourceCommit : null,
    ready: issues.length === 0,
    decision: issues.length === 0 ? "commercial-v1-ready" : "blocked",
    issues
  });
}
