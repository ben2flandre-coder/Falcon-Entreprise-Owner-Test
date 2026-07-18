export const MISSION_ENGINE_VERSION = "V48.0.0-dev";

export const MISSION_STATUSES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  ARCHIVED: "archived"
});

export const MISSION_FOLDER_STANDARD = Object.freeze([
  "Mission.falcon",
  "Photos/",
  "Audio/",
  "Videos/",
  "Documents/",
  "IA/",
  "Rapports/",
  "Exports/",
  "Historique/",
  "Archives/"
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MUTABLE_FIELDS = Object.freeze([
  "name",
  "clientName",
  "scope",
  "unit",
  "site",
  "startDate",
  "dueDate",
  "confidentiality",
  "tags"
]);

const TRANSITIONS = Object.freeze({
  [MISSION_STATUSES.DRAFT]: Object.freeze([MISSION_STATUSES.ACTIVE]),
  [MISSION_STATUSES.ACTIVE]: Object.freeze([MISSION_STATUSES.PAUSED, MISSION_STATUSES.COMPLETED]),
  [MISSION_STATUSES.PAUSED]: Object.freeze([MISSION_STATUSES.ACTIVE, MISSION_STATUSES.COMPLETED]),
  [MISSION_STATUSES.COMPLETED]: Object.freeze([MISSION_STATUSES.ACTIVE]),
  [MISSION_STATUSES.ARCHIVED]: Object.freeze([])
});

export class MissionEngineError extends Error {
  constructor(message, code = "MISSION_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class MissionValidationError extends MissionEngineError {
  constructor(message) {
    super(message, "MISSION_VALIDATION_ERROR");
  }
}

export class MissionAuthorizationError extends MissionEngineError {
  constructor(permission) {
    super(`Mission permission denied: ${permission}`, "MISSION_AUTHORIZATION_ERROR");
    this.permission = permission;
  }
}

export class MissionConflictError extends MissionEngineError {
  constructor(message) {
    super(message, "MISSION_CONFLICT_ERROR");
  }
}

export class MissionTransitionError extends MissionEngineError {
  constructor(message) {
    super(message, "MISSION_TRANSITION_ERROR");
  }
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value, label, { required = false, max = 500 } = {}) {
  const normalized = value == null ? "" : String(value).trim();
  if (required && !normalized) throw new MissionValidationError(`${label} is required.`);
  if (normalized.length > max) throw new MissionValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function dateValue(value, label) {
  if (value == null || value === "") return "";
  const normalized = String(value).trim();
  if (!DATE_PATTERN.test(normalized)) throw new MissionValidationError(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new MissionValidationError(`${label} is not a valid date.`);
  }
  return normalized;
}

function tagsValue(value) {
  if (value == null || value === "") return [];
  const source = Array.isArray(value) ? value : String(value).split(",");
  const output = [];
  const seen = new Set();
  for (const item of source) {
    const tag = text(item, "Mission tag", { max: 40 });
    if (!tag) continue;
    const key = tag.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(tag);
    if (output.length > 20) throw new MissionValidationError("A mission supports at most 20 tags.");
  }
  return output;
}

function missionId(value) {
  if (typeof value !== "string") throw new MissionValidationError("Mission id must be a string.");
  const normalized = value.trim().toLowerCase();
  if (!ID_PATTERN.test(normalized)) throw new MissionValidationError(`Mission id is invalid: ${value}`);
  return normalized;
}

function statusValue(value) {
  if (!Object.values(MISSION_STATUSES).includes(value)) {
    throw new MissionValidationError(`Unknown mission status: ${value}`);
  }
  return value;
}

function revisionValue(value) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new MissionValidationError("Expected revision must be a positive integer.");
  }
  return value;
}

function missionFields(input, current = null) {
  if (!isRecord(input)) throw new MissionValidationError("Mission input must be an object.");

  const field = (name, resolver, fallback = "") => (
    Object.hasOwn(input, name) ? resolver(input[name]) : current?.[name] ?? fallback
  );

  const fields = {
    name: field("name", (value) => text(value, "Mission name", { required: true, max: 160 })),
    clientName: field("clientName", (value) => text(value, "Client name", { max: 160 })),
    scope: field("scope", (value) => text(value, "Mission scope", { max: 1000 })),
    unit: field("unit", (value) => text(value, "Mission unit", { max: 160 })),
    site: field("site", (value) => text(value, "Mission site", { max: 200 })),
    startDate: field("startDate", (value) => dateValue(value, "Mission start date")),
    dueDate: field("dueDate", (value) => dateValue(value, "Mission due date")),
    confidentiality: field("confidentiality", (value) => text(value, "Mission confidentiality", { max: 120 }), "Document de travail"),
    tags: Object.hasOwn(input, "tags") ? tagsValue(input.tags) : [...(current?.tags || [])]
  };

  if (!fields.name) throw new MissionValidationError("Mission name is required.");
  if (fields.startDate && fields.dueDate && fields.dueDate < fields.startDate) {
    throw new MissionValidationError("Mission due date cannot precede the start date.");
  }
  return fields;
}

function slug(value) {
  return String(value || "mission")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "mission";
}

function cloneMission(mission) {
  return mission ? { ...mission, tags: [...mission.tags] } : null;
}

function freezeMission(mission) {
  if (!mission) return null;
  const copy = cloneMission(mission);
  copy.tags = Object.freeze(copy.tags);
  return Object.freeze(copy);
}

function cloneError(error) {
  return error ? Object.freeze({
    name: error.name || "Error",
    code: error.code || null,
    message: error.message || String(error)
  }) : null;
}

export function createMissionEngine({
  initialMissions = [],
  initialActiveMissionId = null,
  authorize = () => true,
  onChange = () => {},
  now = () => new Date().toISOString(),
  idGenerator = null,
  journalLimit = 160
} = {}) {
  if (!Array.isArray(initialMissions)) throw new MissionValidationError("Initial missions must be an array.");
  if (typeof authorize !== "function") throw new TypeError("Mission authorizer must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Mission change hook must be a function.");
  if (typeof now !== "function") throw new TypeError("Mission clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Mission id generator must be a function.");
  if (!Number.isInteger(journalLimit) || journalLimit < 1) throw new RangeError("Mission journal limit must be a positive integer.");

  const state = { missions: new Map(), activeMissionId: null, sequence: 0 };
  const journal = [];
  let mutating = false;

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function trace(status, details = {}) {
    journal.unshift(Object.freeze({
      at: timestamp(),
      status,
      action: details.action || "mission.read",
      missionId: details.missionId || null,
      revision: details.revision ?? null,
      origin: details.origin || "runtime",
      error: cloneError(details.error)
    }));
    if (journal.length > journalLimit) journal.length = journalLimit;
  }

  function authorizeOrThrow(permission, context = {}) {
    let allowed = false;
    try {
      allowed = authorize(permission, Object.freeze({ ...context })) === true;
    } catch (error) {
      trace("authorization-failed", { action: permission, missionId: context.missionId, origin: context.origin, error });
      throw new MissionAuthorizationError(permission);
    }
    if (!allowed) {
      const error = new MissionAuthorizationError(permission);
      trace("denied", { action: permission, missionId: context.missionId, origin: context.origin, error });
      throw error;
    }
  }

  function requireMission(id) {
    const normalized = missionId(id);
    const mission = state.missions.get(normalized);
    if (!mission) throw new MissionValidationError(`Mission not found: ${normalized}`);
    return mission;
  }

  function checkRevision(mission, expectedRevision) {
    const expected = revisionValue(expectedRevision);
    if (expected != null && mission.revision !== expected) {
      throw new MissionConflictError(
        `Mission revision conflict for ${mission.id}: expected ${expected}, current ${mission.revision}.`
      );
    }
  }

  function internalSnapshot() {
    return {
      missions: new Map([...state.missions].map(([id, mission]) => [id, cloneMission(mission)])),
      activeMissionId: state.activeMissionId,
      sequence: state.sequence
    };
  }

  function restore(snapshot) {
    state.missions.clear();
    for (const [id, mission] of snapshot.missions) state.missions.set(id, cloneMission(mission));
    state.activeMissionId = snapshot.activeMissionId;
    state.sequence = snapshot.sequence;
  }

  function publicSnapshot() {
    return Object.freeze({
      schema: "falcon.mission.registry.v1",
      engineVersion: MISSION_ENGINE_VERSION,
      activeMissionId: state.activeMissionId,
      missionCount: state.missions.size,
      missions: Object.freeze(
        [...state.missions.values()]
          .map(freezeMission)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      )
    });
  }

  function commit({ permission, action, missionId: targetId = null, origin = "runtime", mutate }) {
    if (mutating) throw new MissionConflictError("Nested mission mutation is not allowed.");
    authorizeOrThrow(permission, { action, missionId: targetId, origin });
    const before = internalSnapshot();
    mutating = true;
    try {
      const result = mutate();
      const resolvedId = result?.id || targetId || null;
      const revision = result?.revision ?? null;
      const event = Object.freeze({
        schema: "falcon.mission.event.v1",
        at: timestamp(),
        action,
        permission,
        missionId: resolvedId,
        revision,
        origin
      });
      onChange(event, publicSnapshot());
      trace("committed", { action, missionId: resolvedId, revision, origin });
      return result;
    } catch (error) {
      restore(before);
      trace("rolled-back", { action, missionId: targetId, origin, error });
      throw error;
    } finally {
      mutating = false;
    }
  }

  function createMission(input, options = {}) {
    const safe = isRecord(options) ? options : {};
    return commit({
      permission: "mission.create",
      action: "mission.create",
      origin: safe.origin || "runtime",
      mutate: () => {
        const fields = missionFields(input);
        state.sequence += 1;
        const at = timestamp();
        const generated = input?.id
          ? missionId(input.id)
          : missionId(idGenerator
            ? idGenerator(Object.freeze({ name: fields.name, clientName: fields.clientName, sequence: state.sequence, at }))
            : `mission-${at.slice(0, 10).replace(/-/g, "")}-${slug(fields.clientName || fields.name)}-${state.sequence}`);
        if (state.missions.has(generated)) throw new MissionConflictError(`Mission id already exists: ${generated}`);

        const mission = {
          id: generated,
          ...fields,
          status: MISSION_STATUSES.DRAFT,
          previousStatus: null,
          createdAt: at,
          updatedAt: at,
          archivedAt: null,
          archiveReason: "",
          revision: 1
        };
        state.missions.set(generated, mission);
        if (safe.activate === true) state.activeMissionId = generated;
        return freezeMission(mission);
      }
    });
  }

  function getMission(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    authorizeOrThrow("mission.read", { action: "mission.read", missionId: normalized, origin: safe.origin || "runtime" });
    const mission = requireMission(normalized);
    trace("read", { action: "mission.read", missionId: mission.id, revision: mission.revision, origin: safe.origin || "runtime" });
    return freezeMission(mission);
  }

  function listMissions(options = {}) {
    const safe = isRecord(options) ? options : {};
    authorizeOrThrow("mission.read", { action: "mission.list", origin: safe.origin || "runtime" });
    const filterStatus = safe.status == null ? null : statusValue(safe.status);
    const includeArchived = safe.includeArchived !== false;
    const items = [...state.missions.values()]
      .filter((mission) => filterStatus ? mission.status === filterStatus : true)
      .filter((mission) => includeArchived || mission.status !== MISSION_STATUSES.ARCHIVED)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(freezeMission);
    trace("read", { action: "mission.list", origin: safe.origin || "runtime" });
    return Object.freeze(items);
  }

  function updateMission(id, patch, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    return commit({
      permission: "mission.update",
      action: "mission.update",
      missionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const mission = requireMission(normalized);
        checkRevision(mission, safe.expectedRevision);
        if (mission.status === MISSION_STATUSES.ARCHIVED) {
          throw new MissionTransitionError("Archived missions must be restored before update.");
        }
        if (!isRecord(patch)) throw new MissionValidationError("Mission patch must be an object.");
        const unsupported = Object.keys(patch).filter((field) => !MUTABLE_FIELDS.includes(field));
        if (unsupported.length) {
          throw new MissionValidationError(`Mission patch contains unsupported fields: ${unsupported.join(", ")}`);
        }
        Object.assign(mission, missionFields(patch, mission));
        mission.updatedAt = timestamp();
        mission.revision += 1;
        return freezeMission(mission);
      }
    });
  }

  function transitionMission(id, nextStatus, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    const target = statusValue(nextStatus);
    if (target === MISSION_STATUSES.ARCHIVED) {
      throw new MissionTransitionError("Use archiveMission() to archive a mission.");
    }
    return commit({
      permission: "mission.update",
      action: "mission.transition",
      missionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const mission = requireMission(normalized);
        checkRevision(mission, safe.expectedRevision);
        const allowed = TRANSITIONS[mission.status] || [];
        if (!allowed.includes(target)) {
          throw new MissionTransitionError(`Mission transition is not allowed: ${mission.status} -> ${target}.`);
        }
        mission.status = target;
        mission.updatedAt = timestamp();
        mission.revision += 1;
        return freezeMission(mission);
      }
    });
  }

  function activateMission(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    return commit({
      permission: "mission.read",
      action: "mission.activate",
      missionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const mission = requireMission(normalized);
        if (mission.status === MISSION_STATUSES.ARCHIVED) {
          throw new MissionTransitionError("An archived mission cannot become the active mission.");
        }
        state.activeMissionId = mission.id;
        return freezeMission(mission);
      }
    });
  }

  function archiveMission(id, reason = "", options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    return commit({
      permission: "mission.archive",
      action: "mission.archive",
      missionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const mission = requireMission(normalized);
        checkRevision(mission, safe.expectedRevision);
        if (mission.status === MISSION_STATUSES.ARCHIVED) throw new MissionTransitionError("Mission is already archived.");
        mission.previousStatus = mission.status;
        mission.status = MISSION_STATUSES.ARCHIVED;
        mission.archiveReason = text(reason, "Archive reason", { max: 500 });
        mission.archivedAt = timestamp();
        mission.updatedAt = mission.archivedAt;
        mission.revision += 1;
        if (state.activeMissionId === mission.id) state.activeMissionId = null;
        return freezeMission(mission);
      }
    });
  }

  function restoreMission(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    return commit({
      permission: "mission.restore",
      action: "mission.restore",
      missionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const mission = requireMission(normalized);
        checkRevision(mission, safe.expectedRevision);
        if (mission.status !== MISSION_STATUSES.ARCHIVED) {
          throw new MissionTransitionError("Only archived missions can be restored.");
        }
        mission.status = mission.previousStatus && mission.previousStatus !== MISSION_STATUSES.ARCHIVED
          ? mission.previousStatus
          : MISSION_STATUSES.DRAFT;
        mission.previousStatus = null;
        mission.archivedAt = null;
        mission.archiveReason = "";
        mission.updatedAt = timestamp();
        mission.revision += 1;
        return freezeMission(mission);
      }
    });
  }

  function deleteMission(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    return commit({
      permission: "mission.delete",
      action: "mission.delete",
      missionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const mission = requireMission(normalized);
        checkRevision(mission, safe.expectedRevision);
        if (mission.status !== MISSION_STATUSES.ARCHIVED) {
          throw new MissionTransitionError("A mission must be archived before deletion.");
        }
        state.missions.delete(normalized);
        if (state.activeMissionId === normalized) state.activeMissionId = null;
        return freezeMission(mission);
      }
    });
  }

  function activeMission(options = {}) {
    const safe = isRecord(options) ? options : {};
    authorizeOrThrow("mission.read", {
      action: "mission.active",
      missionId: state.activeMissionId,
      origin: safe.origin || "runtime"
    });
    const mission = state.activeMissionId ? state.missions.get(state.activeMissionId) : null;
    trace("read", {
      action: "mission.active",
      missionId: mission?.id || null,
      revision: mission?.revision ?? null,
      origin: safe.origin || "runtime"
    });
    return freezeMission(mission);
  }

  function exportMission(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = missionId(id);
    authorizeOrThrow("mission.export", {
      action: "mission.export",
      missionId: normalized,
      origin: safe.origin || "runtime"
    });
    const mission = requireMission(normalized);
    const counters = isRecord(safe.counters)
      ? Object.fromEntries(
          Object.entries(safe.counters)
            .filter(([, value]) => Number.isInteger(value) && value >= 0)
            .map(([key, value]) => [String(key), value])
        )
      : {};
    const manifest = Object.freeze({
      schema: "falcon.mission.manifest.v1",
      manifestVersion: "1.0",
      engineVersion: MISSION_ENGINE_VERSION,
      generatedAt: timestamp(),
      mission: freezeMission(mission),
      folderStandard: MISSION_FOLDER_STANDARD,
      counters: Object.freeze(counters),
      integrity: Object.freeze({
        portable: true,
        externalDependency: false,
        note: "Mission metadata only. Sessions, documents, media and business records remain separate responsibilities."
      })
    });
    trace("exported", {
      action: "mission.export",
      missionId: mission.id,
      revision: mission.revision,
      origin: safe.origin || "runtime"
    });
    return manifest;
  }

  function snapshot(options = {}) {
    const safe = isRecord(options) ? options : {};
    authorizeOrThrow("mission.read", { action: "mission.snapshot", origin: safe.origin || "runtime" });
    trace("read", { action: "mission.snapshot", origin: safe.origin || "runtime" });
    return publicSnapshot();
  }

  function recentEvents() {
    return journal.map((entry) => ({ ...entry, error: entry.error ? { ...entry.error } : null }));
  }

  for (const item of initialMissions) {
    if (!isRecord(item)) throw new MissionValidationError("Initial mission entries must be objects.");
    const id = missionId(item.id);
    if (state.missions.has(id)) throw new MissionConflictError(`Duplicate initial mission id: ${id}`);
    const fields = missionFields(item);
    const status = statusValue(item.status || MISSION_STATUSES.DRAFT);
    const createdAt = text(item.createdAt || timestamp(), "Mission createdAt", { required: true, max: 64 });
    const updatedAt = text(item.updatedAt || createdAt, "Mission updatedAt", { required: true, max: 64 });
    const revision = Number.isInteger(item.revision) && item.revision > 0 ? item.revision : 1;
    state.missions.set(id, {
      id,
      ...fields,
      status,
      previousStatus: item.previousStatus && item.previousStatus !== MISSION_STATUSES.ARCHIVED
        ? statusValue(item.previousStatus)
        : null,
      createdAt,
      updatedAt,
      archivedAt: status === MISSION_STATUSES.ARCHIVED
        ? text(item.archivedAt || updatedAt, "Mission archivedAt", { required: true, max: 64 })
        : null,
      archiveReason: status === MISSION_STATUSES.ARCHIVED
        ? text(item.archiveReason, "Archive reason", { max: 500 })
        : "",
      revision
    });
    state.sequence += 1;
  }

  if (initialActiveMissionId != null) {
    const normalized = missionId(initialActiveMissionId);
    const mission = state.missions.get(normalized);
    if (!mission) throw new MissionValidationError(`Initial active mission is not registered: ${normalized}`);
    if (mission.status === MISSION_STATUSES.ARCHIVED) {
      throw new MissionTransitionError("Initial active mission cannot be archived.");
    }
    state.activeMissionId = normalized;
  }

  return Object.freeze({
    createMission,
    getMission,
    listMissions,
    updateMission,
    transitionMission,
    activateMission,
    archiveMission,
    restoreMission,
    deleteMission,
    activeMission,
    exportMission,
    snapshot,
    recentEvents
  });
}
