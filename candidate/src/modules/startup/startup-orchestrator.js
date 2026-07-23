export const STARTUP_ORCHESTRATOR_VERSION = "StartupOrchestrator@1.0";

const STARTUP_STATES = Object.freeze([
  "idle",
  "starting",
  "ready",
  "failed",
  "shuttingDown",
  "stopped"
]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeError(error) {
  return Object.freeze({
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Unknown startup failure")
  });
}

function assertConfiguration(configuration) {
  if (!configuration || typeof configuration.snapshot !== "function") {
    throw new TypeError("Startup orchestrator requires an environment configuration API.");
  }
  const snapshot = configuration.snapshot();
  if (!snapshot?.valid || typeof snapshot.profile !== "string") {
    throw new TypeError("Startup orchestrator requires a valid environment configuration snapshot.");
  }
  return snapshot;
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants)) throw new TypeError("Startup participants must be an array.");

  const ids = new Set();
  const normalized = participants.map((participant, index) => {
    if (!participant || typeof participant !== "object") {
      throw new TypeError(`Startup participant at index ${index} must be an object.`);
    }
    if (typeof participant.id !== "string" || participant.id.trim() === "") {
      throw new TypeError(`Startup participant at index ${index} requires a non-empty id.`);
    }
    if (ids.has(participant.id)) throw new TypeError(`Duplicate startup participant id: ${participant.id}.`);
    ids.add(participant.id);
    if (typeof participant.start !== "function") {
      throw new TypeError(`Startup participant ${participant.id} requires start().`);
    }
    if (participant.check !== undefined && typeof participant.check !== "function") {
      throw new TypeError(`Startup participant ${participant.id} check must be a function.`);
    }
    if (participant.stop !== undefined && typeof participant.stop !== "function") {
      throw new TypeError(`Startup participant ${participant.id} stop must be a function.`);
    }

    return Object.freeze({
      id: participant.id,
      order: Number.isFinite(participant.order) ? participant.order : index,
      check: participant.check || (() => true),
      start: participant.start,
      stop: participant.stop || (() => undefined)
    });
  });

  return Object.freeze([...normalized].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
}

export function createStartupOrchestrator({
  configuration,
  participants = [],
  now = () => new Date().toISOString()
} = {}) {
  const configurationSnapshot = assertConfiguration(configuration);
  const orderedParticipants = normalizeParticipants(participants);
  if (typeof now !== "function") throw new TypeError("Startup orchestrator clock must be a function.");

  let state = "idle";
  let startedAt = null;
  let completedAt = null;
  let stoppedAt = null;
  let failure = null;
  let sequence = [];
  let activeParticipants = [];

  function transition(nextState) {
    if (!STARTUP_STATES.includes(nextState)) throw new TypeError(`Unknown startup state: ${String(nextState)}.`);
    state = nextState;
  }

  function snapshot() {
    return freezeDeep({
      version: STARTUP_ORCHESTRATOR_VERSION,
      state,
      environment: {
        profile: configurationSnapshot.profile,
        releaseChannel: configurationSnapshot.values.releaseChannel
      },
      startedAt,
      completedAt,
      stoppedAt,
      failure,
      sequence: [...sequence],
      activeParticipants: [...activeParticipants]
    });
  }

  async function start() {
    if (state !== "idle" && state !== "stopped") {
      throw new Error(`Startup cannot begin from state ${state}.`);
    }

    transition("starting");
    startedAt = String(now());
    completedAt = null;
    stoppedAt = null;
    failure = null;
    sequence = [];
    activeParticipants = [];

    try {
      for (const participant of orderedParticipants) {
        const checkResult = await participant.check({ configuration: configurationSnapshot, snapshot });
        if (checkResult !== true) {
          throw new Error(`Startup prerequisite failed for ${participant.id}.`);
        }
        sequence.push(Object.freeze({ id: participant.id, phase: "checked", at: String(now()) }));
      }

      for (const participant of orderedParticipants) {
        await participant.start({ configuration: configurationSnapshot, snapshot });
        activeParticipants.push(participant.id);
        sequence.push(Object.freeze({ id: participant.id, phase: "started", at: String(now()) }));
      }

      transition("ready");
      completedAt = String(now());
      return snapshot();
    } catch (error) {
      failure = normalizeError(error);
      transition("failed");
      completedAt = String(now());
      throw error;
    }
  }

  async function shutdown() {
    if (state !== "ready" && state !== "failed") {
      throw new Error(`Shutdown cannot begin from state ${state}.`);
    }

    transition("shuttingDown");
    const stopErrors = [];

    for (const participant of [...orderedParticipants].reverse()) {
      if (!activeParticipants.includes(participant.id)) continue;
      try {
        await participant.stop({ configuration: configurationSnapshot, snapshot });
        sequence.push(Object.freeze({ id: participant.id, phase: "stopped", at: String(now()) }));
      } catch (error) {
        stopErrors.push(Object.freeze({ id: participant.id, error: normalizeError(error) }));
      }
    }

    activeParticipants = [];
    stoppedAt = String(now());
    if (stopErrors.length > 0) {
      failure = freezeDeep({
        name: "ShutdownError",
        message: "One or more startup participants failed to stop.",
        participants: stopErrors
      });
      transition("failed");
      throw new AggregateError(stopErrors.map((entry) => new Error(`${entry.id}: ${entry.error.message}`)), failure.message);
    }

    transition("stopped");
    return snapshot();
  }

  return Object.freeze({
    version: STARTUP_ORCHESTRATOR_VERSION,
    start,
    shutdown,
    snapshot
  });
}
