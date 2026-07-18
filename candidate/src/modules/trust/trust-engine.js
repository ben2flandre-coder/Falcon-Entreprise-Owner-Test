export const TRUST_ENGINE_VERSION = "V48.0.0-dev";
export const TRUST_DEFINITION_VERSION = "Trust@1.0";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const STATUSES = Object.freeze(["active", "archived"]);

export class TrustEngineError extends Error {
  constructor(message, code = "TRUST_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class TrustValidationError extends TrustEngineError {
  constructor(message) { super(message, "TRUST_VALIDATION_ERROR"); }
}

export class TrustConflictError extends TrustEngineError {
  constructor(message) { super(message, "TRUST_CONFLICT_ERROR"); }
}

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new TrustValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeText(value, label, max = 3000) {
  const normalized = value == null ? "" : String(value).trim();
  if (normalized.length > max) throw new TrustValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function bounded(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new TrustValidationError(`${label} must be between 0 and 1.`);
  }
  return normalized;
}

function clone(value) { return value == null ? value : structuredClone(value); }

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function trustLevel(value) {
  if (value < 0.35) return "low";
  if (value < 0.7) return "moderate";
  return "high";
}

function interpretationStatus(value) {
  if (value < 0.25) return "not-evaluable";
  if (value < 0.65) return "provisional";
  return "supported";
}

function normalizeRadarInput(input) {
  if (!input || typeof input !== "object") throw new TrustValidationError("Radar input is required.");
  const result = input.result;
  if (!result || typeof result !== "object") throw new TrustValidationError("Radar result is required.");
  return {
    radarId: normalizeId(input.id, "Radar id"),
    missionId: normalizeId(input.missionId, "Mission id"),
    sessionId: input.sessionId == null ? null : normalizeId(input.sessionId, "Session id"),
    radarRevision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    radarCalculationKey: normalizeText(input.calculationKey, "Radar calculation key", 120),
    coverage: bounded(result.coverage ?? 0, "Radar coverage"),
    confidence: bounded(result.confidence ?? 0, "Radar confidence"),
    agreement: bounded(result.agreement ?? 0, "Radar agreement"),
    interpretationStatus: normalizeText(result.interpretationStatus, "Radar interpretation status", 40) || "not-evaluable",
    assessedDimensionCount: Number.isInteger(result.assessedDimensionCount) ? result.assessedDimensionCount : 0,
    dimensionCount: Number.isInteger(result.dimensionCount) && result.dimensionCount > 0 ? result.dimensionCount : 1,
    reservationCount: Array.isArray(result.reservations) ? result.reservations.length : 0,
    contributionCount: Array.isArray(input.contributions) ? input.contributions.length : 0,
    traceability: Array.isArray(input.contributions) && input.contributions.length > 0
      ? input.contributions.filter((item) => item.sourceId && item.ruleId && item.rationale).length / input.contributions.length
      : 0
  };
}

function computeTrust(radar) {
  const completeness = radar.coverage;
  const consistency = radar.agreement;
  const sourceConfidence = radar.confidence;
  const representativeness = Math.min(1, radar.assessedDimensionCount / radar.dimensionCount);
  const traceability = radar.traceability;
  const reservationPenalty = Math.min(0.35, radar.reservationCount * 0.04);
  const evidencePenalty = radar.contributionCount === 0 ? 0.25 : 0;
  const trustIndex = Math.max(0, Math.min(1,
    completeness * 0.25
    + consistency * 0.2
    + sourceConfidence * 0.2
    + representativeness * 0.2
    + traceability * 0.15
    - reservationPenalty
    - evidencePenalty
  ));

  const reservations = [];
  if (completeness < 0.75) reservations.push({ code: "coverage-low", severity: completeness < 0.35 ? "high" : "medium", value: completeness });
  if (consistency < 0.5) reservations.push({ code: "source-divergence", severity: consistency < 0.25 ? "high" : "medium", value: consistency });
  if (sourceConfidence < 0.5) reservations.push({ code: "source-confidence-low", severity: "medium", value: sourceConfidence });
  if (representativeness < 0.75) reservations.push({ code: "representation-low", severity: representativeness < 0.35 ? "high" : "medium", value: representativeness });
  if (traceability < 0.8) reservations.push({ code: "traceability-incomplete", severity: traceability < 0.5 ? "high" : "medium", value: traceability });
  if (radar.contributionCount === 0) reservations.push({ code: "evidence-absent", severity: "high", value: 0 });

  const signals = [];
  if (radar.coverage >= 0.75 && radar.agreement < 0.5) signals.push({ code: "documented-but-divergent", type: "tension" });
  if (radar.coverage < 0.35 && radar.confidence >= 0.5) signals.push({ code: "confidence-with-low-coverage", type: "incoherence" });
  if (radar.interpretationStatus === "supported" && trustIndex < 0.65) signals.push({ code: "interpretation-overstated", type: "warning" });

  return deepFreeze({
    trustIndex,
    trustLevel: trustLevel(trustIndex),
    interpretationStatus: interpretationStatus(trustIndex),
    axes: {
      completeness,
      consistency,
      sourceConfidence,
      representativeness,
      traceability
    },
    reservations,
    signals,
    investigationPriorities: reservations
      .slice()
      .sort((left, right) => ({ high: 0, medium: 1, low: 2 }[left.severity]) - ({ high: 0, medium: 1, low: 2 }[right.severity]))
      .map((item) => item.code)
  });
}

function freezeAssessment(value) { return deepFreeze(clone(value)); }

export function createTrustEngine({ initialAssessments = [], now = () => new Date().toISOString(), idGenerator = null, onChange = () => {} } = {}) {
  if (!Array.isArray(initialAssessments)) throw new TrustValidationError("Initial trust assessments must be an array.");
  if (typeof now !== "function") throw new TypeError("Trust clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Trust id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Trust change hook must be a function.");

  const assessments = new Map();
  let sequence = 0;
  const timestamp = () => String(now());
  const nextId = () => idGenerator ? normalizeId(idGenerator(), "Trust assessment id") : `trust-${++sequence}`;

  function requireAssessment(id) {
    const normalized = normalizeId(id, "Trust assessment id");
    const item = assessments.get(normalized);
    if (!item) throw new TrustValidationError(`Trust assessment not found: ${normalized}`);
    return item;
  }

  function emit(action, assessment, origin) {
    onChange(deepFreeze({ action, assessment: freezeAssessment(assessment), origin: origin || "runtime" }));
  }

  function assessRadar(radarInput, options = {}) {
    const radar = normalizeRadarInput(radarInput);
    const id = options.id ? normalizeId(options.id, "Trust assessment id") : nextId();
    if (assessments.has(id)) throw new TrustConflictError(`Trust assessment already exists: ${id}`);
    const at = timestamp();
    const item = {
      id,
      radarId: radar.radarId,
      missionId: radar.missionId,
      sessionId: radar.sessionId,
      radarRevision: radar.radarRevision,
      radarCalculationKey: radar.radarCalculationKey,
      definitionVersion: TRUST_DEFINITION_VERSION,
      result: computeTrust(radar),
      status: "active",
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      revision: 1
    };
    assessments.set(id, item);
    emit("trust.assessed", item, options.origin);
    return freezeAssessment(item);
  }

  function reassess(id, radarInput, options = {}) {
    const item = requireAssessment(id);
    if (item.status !== "active") throw new TrustConflictError("Archived trust assessments cannot be reassessed.");
    if (options.expectedRevision != null && options.expectedRevision !== item.revision) throw new TrustConflictError(`Trust assessment revision conflict for ${item.id}.`);
    const radar = normalizeRadarInput(radarInput);
    if (radar.radarId !== item.radarId) throw new TrustValidationError("Trust assessment cannot be reassigned to another Radar result.");
    const nextResult = computeTrust(radar);
    if (radar.radarRevision === item.radarRevision && radar.radarCalculationKey === item.radarCalculationKey && JSON.stringify(nextResult) === JSON.stringify(item.result)) {
      emit("trust.reassessment.skipped", item, options.origin);
      return freezeAssessment(item);
    }
    item.radarRevision = radar.radarRevision;
    item.radarCalculationKey = radar.radarCalculationKey;
    item.result = nextResult;
    item.updatedAt = timestamp();
    item.revision += 1;
    emit("trust.reassessed", item, options.origin);
    return freezeAssessment(item);
  }

  function archiveAssessment(id, options = {}) {
    const item = requireAssessment(id);
    if (item.status === "archived") return freezeAssessment(item);
    if (options.expectedRevision != null && options.expectedRevision !== item.revision) throw new TrustConflictError(`Trust assessment revision conflict for ${item.id}.`);
    item.status = "archived";
    item.archivedAt = timestamp();
    item.updatedAt = item.archivedAt;
    item.revision += 1;
    emit("trust.archived", item, options.origin);
    return freezeAssessment(item);
  }

  function getAssessment(id) { return freezeAssessment(requireAssessment(id)); }

  function listAssessments({ radarId = null, missionId = null, status = null } = {}) {
    const radar = radarId == null ? null : normalizeId(radarId, "Radar id");
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    if (status != null && !STATUSES.includes(status)) throw new TrustValidationError("Trust status is invalid.");
    return deepFreeze([...assessments.values()]
      .filter((item) => radar == null || item.radarId === radar)
      .filter((item) => mission == null || item.missionId === mission)
      .filter((item) => status == null || item.status === status)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone));
  }

  function snapshot() {
    return deepFreeze({
      schema: "falcon.trust.registry.v1",
      definitionVersion: TRUST_DEFINITION_VERSION,
      assessmentCount: assessments.size,
      assessments: [...assessments.values()].sort((left, right) => left.id.localeCompare(right.id)).map(clone)
    });
  }

  for (const input of initialAssessments) {
    const item = {
      ...clone(input),
      id: normalizeId(input.id, "Trust assessment id"),
      radarId: normalizeId(input.radarId, "Radar id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: input.sessionId == null ? null : normalizeId(input.sessionId, "Session id"),
      radarRevision: Number.isInteger(input.radarRevision) && input.radarRevision > 0 ? input.radarRevision : 1,
      radarCalculationKey: normalizeText(input.radarCalculationKey, "Radar calculation key", 120),
      status: input.status === "archived" ? "archived" : "active",
      revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1
    };
    if (!item.result || typeof item.result !== "object") throw new TrustValidationError("Stored trust result is invalid.");
    if (assessments.has(item.id)) throw new TrustConflictError(`Duplicate initial trust assessment: ${item.id}`);
    assessments.set(item.id, item);
  }

  return Object.freeze({ assessRadar, reassess, archiveAssessment, getAssessment, listAssessments, snapshot });
}
