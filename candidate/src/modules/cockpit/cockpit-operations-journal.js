export const COCKPIT_OPERATIONS_JOURNAL_VERSION = "CockpitOperationsJournal@1.0";

const TYPES = new Set(["supervision", "activity", "diagnostic", "component", "freshness", "technical"]);
const SEVERITIES = new Set(["info", "warning", "critical"]);
const STATUSES = new Set(["healthy", "available", "fresh", "degraded", "warning", "critical", "unavailable", "stale", "unknown"]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function clone(value) {
  return value === undefined ? null : structuredClone(value);
}

function normalizeText(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeType(value) {
  return TYPES.has(value) ? value : "technical";
}

function normalizeSeverity(value) {
  return SEVERITIES.has(value) ? value : "info";
}

function normalizeStatus(value) {
  return STATUSES.has(value) ? value : "unknown";
}

function normalizeTimestamp(value, fallback) {
  const candidate = normalizeText(value, fallback);
  return Number.isNaN(Date.parse(candidate)) ? fallback : new Date(candidate).toISOString();
}

function compareEntries(left, right) {
  const timeDelta = left.timestamp.localeCompare(right.timestamp);
  return timeDelta || left.sequence - right.sequence;
}

export function createCockpitOperationsJournal({
  capacity = 200,
  now = () => new Date().toISOString()
} = {}) {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new TypeError("Cockpit operations journal capacity must be a positive integer.");
  }
  if (typeof now !== "function") {
    throw new TypeError("Cockpit operations journal clock must be a function.");
  }

  let sequence = 0;
  let droppedEntries = 0;
  const entries = [];

  function record(input = {}) {
    sequence += 1;
    const fallbackTimestamp = normalizeTimestamp(now(), new Date(0).toISOString());
    const entry = freezeDeep({
      id: `operations-${String(sequence).padStart(8, "0")}`,
      sequence,
      timestamp: normalizeTimestamp(input.timestamp, fallbackTimestamp),
      type: normalizeType(input.type),
      severity: normalizeSeverity(input.severity),
      status: normalizeStatus(input.status),
      source: normalizeText(input.source, "cockpit"),
      code: normalizeText(input.code, "TECHNICAL_EVENT"),
      message: normalizeText(input.message, "Technical operations event."),
      details: freezeDeep(clone(input.details))
    });

    entries.push(entry);
    entries.sort(compareEntries);
    while (entries.length > capacity) {
      entries.shift();
      droppedEntries += 1;
    }
    return entry;
  }

  function latest(limit = capacity) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new TypeError("Cockpit operations journal limit must be a non-negative integer.");
    }
    return freezeDeep(entries.slice(Math.max(0, entries.length - limit)).map(clone));
  }

  function query({ source, severity, type, status, from, to, limit = capacity } = {}) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new TypeError("Cockpit operations journal limit must be a non-negative integer.");
    }
    const fromTime = from == null ? null : Date.parse(from);
    const toTime = to == null ? null : Date.parse(to);
    if (from != null && Number.isNaN(fromTime)) throw new TypeError("Cockpit operations journal from timestamp is invalid.");
    if (to != null && Number.isNaN(toTime)) throw new TypeError("Cockpit operations journal to timestamp is invalid.");

    const filtered = entries.filter((entry) => {
      const timestamp = Date.parse(entry.timestamp);
      return (source == null || entry.source === source)
        && (severity == null || entry.severity === severity)
        && (type == null || entry.type === type)
        && (status == null || entry.status === status)
        && (fromTime == null || timestamp >= fromTime)
        && (toTime == null || timestamp <= toTime);
    });

    return freezeDeep(filtered.slice(Math.max(0, filtered.length - limit)).map(clone));
  }

  function snapshot() {
    const retained = latest(capacity);
    const warnings = retained.filter((entry) => entry.severity === "warning").length;
    const criticals = retained.filter((entry) => entry.severity === "critical").length;
    return freezeDeep({
      version: COCKPIT_OPERATIONS_JOURNAL_VERSION,
      generatedAt: normalizeTimestamp(now(), new Date(0).toISOString()),
      retention: {
        capacity,
        retainedEntries: retained.length,
        droppedEntries,
        firstSequence: retained[0]?.sequence ?? null,
        lastSequence: retained.at(-1)?.sequence ?? null
      },
      summary: {
        totalRecorded: sequence,
        warnings,
        criticals
      },
      entries: retained
    });
  }

  return Object.freeze({
    version: COCKPIT_OPERATIONS_JOURNAL_VERSION,
    record,
    latest,
    query,
    snapshot
  });
}
