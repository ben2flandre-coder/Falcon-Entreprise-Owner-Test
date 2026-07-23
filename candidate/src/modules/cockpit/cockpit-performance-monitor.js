export const COCKPIT_PERFORMANCE_MONITOR_VERSION = "CockpitPerformanceMonitor@1.0";

export const DEFAULT_COCKPIT_PERFORMANCE_BUDGETS = Object.freeze({
  "view-read": 50,
  "full-render": 120,
  "targeted-render": 40,
  "zones-per-targeted-render": 6
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function emptyMetric() {
  return { count: 0, totalMs: 0, minMs: null, maxMs: null, lastMs: null };
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

export function createCockpitPerformanceMonitor({
  enabled = true,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  budgets = DEFAULT_COCKPIT_PERFORMANCE_BUDGETS
} = {}) {
  if (typeof now !== "function") throw new TypeError("Cockpit performance clock must be a function.");
  const limits = Object.freeze({ ...DEFAULT_COCKPIT_PERFORMANCE_BUDGETS, ...budgets });
  const metrics = new Map();
  let targetedZoneTotal = 0;
  let targetedRenderCount = 0;

  function record(name, durationMs, metadata = {}) {
    if (!enabled) return null;
    const duration = Number(durationMs);
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Performance duration must be a non-negative number.");
    const key = String(name);
    const metric = metrics.get(key) || emptyMetric();
    metric.count += 1;
    metric.totalMs += duration;
    metric.minMs = metric.minMs == null ? duration : Math.min(metric.minMs, duration);
    metric.maxMs = metric.maxMs == null ? duration : Math.max(metric.maxMs, duration);
    metric.lastMs = duration;
    metrics.set(key, metric);
    if (key === "targeted-render") {
      targetedRenderCount += 1;
      targetedZoneTotal += Number.isInteger(metadata.zoneCount) ? metadata.zoneCount : 0;
    }
    return duration;
  }

  function measure(name, operation, metadata = {}) {
    if (typeof operation !== "function") throw new TypeError("Measured operation must be a function.");
    if (!enabled) return operation();
    const startedAt = Number(now());
    try {
      return operation();
    } finally {
      record(name, Math.max(0, Number(now()) - startedAt), metadata);
    }
  }

  function snapshot() {
    const entries = {};
    for (const [name, metric] of [...metrics.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      entries[name] = {
        count: metric.count,
        totalMs: rounded(metric.totalMs),
        averageMs: rounded(metric.totalMs / metric.count),
        minMs: rounded(metric.minMs),
        maxMs: rounded(metric.maxMs),
        lastMs: rounded(metric.lastMs)
      };
    }
    return freezeDeep({
      version: COCKPIT_PERFORMANCE_MONITOR_VERSION,
      enabled: Boolean(enabled),
      metrics: entries,
      targetedRendering: {
        renderCount: targetedRenderCount,
        zoneCount: targetedZoneTotal,
        averageZones: targetedRenderCount ? rounded(targetedZoneTotal / targetedRenderCount) : 0
      },
      budgets: limits
    });
  }

  function evaluate(input = snapshot()) {
    const violations = [];
    for (const name of ["view-read", "full-render", "targeted-render"]) {
      const maximum = input.metrics?.[name]?.maxMs;
      if (Number.isFinite(maximum) && maximum > limits[name]) {
        violations.push({ metric: name, actual: maximum, budget: limits[name] });
      }
    }
    const averageZones = input.targetedRendering?.averageZones;
    if (Number.isFinite(averageZones) && averageZones > limits["zones-per-targeted-render"]) {
      violations.push({ metric: "zones-per-targeted-render", actual: averageZones, budget: limits["zones-per-targeted-render"] });
    }
    return freezeDeep({ passed: violations.length === 0, violations });
  }

  function reset() {
    metrics.clear();
    targetedZoneTotal = 0;
    targetedRenderCount = 0;
  }

  return Object.freeze({
    version: COCKPIT_PERFORMANCE_MONITOR_VERSION,
    record,
    measure,
    snapshot,
    evaluate,
    reset,
    isEnabled: () => Boolean(enabled)
  });
}
