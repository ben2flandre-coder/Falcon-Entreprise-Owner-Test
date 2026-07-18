export const SESSION_ENGINE_VERSION = "V48.0.0-dev";

export const SESSION_STATUSES = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  PAUSED: "paused",
  CLOSED: "closed",
  ARCHIVED: "archived"
});

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const TRANSITIONS = Object.freeze({
  [SESSION_STATUSES.DRAFT]: Object.freeze([SESSION_STATUSES.OPEN]),
  [SESSION_STATUSES.OPEN]: Object.freeze([SESSION_STATUSES.PAUSED, SESSION_STATUSES.CLOSED]),
  [SESSION_STATUSES.PAUSED]: Object.freeze([SESSION_STATUSES.OPEN, SESSION_STATUSES.CLOSED]),
  [SESSION_STATUSES.CLOSED]: Object.freeze([]),
  [SESSION_STATUSES.ARCHIVED]: Object.freeze([])
});

export class SessionEngineError extends Error {
  constructor(message, code = "SESSION_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class SessionValidationError extends SessionEngineError {
  constructor(message) { super(message, "SESSION_VALIDATION_ERROR"); }
}

export class SessionAuthorizationError extends SessionEngineError {
  constructor(permission) {
    super(`Session permission denied: ${permission}`, "SESSION_AUTHORIZATION_ERROR");
    this.permission = permission;
  }
}

export class SessionConflictError extends SessionEngineError {
  constructor(message) { super(message, "SESSION_CONFLICT_ERROR"); }
}

export class SessionTransitionError extends SessionEngineError {
  constructor(message) { super(message, "SESSION_TRANSITION_ERROR"); }
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeId(value, label) {
  if (typeof value !== "string") throw new SessionValidationError(`${label} must be a string.`);
  const normalized = value.trim().toLowerCase();
  if (!ID_PATTERN.test(normalized)) throw new SessionValidationError(`${label} is invalid: ${value}`);
  return normalized;
}

function text(value, label, { required = false, max = 500 } = {}) {
  const normalized = value == null ? "" : String(value).trim();
  if (required && !normalized) throw new SessionValidationError(`${label} is required.`);
  if (normalized.length > max) throw new SessionValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function revision(value) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new SessionValidationError("Expected revision must be a positive integer.");
  }
  return value;
}

function status(value) {
  if (!Object.values(SESSION_STATUSES).includes(value)) {
    throw new SessionValidationError(`Unknown session status: ${value}`);
  }
  return value;
}

function cloneSession(session) {
  return session ? { ...session } : null;
}

function freezeSession(session) {
  return session ? Object.freeze(cloneSession(session)) : null;
}

function cloneError(error) {
  return error ? Object.freeze({
    name: error.name || "Error",
    code: error.code || null,
    message: error.message || String(error)
  }) : null;
}

export function createSessionEngine({
  initialSessions = [],
  initialActiveSessionId = null,
  authorize = () => true,
  onChange = () => {},
  now = () => new Date().toISOString(),
  idGenerator = null,
  journalLimit = 160
} = {}) {
  if (!Array.isArray(initialSessions)) throw new SessionValidationError("Initial sessions must be an array.");
  if (typeof authorize !== "function") throw new TypeError("Session authorizer must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Session change hook must be a function.");
  if (typeof now !== "function") throw new TypeError("Session clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Session id generator must be a function.");
  if (!Number.isInteger(journalLimit) || journalLimit < 1) throw new RangeError("Session journal limit must be a positive integer.");

  const state = { sessions: new Map(), activeSessionId: null, sequence: 0 };
  const journal = [];
  let mutating = false;

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function trace(entryStatus, details = {}) {
    journal.unshift(Object.freeze({
      at: timestamp(),
      status: entryStatus,
      action: details.action || "session.read",
      sessionId: details.sessionId || null,
      missionId: details.missionId || null,
      revision: details.revision ?? null,
      origin: details.origin || "runtime",
      error: cloneError(details.error)
    }));
    if (journal.length > journalLimit) journal.length = journalLimit;
  }

  function authorizeOrThrow(permission, context = {}) {
    let allowed = false;
    try { allowed = authorize(permission, Object.freeze({ ...context })) === true; }
    catch (error) {
      trace("authorization-failed", { action: permission, ...context, error });
      throw new SessionAuthorizationError(permission);
    }
    if (!allowed) {
      const error = new SessionAuthorizationError(permission);
      trace("denied", { action: permission, ...context, error });
      throw error;
    }
  }

  function requireSession(id) {
    const normalized = normalizeId(id, "Session id");
    const session = state.sessions.get(normalized);
    if (!session) throw new SessionValidationError(`Session not found: ${normalized}`);
    return session;
  }

  function checkRevision(session, expectedRevision) {
    const expected = revision(expectedRevision);
    if (expected != null && expected !== session.revision) {
      throw new SessionConflictError(
        `Session revision conflict for ${session.id}: expected ${expected}, current ${session.revision}.`
      );
    }
  }

  function publicSnapshot() {
    return Object.freeze({
      schema: "falcon.session.registry.v1",
      engineVersion: SESSION_ENGINE_VERSION,
      activeSessionId: state.activeSessionId,
      sessionCount: state.sessions.size,
      sessions: Object.freeze([...state.sessions.values()]
        .map(freezeSession)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))
    });
  }

  function internalSnapshot() {
    return {
      sessions: new Map([...state.sessions].map(([id, session]) => [id, cloneSession(session)])),
      activeSessionId: state.activeSessionId,
      sequence: state.sequence
    };
  }

  function restore(snapshot) {
    state.sessions.clear();
    for (const [id, session] of snapshot.sessions) state.sessions.set(id, cloneSession(session));
    state.activeSessionId = snapshot.activeSessionId;
    state.sequence = snapshot.sequence;
  }

  function commit({ permission, action, sessionId = null, missionId = null, origin = "runtime", mutate }) {
    if (mutating) throw new SessionConflictError("Nested session mutation is not allowed.");
    authorizeOrThrow(permission, { action, sessionId, missionId, origin });
    const before = internalSnapshot();
    mutating = true;
    try {
      const result = mutate();
      const event = Object.freeze({
        schema: "falcon.session.event.v1",
        at: timestamp(),
        action,
        permission,
        sessionId: result?.id || sessionId,
        missionId: result?.missionId || missionId,
        revision: result?.revision ?? null,
        origin
      });
      onChange(event, publicSnapshot());
      trace("committed", { action, sessionId: event.sessionId, missionId: event.missionId, revision: event.revision, origin });
      return result;
    } catch (error) {
      restore(before);
      trace("rolled-back", { action, sessionId, missionId, origin, error });
      throw error;
    } finally {
      mutating = false;
    }
  }

  function createSession(input, options = {}) {
    if (!isRecord(input)) throw new SessionValidationError("Session input must be an object.");
    const safe = isRecord(options) ? options : {};
    const missionId = normalizeId(input.missionId, "Mission id");
    return commit({
      permission: "session.create",
      action: "session.create",
      missionId,
      origin: safe.origin || "runtime",
      mutate: () => {
        state.sequence += 1;
        const at = timestamp();
        const generated = input.id
          ? normalizeId(input.id, "Session id")
          : normalizeId(idGenerator
            ? idGenerator(Object.freeze({ missionId, sequence: state.sequence, at }))
            : `session-${at.slice(0, 10).replace(/-/g, "")}-${state.sequence}`,
          "Session id");
        if (state.sessions.has(generated)) throw new SessionConflictError(`Session id already exists: ${generated}`);
        const session = {
          id: generated,
          missionId,
          name: text(input.name, "Session name", { required: true, max: 160 }),
          companyId: text(input.companyId, "Company id", { max: 120 }),
          folderId: text(input.folderId, "Folder id", { max: 120 }),
          userId: text(input.userId, "User id", { max: 160 }),
          schemaVersion: text(input.schemaVersion || "1.0", "Schema version", { required: true, max: 32 }),
          status: SESSION_STATUSES.DRAFT,
          dirty: false,
          createdAt: at,
          updatedAt: at,
          closedAt: null,
          archivedAt: null,
          revision: 1
        };
        state.sessions.set(generated, session);
        if (safe.activate === true) state.activeSessionId = generated;
        return freezeSession(session);
      }
    });
  }

  function transitionSession(id, nextStatus, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = normalizeId(id, "Session id");
    const target = status(nextStatus);
    if (target === SESSION_STATUSES.ARCHIVED) {
      throw new SessionTransitionError("Use archiveSession() to archive a session.");
    }
    return commit({
      permission: "session.update",
      action: "session.transition",
      sessionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const session = requireSession(normalized);
        checkRevision(session, safe.expectedRevision);
        const allowed = TRANSITIONS[session.status] || [];
        if (!allowed.includes(target)) {
          throw new SessionTransitionError(`Session transition is not allowed: ${session.status} -> ${target}.`);
        }
        session.status = target;
        session.updatedAt = timestamp();
        session.closedAt = target === SESSION_STATUSES.CLOSED ? session.updatedAt : null;
        session.revision += 1;
        if (target === SESSION_STATUSES.CLOSED && state.activeSessionId === session.id) state.activeSessionId = null;
        return freezeSession(session);
      }
    });
  }

  function activateSession(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = normalizeId(id, "Session id");
    return commit({
      permission: "session.activate",
      action: "session.activate",
      sessionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const session = requireSession(normalized);
        if ([SESSION_STATUSES.CLOSED, SESSION_STATUSES.ARCHIVED].includes(session.status)) {
          throw new SessionTransitionError("Closed or archived sessions cannot become active.");
        }
        state.activeSessionId = session.id;
        return freezeSession(session);
      }
    });
  }

  function markDirty(id, dirty = true, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = normalizeId(id, "Session id");
    return commit({
      permission: "session.update",
      action: dirty ? "session.dirty" : "session.clean",
      sessionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const session = requireSession(normalized);
        checkRevision(session, safe.expectedRevision);
        if ([SESSION_STATUSES.CLOSED, SESSION_STATUSES.ARCHIVED].includes(session.status)) {
          throw new SessionTransitionError("Closed or archived sessions cannot change dirty state.");
        }
        session.dirty = Boolean(dirty);
        session.updatedAt = timestamp();
        session.revision += 1;
        return freezeSession(session);
      }
    });
  }

  function archiveSession(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = normalizeId(id, "Session id");
    return commit({
      permission: "session.archive",
      action: "session.archive",
      sessionId: normalized,
      origin: safe.origin || "runtime",
      mutate: () => {
        const session = requireSession(normalized);
        checkRevision(session, safe.expectedRevision);
        if (session.status !== SESSION_STATUSES.CLOSED) {
          throw new SessionTransitionError("A session must be closed before archive.");
        }
        session.status = SESSION_STATUSES.ARCHIVED;
        session.archivedAt = timestamp();
        session.updatedAt = session.archivedAt;
        session.revision += 1;
        if (state.activeSessionId === session.id) state.activeSessionId = null;
        return freezeSession(session);
      }
    });
  }

  function getSession(id, options = {}) {
    const safe = isRecord(options) ? options : {};
    const normalized = normalizeId(id, "Session id");
    authorizeOrThrow("session.read", { action: "session.read", sessionId: normalized, origin: safe.origin || "runtime" });
    const session = requireSession(normalized);
    trace("read", { action: "session.read", sessionId: session.id, missionId: session.missionId, revision: session.revision, origin: safe.origin || "runtime" });
    return freezeSession(session);
  }

  function listSessions(options = {}) {
    const safe = isRecord(options) ? options : {};
    authorizeOrThrow("session.read", { action: "session.list", origin: safe.origin || "runtime" });
    const missionId = safe.missionId == null ? null : normalizeId(safe.missionId, "Mission id");
    const includeArchived = safe.includeArchived !== false;
    const items = [...state.sessions.values()]
      .filter((session) => missionId ? session.missionId === missionId : true)
      .filter((session) => includeArchived || session.status !== SESSION_STATUSES.ARCHIVED)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(freezeSession);
    trace("read", { action: "session.list", missionId, origin: safe.origin || "runtime" });
    return Object.freeze(items);
  }

  function activeSession(options = {}) {
    const safe = isRecord(options) ? options : {};
    authorizeOrThrow("session.read", { action: "session.active", sessionId: state.activeSessionId, origin: safe.origin || "runtime" });
    const session = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
    trace("read", { action: "session.active", sessionId: session?.id || null, missionId: session?.missionId || null, revision: session?.revision ?? null, origin: safe.origin || "runtime" });
    return freezeSession(session);
  }

  function snapshot(options = {}) {
    const safe = isRecord(options) ? options : {};
    authorizeOrThrow("session.read", { action: "session.snapshot", origin: safe.origin || "runtime" });
    trace("read", { action: "session.snapshot", origin: safe.origin || "runtime" });
    return publicSnapshot();
  }

  function recentEvents() {
    return journal.map((entry) => ({ ...entry, error: entry.error ? { ...entry.error } : null }));
  }

  for (const item of initialSessions) {
    if (!isRecord(item)) throw new SessionValidationError("Initial session entries must be objects.");
    const id = normalizeId(item.id, "Session id");
    if (state.sessions.has(id)) throw new SessionConflictError(`Duplicate initial session id: ${id}`);
    const missionId = normalizeId(item.missionId, "Mission id");
    const createdAt = text(item.createdAt || timestamp(), "Session createdAt", { required: true, max: 64 });
    const updatedAt = text(item.updatedAt || createdAt, "Session updatedAt", { required: true, max: 64 });
    state.sessions.set(id, {
      id,
      missionId,
      name: text(item.name, "Session name", { required: true, max: 160 }),
      companyId: text(item.companyId, "Company id", { max: 120 }),
      folderId: text(item.folderId, "Folder id", { max: 120 }),
      userId: text(item.userId, "User id", { max: 160 }),
      schemaVersion: text(item.schemaVersion || "1.0", "Schema version", { required: true, max: 32 }),
      status: status(item.status || SESSION_STATUSES.DRAFT),
      dirty: Boolean(item.dirty),
      createdAt,
      updatedAt,
      closedAt: item.closedAt ? text(item.closedAt, "Session closedAt", { max: 64 }) : null,
      archivedAt: item.archivedAt ? text(item.archivedAt, "Session archivedAt", { max: 64 }) : null,
      revision: Number.isInteger(item.revision) && item.revision > 0 ? item.revision : 1
    });
    state.sequence += 1;
  }

  if (initialActiveSessionId != null) {
    const normalized = normalizeId(initialActiveSessionId, "Session id");
    const session = state.sessions.get(normalized);
    if (!session) throw new SessionValidationError(`Initial active session is not registered: ${normalized}`);
    if ([SESSION_STATUSES.CLOSED, SESSION_STATUSES.ARCHIVED].includes(session.status)) {
      throw new SessionTransitionError("Initial active session cannot be closed or archived.");
    }
    state.activeSessionId = normalized;
  }

  return Object.freeze({
    createSession,
    transitionSession,
    activateSession,
    markDirty,
    archiveSession,
    getSession,
    listSessions,
    activeSession,
    snapshot,
    recentEvents
  });
}
