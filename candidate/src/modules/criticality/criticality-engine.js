export const CRITICALITY_ENGINE_VERSION = "V48.0.0-dev";
export const CRITICALITY_METHOD = "GxPxM@1.0";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const LEVELS = Object.freeze(["low", "moderate", "high", "critical"]);
const CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"]);

export class CriticalityEngineError extends Error {
  constructor(message, code = "CRITICALITY_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class CriticalityValidationError extends CriticalityEngineError {
  constructor(message) { super(message, "CRITICALITY_VALIDATION_ERROR"); }
}

export class CriticalityConflictError extends CriticalityEngineError {
  constructor(message) { super(message, "CRITICALITY_CONFLICT_ERROR"); }
}

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new CriticalityValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeText(value, label, max = 2000) {
  const normalized = value == null ? "" : String(value).trim();
  if (normalized.length > max) throw new CriticalityValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function factor(value, label, max) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > max) {
    throw new CriticalityValidationError(`${label} must be an integer from 1 to ${max}.`);
  }
  return normalized;
}

function confidence(value = "medium") {
  const normalized = String(value).trim();
  if (!CONFIDENCE_LEVELS.includes(normalized)) throw new CriticalityValidationError("Confidence level is invalid.");
  return normalized;
}

function levelFor(score) {
  if (score <= 8) return "low";
  if (score <= 24) return "moderate";
  if (score <= 50) return "high";
  return "critical";
}

function compute({ gravity, probability, mastery }) {
  const score = gravity * probability * mastery;
  return Object.freeze({
    method: CRITICALITY_METHOD,
    formula: "gravity × probability × mastery",
    gravity,
    probability,
    mastery,
    score,
    maximumScore: 100,
    normalizedScore: score / 100,
    level: levelFor(score)
  });
}

function freezeAssessment(item) {
  return Object.freeze({
    ...item,
    factors: Object.freeze({ ...item.factors }),
    calculation: Object.freeze({ ...item.calculation })
  });
}

export function createCriticalityEngine({
  initialAssessments = [],
  now = () => new Date().toISOString(),
  idGenerator = null,
  onChange = () => {}
} = {}) {
  if (!Array.isArray(initialAssessments)) throw new CriticalityValidationError("Initial assessments must be an array.");
  if (typeof now !== "function") throw new TypeError("Criticality clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Criticality id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Criticality change hook must be a function.");

  const assessments = new Map();
  const byObservation = new Map();
  let sequence = 0;

  const timestamp = () => {
    try { return String(now()); } catch { return new Date().toISOString(); }
  };
  const nextId = () => idGenerator ? normalizeId(idGenerator(), "Assessment id") : `criticality-${++sequence}`;

  function requireAssessment(id) {
    const normalized = normalizeId(id, "Assessment id");
    const item = assessments.get(normalized);
    if (!item) throw new CriticalityValidationError(`Assessment not found: ${normalized}`);
    return item;
  }

  function normalizeFactors(input) {
    return {
      gravity: factor(input.gravity, "Gravity", 5),
      probability: factor(input.probability, "Probability", 5),
      mastery: factor(input.mastery, "Mastery", 4)
    };
  }

  function emit(action, item, origin) {
    onChange(Object.freeze({ action, assessment: freezeAssessment(item), origin: origin || "runtime" }));
  }

  function assessObservation(input = {}, options = {}) {
    const observationId = normalizeId(input.observationId, "Observation id");
    if (byObservation.has(observationId)) {
      throw new CriticalityConflictError(`An active assessment already exists for observation: ${observationId}`);
    }
    const factors = normalizeFactors(input);
    const id = input.id ? normalizeId(input.id, "Assessment id") : nextId();
    if (assessments.has(id)) throw new CriticalityConflictError(`Assessment already exists: ${id}`);
    const at = timestamp();
    const item = {
      id,
      observationId,
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: input.sessionId == null ? null : normalizeId(input.sessionId, "Session id"),
      method: CRITICALITY_METHOD,
      factors,
      calculation: compute(factors),
      confidence: confidence(input.confidence),
      rationale: normalizeText(input.rationale, "Criticality rationale", 3000),
      status: "active",
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      revision: 1
    };
    assessments.set(id, item);
    byObservation.set(observationId, id);
    emit("criticality.assessed", item, options.origin);
    return freezeAssessment(item);
  }

  function reviseAssessment(id, patch = {}, options = {}) {
    const item = requireAssessment(id);
    if (item.status !== "active") throw new CriticalityConflictError("Archived assessments cannot be revised.");
    if (options.expectedRevision != null && item.revision !== options.expectedRevision) {
      throw new CriticalityConflictError(`Assessment revision conflict for ${item.id}.`);
    }
    const factors = normalizeFactors({
      gravity: Object.hasOwn(patch, "gravity") ? patch.gravity : item.factors.gravity,
      probability: Object.hasOwn(patch, "probability") ? patch.probability : item.factors.probability,
      mastery: Object.hasOwn(patch, "mastery") ? patch.mastery : item.factors.mastery
    });
    item.factors = factors;
    item.calculation = compute(factors);
    if (Object.hasOwn(patch, "confidence")) item.confidence = confidence(patch.confidence);
    if (Object.hasOwn(patch, "rationale")) item.rationale = normalizeText(patch.rationale, "Criticality rationale", 3000);
    item.updatedAt = timestamp();
    item.revision += 1;
    emit("criticality.revised", item, options.origin);
    return freezeAssessment(item);
  }

  function archiveAssessment(id, options = {}) {
    const item = requireAssessment(id);
    if (item.status === "archived") return freezeAssessment(item);
    if (options.expectedRevision != null && item.revision !== options.expectedRevision) {
      throw new CriticalityConflictError(`Assessment revision conflict for ${item.id}.`);
    }
    const at = timestamp();
    item.status = "archived";
    item.archivedAt = at;
    item.updatedAt = at;
    item.revision += 1;
    byObservation.delete(item.observationId);
    emit("criticality.archived", item, options.origin);
    return freezeAssessment(item);
  }

  function getAssessment(id) { return freezeAssessment(requireAssessment(id)); }

  function getAssessmentForObservation(observationId) {
    const normalized = normalizeId(observationId, "Observation id");
    const id = byObservation.get(normalized);
    return id ? freezeAssessment(assessments.get(id)) : null;
  }

  function listAssessments({ missionId = null, sessionId = undefined, level = null, status = null } = {}) {
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    const session = sessionId === undefined ? undefined : (sessionId == null ? null : normalizeId(sessionId, "Session id"));
    if (level != null && !LEVELS.includes(level)) throw new CriticalityValidationError("Criticality level is invalid.");
    if (status != null && !["active", "archived"].includes(status)) throw new CriticalityValidationError("Criticality status is invalid.");
    return Object.freeze([...assessments.values()]
      .filter((item) => mission == null || item.missionId === mission)
      .filter((item) => session === undefined || item.sessionId === session)
      .filter((item) => level == null || item.calculation.level === level)
      .filter((item) => status == null || item.status === status)
      .sort((a, b) => b.calculation.score - a.calculation.score || a.id.localeCompare(b.id))
      .map(freezeAssessment));
  }

  function snapshot() {
    return Object.freeze({
      schema: "falcon.criticality.registry.v1",
      method: CRITICALITY_METHOD,
      assessmentCount: assessments.size,
      assessments: Object.freeze([...assessments.values()].map(freezeAssessment))
    });
  }

  for (const input of initialAssessments) {
    const factors = normalizeFactors(input.factors || input);
    const item = {
      ...input,
      id: normalizeId(input.id, "Assessment id"),
      observationId: normalizeId(input.observationId, "Observation id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: input.sessionId == null ? null : normalizeId(input.sessionId, "Session id"),
      method: CRITICALITY_METHOD,
      factors,
      calculation: compute(factors),
      confidence: confidence(input.confidence),
      rationale: normalizeText(input.rationale, "Criticality rationale", 3000),
      status: input.status === "archived" ? "archived" : "active",
      revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1
    };
    if (assessments.has(item.id)) throw new CriticalityConflictError(`Duplicate initial assessment: ${item.id}`);
    if (item.status === "active" && byObservation.has(item.observationId)) {
      throw new CriticalityConflictError(`Duplicate active assessment for observation: ${item.observationId}`);
    }
    assessments.set(item.id, item);
    if (item.status === "active") byObservation.set(item.observationId, item.id);
  }

  return Object.freeze({
    assessObservation,
    reviseAssessment,
    archiveAssessment,
    getAssessment,
    getAssessmentForObservation,
    listAssessments,
    snapshot
  });
}
