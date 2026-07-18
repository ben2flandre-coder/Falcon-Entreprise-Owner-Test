export const OBSERVATION_ENGINE_VERSION = "V48.0.0-dev";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const OBSERVATION_STATUSES = Object.freeze(["draft", "validated", "closed", "archived"]);
const OBSERVATION_KINDS = Object.freeze(["fact", "hazard", "nonconformity", "good-practice", "signal"]);
const OBSERVATION_SEVERITIES = Object.freeze(["low", "moderate", "high", "critical"]);

export class ObservationEngineError extends Error {
  constructor(message, code = "OBSERVATION_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ObservationValidationError extends ObservationEngineError {
  constructor(message) { super(message, "OBSERVATION_VALIDATION_ERROR"); }
}

export class ObservationConflictError extends ObservationEngineError {
  constructor(message) { super(message, "OBSERVATION_CONFLICT_ERROR"); }
}

export class ObservationTransitionError extends ObservationEngineError {
  constructor(message) { super(message, "OBSERVATION_TRANSITION_ERROR"); }
}

function normalizeId(value, label, { nullable = false } = {}) {
  if (nullable && (value == null || value === "")) return null;
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new ObservationValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeText(value, label, { required = false, max = 2000 } = {}) {
  const normalized = value == null ? "" : String(value).trim();
  if (required && !normalized) throw new ObservationValidationError(`${label} is required.`);
  if (normalized.length > max) throw new ObservationValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function enumValue(value, allowed, label, fallback) {
  const normalized = String(value ?? fallback).trim();
  if (!allowed.includes(normalized)) throw new ObservationValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeTags(value) {
  if (value == null || value === "") return [];
  const source = Array.isArray(value) ? value : String(value).split(",");
  const output = [];
  const seen = new Set();
  for (const item of source) {
    const tag = normalizeText(item, "Observation tag", { max: 40 });
    if (!tag) continue;
    const key = tag.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(tag);
    if (output.length > 20) throw new ObservationValidationError("An observation supports at most 20 tags.");
  }
  return output;
}

function cloneObservation(observation) {
  return observation ? { ...observation, tags: [...observation.tags] } : null;
}

function freezeObservation(observation) {
  const copy = cloneObservation(observation);
  copy.tags = Object.freeze(copy.tags);
  return Object.freeze(copy);
}

export function createObservationEngine({
  initialObservations = [],
  now = () => new Date().toISOString(),
  idGenerator = null,
  onChange = () => {}
} = {}) {
  if (!Array.isArray(initialObservations)) throw new ObservationValidationError("Initial observations must be an array.");
  if (typeof now !== "function") throw new TypeError("Observation clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Observation id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Observation change hook must be a function.");

  const observations = new Map();
  let sequence = 0;

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function nextId() {
    return idGenerator ? normalizeId(idGenerator(), "Observation id") : `observation-${++sequence}`;
  }

  function requireObservation(id) {
    const normalized = normalizeId(id, "Observation id");
    const observation = observations.get(normalized);
    if (!observation) throw new ObservationValidationError(`Observation not found: ${normalized}`);
    return observation;
  }

  function checkRevision(observation, expectedRevision) {
    if (expectedRevision == null) return;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new ObservationValidationError("Expected revision must be a positive integer.");
    }
    if (observation.revision !== expectedRevision) {
      throw new ObservationConflictError(`Observation revision conflict for ${observation.id}.`);
    }
  }

  function emit(action, observation, origin) {
    onChange(Object.freeze({ action, observation: freezeObservation(observation), origin: origin || "runtime" }));
  }

  function createObservation(input = {}, options = {}) {
    const missionId = normalizeId(input.missionId, "Mission id");
    const sessionId = normalizeId(input.sessionId, "Session id", { nullable: true });
    const folderId = normalizeId(input.folderId, "Folder id", { nullable: true });
    if (folderId && !sessionId && input.folderScope === "session") {
      throw new ObservationValidationError("A session-scoped folder requires a session id.");
    }
    const id = input.id ? normalizeId(input.id, "Observation id") : nextId();
    if (observations.has(id)) throw new ObservationConflictError(`Observation already exists: ${id}`);
    const at = timestamp();
    const observation = {
      id,
      missionId,
      sessionId,
      folderId,
      title: normalizeText(input.title, "Observation title", { required: true, max: 180 }),
      description: normalizeText(input.description, "Observation description", { max: 4000 }),
      location: normalizeText(input.location, "Observation location", { max: 240 }),
      kind: enumValue(input.kind, OBSERVATION_KINDS, "Observation kind", "fact"),
      severity: enumValue(input.severity, OBSERVATION_SEVERITIES, "Observation severity", "moderate"),
      status: "draft",
      tags: normalizeTags(input.tags),
      createdAt: at,
      updatedAt: at,
      validatedAt: null,
      closedAt: null,
      archivedAt: null,
      revision: 1
    };
    observations.set(id, observation);
    emit("observation.created", observation, options.origin);
    return freezeObservation(observation);
  }

  function updateObservation(id, patch = {}, options = {}) {
    const observation = requireObservation(id);
    checkRevision(observation, options.expectedRevision);
    if (observation.status !== "draft") {
      throw new ObservationTransitionError("Only draft observations can be edited.");
    }
    if (Object.hasOwn(patch, "title")) observation.title = normalizeText(patch.title, "Observation title", { required: true, max: 180 });
    if (Object.hasOwn(patch, "description")) observation.description = normalizeText(patch.description, "Observation description", { max: 4000 });
    if (Object.hasOwn(patch, "location")) observation.location = normalizeText(patch.location, "Observation location", { max: 240 });
    if (Object.hasOwn(patch, "kind")) observation.kind = enumValue(patch.kind, OBSERVATION_KINDS, "Observation kind", observation.kind);
    if (Object.hasOwn(patch, "severity")) observation.severity = enumValue(patch.severity, OBSERVATION_SEVERITIES, "Observation severity", observation.severity);
    if (Object.hasOwn(patch, "tags")) observation.tags = normalizeTags(patch.tags);
    observation.updatedAt = timestamp();
    observation.revision += 1;
    emit("observation.updated", observation, options.origin);
    return freezeObservation(observation);
  }

  function transition(id, targetStatus, options = {}) {
    const observation = requireObservation(id);
    checkRevision(observation, options.expectedRevision);
    const target = enumValue(targetStatus, OBSERVATION_STATUSES, "Observation status", observation.status);
    const allowed = {
      draft: ["validated", "archived"],
      validated: ["closed", "archived"],
      closed: ["archived"],
      archived: []
    }[observation.status];
    if (!allowed.includes(target)) {
      throw new ObservationTransitionError(`Invalid observation transition: ${observation.status} -> ${target}`);
    }
    const at = timestamp();
    observation.status = target;
    observation.updatedAt = at;
    observation.revision += 1;
    if (target === "validated") observation.validatedAt = at;
    if (target === "closed") observation.closedAt = at;
    if (target === "archived") observation.archivedAt = at;
    emit(`observation.${target}`, observation, options.origin);
    return freezeObservation(observation);
  }

  function getObservation(id) {
    return freezeObservation(requireObservation(id));
  }

  function listObservations({ missionId = null, sessionId = undefined, folderId = undefined, status = null } = {}) {
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    const session = sessionId === undefined ? undefined : normalizeId(sessionId, "Session id", { nullable: true });
    const folder = folderId === undefined ? undefined : normalizeId(folderId, "Folder id", { nullable: true });
    const normalizedStatus = status == null ? null : enumValue(status, OBSERVATION_STATUSES, "Observation status", status);
    return Object.freeze([...observations.values()]
      .filter((item) => mission == null || item.missionId === mission)
      .filter((item) => session === undefined || item.sessionId === session)
      .filter((item) => folder === undefined || item.folderId === folder)
      .filter((item) => normalizedStatus == null || item.status === normalizedStatus)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
      .map(freezeObservation));
  }

  function snapshot() {
    return Object.freeze({
      schema: "falcon.observation.registry.v1",
      observationCount: observations.size,
      observations: Object.freeze([...observations.values()].map(freezeObservation))
    });
  }

  for (const input of initialObservations) {
    const observation = {
      id: normalizeId(input.id, "Observation id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: normalizeId(input.sessionId, "Session id", { nullable: true }),
      folderId: normalizeId(input.folderId, "Folder id", { nullable: true }),
      title: normalizeText(input.title, "Observation title", { required: true, max: 180 }),
      description: normalizeText(input.description, "Observation description", { max: 4000 }),
      location: normalizeText(input.location, "Observation location", { max: 240 }),
      kind: enumValue(input.kind, OBSERVATION_KINDS, "Observation kind", "fact"),
      severity: enumValue(input.severity, OBSERVATION_SEVERITIES, "Observation severity", "moderate"),
      status: enumValue(input.status, OBSERVATION_STATUSES, "Observation status", "draft"),
      tags: normalizeTags(input.tags),
      createdAt: String(input.createdAt || timestamp()),
      updatedAt: String(input.updatedAt || input.createdAt || timestamp()),
      validatedAt: input.validatedAt == null ? null : String(input.validatedAt),
      closedAt: input.closedAt == null ? null : String(input.closedAt),
      archivedAt: input.archivedAt == null ? null : String(input.archivedAt),
      revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1
    };
    if (observations.has(observation.id)) throw new ObservationConflictError(`Duplicate initial observation: ${observation.id}`);
    observations.set(observation.id, observation);
  }

  return Object.freeze({
    createObservation,
    updateObservation,
    validateObservation: (id, options = {}) => transition(id, "validated", options),
    closeObservation: (id, options = {}) => transition(id, "closed", options),
    archiveObservation: (id, options = {}) => transition(id, "archived", options),
    getObservation,
    listObservations,
    snapshot
  });
}
