export const RADAR_ENGINE_VERSION = "V48.0.0-dev";
export const RADAR_DEFINITION_VERSION = "Radar360@1.0";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const SCOPE_TYPES = Object.freeze(["mission", "session"]);
const ASSESSMENT_STATUSES = Object.freeze(["active", "archived"]);
const DATA_STATES = Object.freeze(["positive", "negative", "neutral", "unknown", "insufficient"]);
const CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"]);
const MAX_CONTRIBUTIONS = 1000;

export const DEFAULT_RADAR_DIMENSIONS = Object.freeze([
  { id: "governance", label: "Gouvernance", description: "Pilotage, responsabilités, décisions et traçabilité.", weight: 1 },
  { id: "organization", label: "Organisation", description: "Processus, coordination, charge et interfaces.", weight: 1 },
  { id: "human", label: "Humain", description: "Compétences, comportements, communication et facteurs humains.", weight: 1 },
  { id: "technical", label: "Technique", description: "Équipements, installations, protections et fiabilité technique.", weight: 1 },
  { id: "work-environment", label: "Environnement de travail", description: "Espaces, ambiances, flux et conditions de travail.", weight: 1 },
  { id: "prevention", label: "Prévention", description: "Mesures de prévention, maîtrise des risques et anticipation.", weight: 1 },
  { id: "compliance", label: "Conformité", description: "Exigences applicables, preuves et écarts documentés.", weight: 1 },
  { id: "operational-control", label: "Maîtrise opérationnelle", description: "Capacité à exécuter, surveiller et corriger les opérations.", weight: 1 }
]);

export class RadarEngineError extends Error {
  constructor(message, code = "RADAR_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class RadarValidationError extends RadarEngineError {
  constructor(message) { super(message, "RADAR_VALIDATION_ERROR"); }
}

export class RadarConflictError extends RadarEngineError {
  constructor(message) { super(message, "RADAR_CONFLICT_ERROR"); }
}

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new RadarValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeText(value, label, max = 3000) {
  const normalized = value == null ? "" : String(value).trim();
  if (normalized.length > max) throw new RadarValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function boundedNumber(value, label, { min = 0, max = 1 } = {}) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new RadarValidationError(`${label} must be between ${min} and ${max}.`);
  }
  return normalized;
}

function confidenceRank(value) {
  const normalized = String(value || "medium").trim();
  if (!CONFIDENCE_LEVELS.includes(normalized)) throw new RadarValidationError("Contribution confidence is invalid.");
  return { low: 0.35, medium: 0.65, high: 0.9 }[normalized];
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function fingerprint(value) {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeDefinition(input = {}) {
  const dimensions = Array.isArray(input.dimensions) && input.dimensions.length ? input.dimensions : DEFAULT_RADAR_DIMENSIONS;
  const seen = new Set();
  const normalized = dimensions.map((dimension) => {
    const id = normalizeId(dimension.id, "Radar dimension id");
    if (seen.has(id)) throw new RadarValidationError(`Duplicate radar dimension: ${id}`);
    seen.add(id);
    const weight = boundedNumber(dimension.weight ?? 1, `Weight for ${id}`, { min: 0.0001, max: 100 });
    return {
      id,
      label: normalizeText(dimension.label, `Label for ${id}`, 120) || id,
      description: normalizeText(dimension.description, `Description for ${id}`, 1000),
      weight
    };
  });
  if (!normalized.length) throw new RadarValidationError("Radar definition must include at least one dimension.");
  const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) throw new RadarValidationError("Radar definition weight total is invalid.");
  return deepFreeze({
    id: normalizeId(input.id || "radar-360", "Radar definition id"),
    version: String(input.version || RADAR_DEFINITION_VERSION),
    dimensions: normalized,
    totalWeight
  });
}

function normalizeContribution(input, definition) {
  if (!input || typeof input !== "object") throw new RadarValidationError("Radar contribution must be an object.");
  const dimensionId = normalizeId(input.dimensionId, "Contribution dimension id");
  if (!definition.dimensions.some((dimension) => dimension.id === dimensionId)) {
    throw new RadarValidationError(`Unknown radar dimension: ${dimensionId}`);
  }
  const dataState = String(input.dataState || "neutral").trim();
  if (!DATA_STATES.includes(dataState)) throw new RadarValidationError("Contribution data state is invalid.");
  const sourceType = normalizeText(input.sourceType, "Contribution source type", 80) || "unknown";
  const sourceId = normalizeId(input.sourceId, "Contribution source id");
  const coverageEligible = !["unknown", "insufficient"].includes(dataState);
  const value = coverageEligible ? boundedNumber(input.value ?? 0.5, "Contribution value") : null;
  const weight = boundedNumber(input.weight ?? 1, "Contribution weight", { min: 0.0001, max: 100 });
  const confidence = String(input.confidence || "medium").trim();
  confidenceRank(confidence);
  return deepFreeze({
    id: normalizeId(input.id || `contribution-${dimensionId}-${sourceId}`, "Contribution id"),
    dimensionId,
    sourceType,
    sourceId,
    ruleId: normalizeText(input.ruleId, "Contribution rule id", 120) || "manual-mapping",
    dataState,
    value,
    weight,
    confidence,
    coverageEligible,
    rationale: normalizeText(input.rationale, "Contribution rationale")
  });
}

function contributionComparator(left, right) {
  return left.dimensionId.localeCompare(right.dimensionId)
    || left.sourceType.localeCompare(right.sourceType)
    || left.sourceId.localeCompare(right.sourceId)
    || left.ruleId.localeCompare(right.ruleId)
    || left.id.localeCompare(right.id);
}

function normalizeContributions(input, definition) {
  if (!Array.isArray(input)) throw new RadarValidationError("Radar contributions must be an array.");
  if (input.length > MAX_CONTRIBUTIONS) throw new RadarValidationError(`A Radar assessment supports at most ${MAX_CONTRIBUTIONS} contributions.`);
  const normalized = input.map((item) => normalizeContribution(item, definition)).sort(contributionComparator);
  const ids = new Set();
  const signatures = new Set();
  for (const item of normalized) {
    if (ids.has(item.id)) throw new RadarValidationError(`Duplicate Radar contribution id: ${item.id}`);
    ids.add(item.id);
    const signature = `${item.dimensionId}|${item.sourceType}|${item.sourceId}|${item.ruleId}`;
    if (signatures.has(signature)) throw new RadarValidationError(`Duplicate Radar contribution mapping: ${signature}`);
    signatures.add(signature);
  }
  return deepFreeze(normalized);
}

function levelFor(value) {
  if (value < 0.35) return "critical";
  if (value < 0.55) return "fragile";
  if (value < 0.75) return "controlled";
  return "strong";
}

function coverageStatus(value) {
  if (value === 0) return "not-evaluated";
  if (value < 0.35) return "insufficiently-documented";
  if (value < 0.75) return "partially-evaluated";
  return "evaluated";
}

function interpretationStatus(score, coverage, confidence) {
  if (score == null || coverage < 0.25) return "not-evaluable";
  if (coverage < 0.75 || confidence < 0.5) return "provisional";
  return "supported";
}

function aggregateDimension(dimension, contributions) {
  const relevant = contributions.filter((item) => item.dimensionId === dimension.id);
  const eligible = relevant.filter((item) => item.coverageEligible);
  const totalWeight = relevant.reduce((sum, item) => sum + item.weight, 0);
  const eligibleWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  const score = eligibleWeight > 0
    ? eligible.reduce((sum, item) => sum + item.value * item.weight, 0) / eligibleWeight
    : null;
  const coverage = totalWeight > 0 ? eligibleWeight / totalWeight : 0;
  const confidenceBase = eligibleWeight > 0
    ? eligible.reduce((sum, item) => sum + confidenceRank(item.confidence) * item.weight, 0) / eligibleWeight
    : 0;
  const weightedDeviation = score == null || eligibleWeight === 0
    ? 0
    : eligible.reduce((sum, item) => sum + Math.abs(item.value - score) * item.weight, 0) / eligibleWeight;
  const agreement = score == null ? 0 : clamp01(1 - (weightedDeviation * 2));
  const confidence = confidenceBase * coverage * agreement;
  const sourceTypes = [...new Set(eligible.map((item) => item.sourceType))].sort();
  const missingData = relevant
    .filter((item) => !item.coverageEligible)
    .map((item) => ({ sourceType: item.sourceType, sourceId: item.sourceId, dataState: item.dataState, rationale: item.rationale }));
  const status = interpretationStatus(score, coverage, confidence);
  return deepFreeze({
    dimensionId: dimension.id,
    label: dimension.label,
    score,
    level: score == null ? "unknown" : levelFor(score),
    coverage,
    coverageStatus: coverageStatus(coverage),
    confidence,
    confidenceBase,
    agreement,
    interpretationStatus: status,
    contributionCount: relevant.length,
    evaluatedContributionCount: eligible.length,
    sourceDiversity: sourceTypes.length,
    sourceTypes,
    missingData,
    contributors: relevant.map((item) => item.id)
  });
}

function computeResult(definition, contributions) {
  const dimensions = definition.dimensions.map((dimension) => aggregateDimension(dimension, contributions));
  const weights = new Map(definition.dimensions.map((item) => [item.id, item.weight]));
  const scored = dimensions.filter((item) => item.score != null);
  const usedWeight = scored.reduce((sum, result) => sum + weights.get(result.dimensionId), 0);
  const score = usedWeight > 0
    ? scored.reduce((sum, result) => sum + result.score * weights.get(result.dimensionId), 0) / usedWeight
    : null;
  const coverage = dimensions.reduce((sum, result) => sum + result.coverage * weights.get(result.dimensionId), 0) / definition.totalWeight;
  const confidence = dimensions.reduce((sum, result) => sum + result.confidence * weights.get(result.dimensionId), 0) / definition.totalWeight;
  const agreement = scored.length
    ? scored.reduce((sum, result) => sum + result.agreement * weights.get(result.dimensionId), 0) / usedWeight
    : 0;
  const status = interpretationStatus(score, coverage, confidence);
  const reservations = [];
  for (const item of dimensions) {
    const reasons = [];
    if (item.coverageStatus !== "evaluated") reasons.push("coverage");
    if (item.confidence < 0.5) reasons.push("confidence");
    if (item.agreement < 0.5 && item.evaluatedContributionCount > 1) reasons.push("divergence");
    if (item.missingData.length) reasons.push("missing-data");
    if (reasons.length) reservations.push({
      dimensionId: item.dimensionId,
      reasons,
      coverageStatus: item.coverageStatus,
      confidence: item.confidence,
      agreement: item.agreement
    });
  }
  return deepFreeze({
    score,
    level: score == null ? "unknown" : levelFor(score),
    coverage,
    coverageStatus: coverageStatus(coverage),
    confidence,
    agreement,
    interpretationStatus: status,
    assessedDimensionCount: scored.length,
    dimensionCount: dimensions.length,
    dimensions,
    reservations
  });
}

function calculationKey(definition, contributions, result) {
  return fingerprint({
    definitionId: definition.id,
    definitionVersion: definition.version,
    dimensions: definition.dimensions,
    contributions,
    result
  });
}

function freezeAssessment(item) {
  return deepFreeze(clone(item));
}

export function createRadarEngine({
  definition = {},
  initialAssessments = [],
  now = () => new Date().toISOString(),
  idGenerator = null,
  onChange = () => {}
} = {}) {
  const normalizedDefinition = normalizeDefinition(definition);
  if (!Array.isArray(initialAssessments)) throw new RadarValidationError("Initial radar assessments must be an array.");
  if (typeof now !== "function") throw new TypeError("Radar clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Radar id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Radar change hook must be a function.");

  const assessments = new Map();
  let sequence = 0;
  const timestamp = () => { try { return String(now()); } catch { return new Date().toISOString(); } };
  const nextId = () => idGenerator ? normalizeId(idGenerator(), "Radar assessment id") : `radar-${++sequence}`;

  function requireAssessment(id) {
    const normalized = normalizeId(id, "Radar assessment id");
    const item = assessments.get(normalized);
    if (!item) throw new RadarValidationError(`Radar assessment not found: ${normalized}`);
    return item;
  }

  function emit(action, item, origin) {
    onChange(deepFreeze({ action, assessment: freezeAssessment(item), origin: origin || "runtime" }));
  }

  function assess(input = {}, options = {}) {
    const scopeType = String(input.scopeType || "").trim();
    if (!SCOPE_TYPES.includes(scopeType)) throw new RadarValidationError("Radar scope type is invalid.");
    const missionId = normalizeId(input.missionId, "Mission id");
    const sessionId = scopeType === "session" ? normalizeId(input.sessionId, "Session id") : null;
    if (scopeType === "mission" && input.sessionId != null) throw new RadarValidationError("Mission radar scope cannot include a session id.");
    const id = input.id ? normalizeId(input.id, "Radar assessment id") : nextId();
    if (assessments.has(id)) throw new RadarConflictError(`Radar assessment already exists: ${id}`);
    const contributions = normalizeContributions(input.contributions || [], normalizedDefinition);
    const result = computeResult(normalizedDefinition, contributions);
    const at = timestamp();
    const item = {
      id,
      missionId,
      sessionId,
      scopeType,
      definition: clone(normalizedDefinition),
      contributions,
      result,
      calculationKey: calculationKey(normalizedDefinition, contributions, result),
      justification: normalizeText(input.justification, "Radar justification"),
      status: "active",
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      revision: 1
    };
    assessments.set(id, item);
    emit("radar.assessed", item, options.origin);
    return freezeAssessment(item);
  }

  function recompute(id, input = {}, options = {}) {
    const item = requireAssessment(id);
    if (item.status !== "active") throw new RadarConflictError("Archived radar assessments cannot be recomputed.");
    if (options.expectedRevision != null && item.revision !== options.expectedRevision) {
      throw new RadarConflictError(`Radar assessment revision conflict for ${item.id}.`);
    }
    const contributions = normalizeContributions(input.contributions || item.contributions, normalizedDefinition);
    const result = computeResult(normalizedDefinition, contributions);
    const nextKey = calculationKey(normalizedDefinition, contributions, result);
    const justification = Object.hasOwn(input, "justification")
      ? normalizeText(input.justification, "Radar justification")
      : item.justification;
    if (nextKey === item.calculationKey && justification === item.justification) {
      emit("radar.recompute.skipped", item, options.origin);
      return freezeAssessment(item);
    }
    item.contributions = contributions;
    item.result = result;
    item.calculationKey = nextKey;
    item.justification = justification;
    item.definition = clone(normalizedDefinition);
    item.updatedAt = timestamp();
    item.revision += 1;
    emit("radar.recomputed", item, options.origin);
    return freezeAssessment(item);
  }

  function archiveAssessment(id, options = {}) {
    const item = requireAssessment(id);
    if (item.status === "archived") return freezeAssessment(item);
    if (options.expectedRevision != null && item.revision !== options.expectedRevision) {
      throw new RadarConflictError(`Radar assessment revision conflict for ${item.id}.`);
    }
    const at = timestamp();
    item.status = "archived";
    item.archivedAt = at;
    item.updatedAt = at;
    item.revision += 1;
    emit("radar.archived", item, options.origin);
    return freezeAssessment(item);
  }

  function getAssessment(id) { return freezeAssessment(requireAssessment(id)); }

  function listAssessments({ missionId = null, sessionId = undefined, status = null } = {}) {
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    const session = sessionId === undefined ? undefined : (sessionId == null ? null : normalizeId(sessionId, "Session id"));
    if (status != null && !ASSESSMENT_STATUSES.includes(status)) throw new RadarValidationError("Radar status is invalid.");
    return deepFreeze([...assessments.values()]
      .filter((item) => mission == null || item.missionId === mission)
      .filter((item) => session === undefined || item.sessionId === session)
      .filter((item) => status == null || item.status === status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      .map((item) => clone(item)));
  }

  function snapshot() {
    return deepFreeze({
      schema: "falcon.radar.registry.v1",
      definitionVersion: normalizedDefinition.version,
      assessmentCount: assessments.size,
      assessments: [...assessments.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((item) => clone(item))
    });
  }

  for (const input of initialAssessments) {
    const scopeType = SCOPE_TYPES.includes(input.scopeType) ? input.scopeType : (input.sessionId == null ? "mission" : "session");
    const sessionId = input.sessionId == null ? null : normalizeId(input.sessionId, "Session id");
    if (scopeType === "session" && sessionId == null) throw new RadarValidationError("A session Radar assessment requires a session id.");
    if (scopeType === "mission" && sessionId != null) throw new RadarValidationError("A mission Radar assessment cannot include a session id.");
    const contributions = normalizeContributions(input.contributions || [], normalizedDefinition);
    const result = computeResult(normalizedDefinition, contributions);
    const restored = {
      ...clone(input),
      id: normalizeId(input.id, "Radar assessment id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId,
      scopeType,
      definition: clone(normalizedDefinition),
      contributions,
      result,
      calculationKey: calculationKey(normalizedDefinition, contributions, result),
      justification: normalizeText(input.justification, "Radar justification"),
      status: input.status === "archived" ? "archived" : "active",
      createdAt: String(input.createdAt || timestamp()),
      updatedAt: String(input.updatedAt || input.createdAt || timestamp()),
      archivedAt: input.archivedAt == null ? null : String(input.archivedAt),
      revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1
    };
    if (restored.status === "archived" && restored.archivedAt == null) restored.archivedAt = restored.updatedAt;
    if (assessments.has(restored.id)) throw new RadarConflictError(`Duplicate initial radar assessment: ${restored.id}`);
    assessments.set(restored.id, restored);
  }

  return Object.freeze({
    definition: normalizedDefinition,
    assess,
    recompute,
    archiveAssessment,
    getAssessment,
    listAssessments,
    snapshot
  });
}
