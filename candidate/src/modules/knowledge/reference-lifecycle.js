export const REFERENCE_LIFECYCLE_VERSION = "1.0.0";
export const REFERENCE_LIFECYCLE_SNAPSHOT_SCHEMA =
  "falcon.knowledge.reference-lifecycle.snapshot.v1";

export const REFERENCE_LIFECYCLE_EVENT_TYPES = Object.freeze([
  "verified",
  "revalidation-required",
  "superseded",
  "withdrawn"
]);

export const REFERENCE_LIFECYCLE_STATES = Object.freeze([
  "not-yet-verified",
  "current",
  "revalidation-required",
  "superseded",
  "withdrawn"
]);

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReferenceLifecycleError extends Error {
  constructor(message, code = "REFERENCE_LIFECYCLE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new ReferenceLifecycleError(
      `Reference lifecycle value is not cloneable: ${error.message || error}`
    );
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReferenceLifecycleError(
      `${field} must be a non-empty string.`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }
  return value.trim();
}

function requireIdentifier(value, field) {
  const normalized = requireText(value, field).toLowerCase();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new ReferenceLifecycleError(
      `Invalid ${field}: ${value}`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function requireDate(value, field) {
  const normalized = requireText(value, field);
  const instant = new Date(`${normalized}T00:00:00.000Z`);
  if (
    !DATE_PATTERN.test(normalized)
    || Number.isNaN(instant.getTime())
    || instant.toISOString().slice(0, 10) !== normalized
  ) {
    throw new ReferenceLifecycleError(
      `Invalid ${field}: ${value}`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function requireEvidence(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReferenceLifecycleError(
      `${field} must be a non-empty array.`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }
  const normalized = value.map((entry, index) =>
    requireText(entry, `${field}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new ReferenceLifecycleError(
      `${field} contains duplicate values.`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function normalizeEvent(candidate, knownReferenceIds) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new ReferenceLifecycleError(
      "A lifecycle event must be an object.",
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }

  const type = requireText(candidate.type, "event.type");
  if (!REFERENCE_LIFECYCLE_EVENT_TYPES.includes(type)) {
    throw new ReferenceLifecycleError(
      `Unknown lifecycle event type: ${type}`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }

  const event = {
    schema: candidate.schema || "falcon.knowledge.reference-lifecycle.event.v1",
    id: requireIdentifier(candidate.id, "event.id"),
    referenceId: requireIdentifier(
      candidate.referenceId,
      "event.referenceId"
    ),
    type,
    at: requireDate(candidate.at, "event.at"),
    actor: requireText(candidate.actor, "event.actor"),
    reason: requireText(candidate.reason, "event.reason"),
    evidence: requireEvidence(candidate.evidence, "event.evidence"),
    replacementReferenceId: candidate.replacementReferenceId == null
      ? null
      : requireIdentifier(
        candidate.replacementReferenceId,
        "event.replacementReferenceId"
      )
  };

  if (
    event.schema !== "falcon.knowledge.reference-lifecycle.event.v1"
  ) {
    throw new ReferenceLifecycleError(
      `Unsupported lifecycle event schema: ${event.schema}`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }
  if (!knownReferenceIds.has(event.referenceId)) {
    throw new ReferenceLifecycleError(
      `Unknown reference: ${event.referenceId}`,
      "REFERENCE_LIFECYCLE_REFERENCE_ERROR"
    );
  }
  if (event.type === "superseded") {
    if (
      !event.replacementReferenceId
      || !knownReferenceIds.has(event.replacementReferenceId)
      || event.replacementReferenceId === event.referenceId
    ) {
      throw new ReferenceLifecycleError(
        `Superseded reference ${event.referenceId} requires a distinct known replacement.`,
        "REFERENCE_LIFECYCLE_REFERENCE_ERROR"
      );
    }
  } else if (event.replacementReferenceId) {
    throw new ReferenceLifecycleError(
      `Event ${event.id} cannot declare a replacement.`,
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }

  return freezeDeep(event);
}

function nextState(current, event) {
  if (current === "superseded" || current === "withdrawn") {
    throw new ReferenceLifecycleError(
      `Reference ${event.referenceId} is terminal in state ${current}.`,
      "REFERENCE_LIFECYCLE_TRANSITION_ERROR"
    );
  }

  if (event.type === "verified") return "current";
  if (event.type === "revalidation-required") {
    return "revalidation-required";
  }
  return event.type;
}

function daysBetween(from, to) {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((toMs - fromMs) / 86400000);
}

function initialState(reference) {
  if (reference.verificationStatus === "revalidation-required") {
    return "revalidation-required";
  }
  if (reference.verificationStatus === "superseded") {
    return "superseded";
  }
  return "current";
}

export function createReferenceLifecycle({ catalog, events = [] } = {}) {
  if (
    !catalog
    || typeof catalog.listReferences !== "function"
    || !catalog.registry
    || typeof catalog.registry.listSkills !== "function"
  ) {
    throw new ReferenceLifecycleError(
      "A valid Knowledge Catalog is required.",
      "REFERENCE_LIFECYCLE_CONFIGURATION_ERROR"
    );
  }
  if (!Array.isArray(events)) {
    throw new ReferenceLifecycleError(
      "Lifecycle events must be an array.",
      "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
    );
  }

  const references = catalog.listReferences();
  const referenceById = new Map(
    references.map((reference) => [reference.id, reference])
  );
  const knownReferenceIds = new Set(referenceById.keys());
  const normalizedEvents = events
    .map((event) => normalizeEvent(clone(event), knownReferenceIds))
    .sort((left, right) =>
      left.at.localeCompare(right.at) || left.id.localeCompare(right.id)
    );

  const eventIds = normalizedEvents.map(({ id }) => id);
  if (new Set(eventIds).size !== eventIds.length) {
    throw new ReferenceLifecycleError(
      "Lifecycle event identifiers must be unique.",
      "REFERENCE_LIFECYCLE_CONFLICT_ERROR"
    );
  }
  for (const event of normalizedEvents) {
    const reference = referenceById.get(event.referenceId);
    if (event.at < reference.checkedAt) {
      throw new ReferenceLifecycleError(
        `Event ${event.id} predates the source check for ${event.referenceId}.`,
        "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
      );
    }
  }

  const terminalValidationState = new Map(
    references.map((reference) => [reference.id, initialState(reference)])
  );
  for (const event of normalizedEvents) {
    const current = terminalValidationState.get(event.referenceId);
    terminalValidationState.set(
      event.referenceId,
      nextState(current, event)
    );
  }

  function requireAsOf(value) {
    return requireDate(value, "asOf");
  }

  function requireMaxAgeDays(value) {
    if (!Number.isInteger(value) || value < 1) {
      throw new ReferenceLifecycleError(
        "maxAgeDays must be a positive integer.",
        "REFERENCE_LIFECYCLE_VALIDATION_ERROR"
      );
    }
    return value;
  }

  function resolveStatus(reference, asOf, maxAgeDays) {
    let state = asOf < reference.checkedAt
      ? "not-yet-verified"
      : initialState(reference);
    let lastCheckedAt = reference.checkedAt;
    let reason = state === "not-yet-verified"
      ? "source-check-occurs-after-analysis-date"
      : state === "current"
        ? "source-check-current"
        : `pack-status-${state}`;
    let replacementReferenceId = null;
    const applicableEvents = normalizedEvents.filter((event) =>
      event.referenceId === reference.id && event.at <= asOf
    );

    for (const event of applicableEvents) {
      state = nextState(state, event);
      reason = event.reason;
      if (event.type === "verified") lastCheckedAt = event.at;
      if (event.type === "superseded") {
        replacementReferenceId = event.replacementReferenceId;
      }
    }

    const ageDays = daysBetween(lastCheckedAt, asOf);
    if (state === "current" && ageDays > maxAgeDays) {
      state = "revalidation-required";
      reason = "freshness-window-expired";
    }

    return {
      referenceId: reference.id,
      corpusId: reference.corpusId,
      state,
      asOf,
      lastCheckedAt,
      ageDays,
      maxAgeDays,
      reason,
      replacementReferenceId,
      usable: state === "current",
      tracePreserved: true
    };
  }

  function listStatuses({ asOf, maxAgeDays = 365 } = {}) {
    const normalizedAsOf = requireAsOf(asOf);
    const normalizedMaxAgeDays = requireMaxAgeDays(maxAgeDays);
    return freezeDeep(
      references
        .map((reference) =>
          resolveStatus(reference, normalizedAsOf, normalizedMaxAgeDays)
        )
        .sort((left, right) =>
          left.referenceId.localeCompare(right.referenceId)
        )
    );
  }

  function auditTrail(referenceId) {
    const normalizedId = requireIdentifier(referenceId, "referenceId");
    if (!knownReferenceIds.has(normalizedId)) {
      throw new ReferenceLifecycleError(
        `Unknown reference: ${normalizedId}`,
        "REFERENCE_LIFECYCLE_REFERENCE_ERROR"
      );
    }
    return freezeDeep(
      normalizedEvents
        .filter((event) => event.referenceId === normalizedId)
        .map(clone)
    );
  }

  function qualifySkillReferences({
    skillId,
    asOf,
    maxAgeDays = 365
  } = {}) {
    const normalizedSkillId = requireIdentifier(skillId, "skillId");
    const skill = catalog.registry
      .listSkills()
      .find(({ id }) => id === normalizedSkillId);
    if (!skill) {
      throw new ReferenceLifecycleError(
        `Unknown Skill: ${normalizedSkillId}`,
        "REFERENCE_LIFECYCLE_REFERENCE_ERROR"
      );
    }
    const byId = new Map(
      listStatuses({ asOf, maxAgeDays })
        .map((status) => [status.referenceId, status])
    );
    const statuses = skill.references.map((referenceId) => byId.get(referenceId));
    return freezeDeep({
      skillId: skill.id,
      skillVersion: skill.version,
      asOf: requireAsOf(asOf),
      statuses,
      usableReferenceIds: statuses
        .filter(({ usable }) => usable)
        .map(({ referenceId }) => referenceId),
      restrictedReferenceIds: statuses
        .filter(({ state }) => state === "revalidation-required")
        .map(({ referenceId }) => referenceId),
      unavailableReferenceIds: statuses
        .filter(({ state }) =>
          ["not-yet-verified", "superseded", "withdrawn"].includes(state)
        )
        .map(({ referenceId }) => referenceId),
      requiresHumanRevalidation: statuses.some(({ usable }) => !usable),
      decisionAuthority: "human"
    });
  }

  function record(candidate) {
    return createReferenceLifecycle({
      catalog,
      events: [...normalizedEvents, candidate]
    });
  }

  function snapshot() {
    return freezeDeep({
      schema: REFERENCE_LIFECYCLE_SNAPSHOT_SCHEMA,
      version: REFERENCE_LIFECYCLE_VERSION,
      events: normalizedEvents.map(clone)
    });
  }

  function serialize() {
    return JSON.stringify(snapshot(), null, 2);
  }

  return Object.freeze({
    listStatuses,
    auditTrail,
    qualifySkillReferences,
    record,
    snapshot,
    serialize
  });
}

export function restoreReferenceLifecycle({ catalog, serialized } = {}) {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    throw new ReferenceLifecycleError(
      "A serialized reference lifecycle is required.",
      "REFERENCE_LIFECYCLE_RESTORE_ERROR"
    );
  }

  let snapshot;
  try {
    snapshot = JSON.parse(serialized);
  } catch (error) {
    throw new ReferenceLifecycleError(
      `Reference lifecycle JSON is invalid: ${error.message || error}`,
      "REFERENCE_LIFECYCLE_RESTORE_ERROR"
    );
  }
  if (
    snapshot?.schema !== REFERENCE_LIFECYCLE_SNAPSHOT_SCHEMA
    || snapshot?.version !== REFERENCE_LIFECYCLE_VERSION
  ) {
    throw new ReferenceLifecycleError(
      "Reference lifecycle snapshot schema or version is unsupported.",
      "REFERENCE_LIFECYCLE_RESTORE_ERROR"
    );
  }
  return createReferenceLifecycle({ catalog, events: snapshot.events });
}
