export const PERSISTENCE_COORDINATOR_VERSION = "V48.0.0-dev";
export const PERSISTENCE_ENVELOPE_SCHEMA = "falcon.persistence.envelope.v1";

const PARTICIPANT_ID_PATTERN = /^[a-z][a-z0-9._-]{2,79}$/;

export class PersistenceCoordinatorError extends Error {
  constructor(message, code = "PERSISTENCE_COORDINATOR_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class PersistenceValidationError extends PersistenceCoordinatorError {
  constructor(message) { super(message, "PERSISTENCE_VALIDATION_ERROR"); }
}

export class PersistenceConflictError extends PersistenceCoordinatorError {
  constructor(message) { super(message, "PERSISTENCE_CONFLICT_ERROR"); }
}

export class PersistenceStorageError extends PersistenceCoordinatorError {
  constructor(message) { super(message, "PERSISTENCE_STORAGE_ERROR"); }
}

export class PersistenceRestoreError extends PersistenceCoordinatorError {
  constructor(message) { super(message, "PERSISTENCE_RESTORE_ERROR"); }
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeParticipantId(value) {
  if (typeof value !== "string") throw new PersistenceValidationError("Participant id must be a string.");
  const normalized = value.trim().toLowerCase();
  if (!PARTICIPANT_ID_PATTERN.test(normalized)) {
    throw new PersistenceValidationError(`Invalid participant id: ${value}`);
  }
  return normalized;
}

function normalizeVersion(value, label = "Version") {
  if (typeof value !== "string" || !value.trim()) {
    throw new PersistenceValidationError(`${label} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > 40) throw new PersistenceValidationError(`${label} exceeds 40 characters.`);
  return normalized;
}

function clone(value) {
  try { return structuredClone(value); }
  catch (error) {
    throw new PersistenceValidationError(`Snapshot is not cloneable: ${error.message || error}`);
  }
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function describeError(error) {
  return Object.freeze({
    name: error?.name || "Error",
    code: error?.code || null,
    message: error?.message || String(error)
  });
}

export function createPersistenceCoordinator({
  storage,
  storageKey = "falcon_v48_persistence_envelope",
  appVersion = PERSISTENCE_COORDINATOR_VERSION,
  now = () => new Date().toISOString(),
  diagnosticsLimit = 160
} = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function" || typeof storage.remove !== "function") {
    throw new TypeError("Persistence storage must implement get(), set() and remove().");
  }
  if (typeof storageKey !== "string" || !storageKey.trim()) throw new PersistenceValidationError("Storage key is required.");
  if (typeof now !== "function") throw new TypeError("Persistence clock must be a function.");
  if (!Number.isInteger(diagnosticsLimit) || diagnosticsLimit < 1) {
    throw new RangeError("Diagnostics limit must be a positive integer.");
  }

  const participants = new Map();
  const diagnostics = [];
  let busy = false;
  let commitSequence = 0;

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function trace(status, details = {}) {
    diagnostics.unshift(Object.freeze({
      at: timestamp(),
      status,
      operation: details.operation || "persistence.read",
      participantId: details.participantId || null,
      commitId: details.commitId || null,
      participantCount: details.participantCount ?? null,
      origin: details.origin || "runtime",
      error: details.error ? describeError(details.error) : null
    }));
    if (diagnostics.length > diagnosticsLimit) diagnostics.length = diagnosticsLimit;
  }

  function assertIdle() {
    if (busy) throw new PersistenceConflictError("Persistence operation already in progress.");
  }

  function orderedParticipants() {
    return [...participants.values()].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  function registerParticipant({ id, version, capture, restore, validate = null, order = 100 } = {}) {
    assertIdle();
    const participantId = normalizeParticipantId(id);
    const participantVersion = normalizeVersion(version, "Participant version");
    if (participants.has(participantId)) {
      throw new PersistenceConflictError(`Persistence participant already registered: ${participantId}`);
    }
    if (typeof capture !== "function") throw new TypeError("Participant capture must be a function.");
    if (typeof restore !== "function") throw new TypeError("Participant restore must be a function.");
    if (validate != null && typeof validate !== "function") throw new TypeError("Participant validate must be a function.");
    if (!Number.isInteger(order)) throw new TypeError("Participant order must be an integer.");

    participants.set(participantId, Object.freeze({
      id: participantId,
      version: participantVersion,
      capture,
      restore,
      validate,
      order
    }));
    trace("registered", { operation: "participant.register", participantId });
    return participantId;
  }

  function unregisterParticipant(id) {
    assertIdle();
    const participantId = normalizeParticipantId(id);
    const removed = participants.delete(participantId);
    trace(removed ? "unregistered" : "not-found", {
      operation: "participant.unregister",
      participantId
    });
    return removed;
  }

  function validateEnvelope(envelope) {
    if (!isRecord(envelope)) throw new PersistenceValidationError("Persistence envelope must be an object.");
    if (envelope.schema !== PERSISTENCE_ENVELOPE_SCHEMA) {
      throw new PersistenceValidationError(`Unsupported persistence schema: ${envelope.schema}`);
    }
    normalizeVersion(envelope.appVersion, "Envelope app version");
    if (typeof envelope.commitId !== "string" || !envelope.commitId) {
      throw new PersistenceValidationError("Envelope commit id is required.");
    }
    if (!isRecord(envelope.participants)) {
      throw new PersistenceValidationError("Envelope participants must be an object.");
    }

    for (const [id, payload] of Object.entries(envelope.participants)) {
      const participantId = normalizeParticipantId(id);
      const participant = participants.get(participantId);
      if (!participant) throw new PersistenceValidationError(`Unknown persistence participant: ${participantId}`);
      if (!isRecord(payload)) throw new PersistenceValidationError(`Invalid participant payload: ${participantId}`);
      const payloadVersion = normalizeVersion(payload.version, `${participantId} version`);
      if (payloadVersion !== participant.version) {
        throw new PersistenceValidationError(
          `Unsupported participant version for ${participantId}: ${payloadVersion}; expected ${participant.version}.`
        );
      }
      if (!("snapshot" in payload)) throw new PersistenceValidationError(`Missing snapshot for participant: ${participantId}`);
      if (participant.validate && participant.validate(clone(payload.snapshot)) !== true) {
        throw new PersistenceValidationError(`Participant snapshot validation failed: ${participantId}`);
      }
    }
    return true;
  }

  function captureEnvelope({ origin = "runtime" } = {}) {
    const entries = {};
    const ordered = orderedParticipants();
    for (const participant of ordered) {
      try {
        const snapshot = clone(participant.capture());
        if (participant.validate && participant.validate(clone(snapshot)) !== true) {
          throw new PersistenceValidationError(`Participant snapshot validation failed: ${participant.id}`);
        }
        entries[participant.id] = {
          version: participant.version,
          snapshot
        };
      } catch (error) {
        trace("capture-failed", {
          operation: "persistence.capture",
          participantId: participant.id,
          participantCount: ordered.length,
          origin,
          error
        });
        throw error;
      }
    }

    commitSequence += 1;
    const stamp = timestamp();
    const envelope = {
      schema: PERSISTENCE_ENVELOPE_SCHEMA,
      appVersion: normalizeVersion(appVersion, "Application version"),
      commitId: `commit-${stamp.replace(/[^0-9]/g, "").slice(0, 17)}-${commitSequence}`,
      createdAt: stamp,
      participants: entries
    };
    validateEnvelope(envelope);
    trace("captured", {
      operation: "persistence.capture",
      commitId: envelope.commitId,
      participantCount: ordered.length,
      origin
    });
    return freeze(clone(envelope));
  }

  function save(options = {}) {
    assertIdle();
    const origin = isRecord(options) && options.origin ? String(options.origin) : "runtime";
    busy = true;
    let previousRaw = null;
    let previousExisted = false;
    let envelope = null;
    try {
      previousRaw = storage.get(storageKey, null, { origin: "persistence-preflight" });
      previousExisted = previousRaw !== null;
      envelope = captureEnvelope({ origin });
      const written = storage.set(storageKey, JSON.stringify(envelope), { origin: "persistence-commit" });
      if (written !== true) throw new PersistenceStorageError("Persistence envelope write failed.");
      trace("committed", {
        operation: "persistence.save",
        commitId: envelope.commitId,
        participantCount: Object.keys(envelope.participants).length,
        origin
      });
      return envelope;
    } catch (error) {
      let rollbackOk = true;
      if (envelope !== null) {
        rollbackOk = previousExisted
          ? storage.set(storageKey, previousRaw, { origin: "persistence-rollback" }) === true
          : storage.remove(storageKey, { origin: "persistence-rollback" }) === true;
      }
      const finalError = rollbackOk
        ? error
        : new PersistenceStorageError(`Persistence save failed and storage rollback was incomplete: ${error.message || error}`);
      trace("rolled-back", {
        operation: "persistence.save",
        commitId: envelope?.commitId || null,
        participantCount: envelope ? Object.keys(envelope.participants).length : participants.size,
        origin,
        error: finalError
      });
      throw finalError;
    } finally {
      busy = false;
    }
  }

  function parseEnvelope(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new PersistenceValidationError("No persistence envelope is available.");
    }
    let envelope;
    try { envelope = JSON.parse(raw); }
    catch (error) { throw new PersistenceValidationError(`Persistence envelope JSON is invalid: ${error.message || error}`); }
    validateEnvelope(envelope);
    return envelope;
  }

  function load(options = {}) {
    assertIdle();
    const origin = isRecord(options) && options.origin ? String(options.origin) : "runtime";
    busy = true;
    const before = new Map();
    const applied = [];
    let envelope = null;
    try {
      envelope = parseEnvelope(storage.get(storageKey, null, { origin: "persistence-load" }));
      const ordered = orderedParticipants().filter((participant) => envelope.participants[participant.id]);
      for (const participant of ordered) before.set(participant.id, clone(participant.capture()));
      for (const participant of ordered) {
        const payload = envelope.participants[participant.id];
        participant.restore(clone(payload.snapshot), Object.freeze({
          origin,
          commitId: envelope.commitId,
          version: payload.version
        }));
        applied.push(participant.id);
      }
      trace("restored", {
        operation: "persistence.load",
        commitId: envelope.commitId,
        participantCount: ordered.length,
        origin
      });
      return freeze(clone(envelope));
    } catch (error) {
      let rollbackError = null;
      for (const participantId of [...applied].reverse()) {
        const participant = participants.get(participantId);
        try {
          participant.restore(clone(before.get(participantId)), Object.freeze({
            origin: "persistence-load-rollback",
            commitId: envelope?.commitId || null,
            version: participant.version
          }));
        } catch (currentRollbackError) {
          rollbackError ||= currentRollbackError;
        }
      }
      const finalError = rollbackError
        ? new PersistenceRestoreError(
          `Persistence load failed and participant rollback was incomplete: ${error.message || error}; rollback: ${rollbackError.message || rollbackError}`
        )
        : error;
      trace("restore-rolled-back", {
        operation: "persistence.load",
        commitId: envelope?.commitId || null,
        participantCount: applied.length,
        origin,
        error: finalError
      });
      throw finalError;
    } finally {
      busy = false;
    }
  }

  function inspect(options = {}) {
    assertIdle();
    const origin = isRecord(options) && options.origin ? String(options.origin) : "runtime";
    const raw = storage.get(storageKey, null, { origin: "persistence-inspect" });
    if (raw === null) return null;
    const envelope = parseEnvelope(raw);
    trace("inspected", {
      operation: "persistence.inspect",
      commitId: envelope.commitId,
      participantCount: Object.keys(envelope.participants).length,
      origin
    });
    return freeze(clone(envelope));
  }

  function clear(options = {}) {
    assertIdle();
    const origin = isRecord(options) && options.origin ? String(options.origin) : "runtime";
    const removed = storage.remove(storageKey, { origin: "persistence-clear" }) === true;
    if (!removed) throw new PersistenceStorageError("Persistence envelope removal failed.");
    trace("cleared", { operation: "persistence.clear", origin });
    return true;
  }

  function listParticipants() {
    return Object.freeze(orderedParticipants().map((participant) => Object.freeze({
      id: participant.id,
      version: participant.version,
      order: participant.order
    })));
  }

  function recentDiagnostics() {
    return diagnostics.map((entry) => ({
      ...entry,
      error: entry.error ? { ...entry.error } : null
    }));
  }

  return Object.freeze({
    registerParticipant,
    unregisterParticipant,
    listParticipants,
    save,
    load,
    inspect,
    clear,
    recentDiagnostics
  });
}
