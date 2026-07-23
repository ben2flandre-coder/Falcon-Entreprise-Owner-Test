export const RC_PROMOTION_DECISION_VERSION = "RCPromotionDecision@1.0";

const REQUIRED_EVIDENCE = Object.freeze([
  "candidateFreeze",
  "reproducibleBuild",
  "cleanInstallation",
  "upgradeRestoreRollback",
  "clientAcceptance",
  "engineeringGate",
  "operatorDocumentation",
  "rollbackProcedure"
]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeRisk(risk, index) {
  if (!risk || typeof risk !== "object" || Array.isArray(risk)) {
    throw new TypeError(`Residual risk at index ${index} must be an object.`);
  }
  const id = typeof risk.id === "string" ? risk.id.trim() : "";
  const severity = typeof risk.severity === "string" ? risk.severity.trim().toLowerCase() : "";
  const status = typeof risk.status === "string" ? risk.status.trim().toLowerCase() : "";
  if (!id) throw new TypeError(`Residual risk at index ${index} requires an id.`);
  if (!['low', 'moderate', 'high', 'critical'].includes(severity)) {
    throw new TypeError(`Residual risk ${id} has an invalid severity.`);
  }
  if (!['accepted', 'mitigated', 'open'].includes(status)) {
    throw new TypeError(`Residual risk ${id} has an invalid status.`);
  }
  return Object.freeze({
    id,
    severity,
    status,
    description: typeof risk.description === "string" ? risk.description.trim() : "",
    mitigation: typeof risk.mitigation === "string" ? risk.mitigation.trim() : ""
  });
}

export function evaluateRCPromotion({
  candidate,
  evidence = {},
  residualRisks = [],
  decidedAt = null,
  decidedBy = null
} = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("RC promotion requires a candidate descriptor.");
  }
  if (typeof candidate.version !== "string" || !/^\d+\.\d+\.\d+-rc\.\d+$/.test(candidate.version)) {
    throw new TypeError("RC candidate version must follow semantic RC format.");
  }
  if (typeof candidate.commit !== "string" || !/^[0-9a-f]{40}$/.test(candidate.commit)) {
    throw new TypeError("RC candidate commit must be a full Git SHA.");
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("RC promotion evidence must be an object.");
  }
  if (!Array.isArray(residualRisks)) throw new TypeError("Residual risks must be an array.");

  const missingEvidence = REQUIRED_EVIDENCE.filter((key) => evidence[key] !== true);
  const risks = residualRisks.map(normalizeRisk);
  const blockingRisks = risks.filter((risk) => risk.status === "open" && ["high", "critical"].includes(risk.severity));
  const acceptedModerateRisks = risks.filter((risk) => risk.status === "accepted" && risk.severity === "moderate");

  let decision = "ready";
  if (missingEvidence.length > 0 || blockingRisks.length > 0) decision = "blocked";
  else if (acceptedModerateRisks.length > 0 || risks.some((risk) => risk.status === "open")) decision = "conditional";

  return freezeDeep({
    version: RC_PROMOTION_DECISION_VERSION,
    candidate: {
      version: candidate.version,
      commit: candidate.commit
    },
    decision,
    promotable: decision === "ready",
    decidedAt,
    decidedBy,
    requiredEvidence: [...REQUIRED_EVIDENCE],
    missingEvidence,
    residualRisks: risks,
    blockingRisks,
    conditions: decision === "conditional"
      ? acceptedModerateRisks.map((risk) => `Monitor accepted risk ${risk.id}.`)
      : [],
    promotionAction: decision === "ready"
      ? "Candidate may be promoted through an explicit operator-controlled release action."
      : "Candidate must not be promoted."
  });
}
