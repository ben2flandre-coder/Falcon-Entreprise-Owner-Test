export const COCKPIT_OBSERVABILITY_VERSION = "CockpitObservability@1.0";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeMetadata(metadata = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null || ["string", "number", "boolean"].includes(typeof value)) normalized[key] = value;
    else if (Array.isArray(value)) normalized[key] = value.map((item) => String(item));
  }
  return normalized;
}

export function createCockpitObservability({
  enabled = true,
  capacity = 250,
  now = () => new Date().toISOString(),
  performanceMonitor = null
} = {}) {
  if (!Number.isInteger(capacity) || capacity < 10) throw new RangeError("Cockpit observability capacity must be an integer greater than or equal to 10.");
  if (typeof now !== "function") throw new TypeError("Cockpit observability clock must be a function.");

  const entries = [];
  const counters = new Map();
  let sequence = 0;

  function record(channel, name, metadata = {}) {
    if (!enabled) return null;
    const entry = freezeDeep({
      sequence: ++sequence,
      timestamp: String(now()),
      channel: String(channel),
      name: String(name),
      metadata: normalizeMetadata(metadata)
    });
    entries.push(entry);
    if (entries.length > capacity) entries.splice(0, entries.length - capacity);
    const key = `${entry.channel}:${entry.name}`;
    counters.set(key, (counters.get(key) || 0) + 1);
    return entry;
  }

  function snapshot() {
    const counts = {};
    for (const [key, value] of [...counters.entries()].sort(([a], [b]) => a.localeCompare(b))) counts[key] = value;
    const performance = performanceMonitor?.snapshot?.() || null;
    const performanceEvaluation = performanceMonitor?.evaluate?.(performance) || null;
    return freezeDeep({
      version: COCKPIT_OBSERVABILITY_VERSION,
      enabled: Boolean(enabled),
      capacity,
      retained: entries.length,
      sequence,
      counters: counts,
      entries: entries.slice(),
      performance,
      performanceEvaluation
    });
  }

  function clear() {
    entries.length = 0;
    counters.clear();
    sequence = 0;
    performanceMonitor?.reset?.();
  }

  function diagnostics() {
    const state = snapshot();
    return freezeDeep({
      healthy: state.performanceEvaluation?.passed !== false,
      retainedEvents: state.retained,
      channels: [...new Set(state.entries.map((entry) => entry.channel))].sort(),
      performanceViolations: state.performanceEvaluation?.violations || []
    });
  }

  return Object.freeze({
    version: COCKPIT_OBSERVABILITY_VERSION,
    record,
    snapshot,
    diagnostics,
    clear,
    isEnabled: () => Boolean(enabled)
  });
}
