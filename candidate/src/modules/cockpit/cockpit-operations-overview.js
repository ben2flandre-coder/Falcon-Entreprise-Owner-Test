export const COCKPIT_OPERATIONS_OVERVIEW_VERSION = "CockpitOperationsOverview@1.0";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function statusFrom(condition, unavailable = false) {
  if (unavailable) return "unavailable";
  return condition ? "healthy" : "degraded";
}

export function createCockpitOperationsOverview({
  observability,
  synchronization = () => null,
  now = () => new Date().toISOString()
} = {}) {
  if (!observability?.snapshot || !observability?.diagnostics) {
    throw new TypeError("Cockpit operations overview requires an observability API.");
  }
  if (typeof synchronization !== "function") {
    throw new TypeError("Cockpit operations synchronization source must be a function.");
  }
  if (typeof now !== "function") throw new TypeError("Cockpit operations clock must be a function.");

  function snapshot() {
    const telemetry = observability.snapshot();
    const diagnostics = observability.diagnostics();
    const sync = synchronization();
    const performanceAvailable = Boolean(telemetry.performanceEvaluation);
    const performanceHealthy = telemetry.performanceEvaluation?.passed !== false;
    const synchronizationAvailable = Boolean(sync);
    const synchronizationHealthy = !sync?.destroyed;

    const components = {
      observability: {
        status: statusFrom(Boolean(telemetry.enabled)),
        version: telemetry.version,
        retainedEvents: telemetry.retained,
        capacity: telemetry.capacity
      },
      performance: {
        status: statusFrom(performanceHealthy, !performanceAvailable),
        version: telemetry.performance?.version || null,
        violations: diagnostics.performanceViolations.length
      },
      synchronization: {
        status: statusFrom(synchronizationHealthy, !synchronizationAvailable),
        enabled: synchronizationAvailable,
        subscriptions: sync?.subscriptionCount?.() || 0
      }
    };

    const statuses = Object.values(components).map((component) => component.status);
    const overall = statuses.includes("degraded")
      ? "degraded"
      : statuses.every((status) => status === "unavailable")
        ? "unavailable"
        : "healthy";

    return freezeDeep({
      version: COCKPIT_OPERATIONS_OVERVIEW_VERSION,
      generatedAt: String(now()),
      status: overall,
      components,
      activity: {
        sequence: telemetry.sequence,
        retainedEvents: telemetry.retained,
        channels: diagnostics.channels,
        counters: telemetry.counters
      }
    });
  }

  return Object.freeze({
    version: COCKPIT_OPERATIONS_OVERVIEW_VERSION,
    snapshot
  });
}
