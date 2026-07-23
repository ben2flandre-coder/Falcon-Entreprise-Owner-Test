export const COCKPIT_RUNTIME_HEALTH_MONITOR_VERSION = "CockpitRuntimeHealthMonitor@1.0";

const DEFAULT_THRESHOLDS = Object.freeze({ warningAfterMs: 60_000, criticalAfterMs: 300_000 });

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function ageMs(timestamp, nowMs) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
}

function freshness(timestamp, nowMs, thresholds) {
  const age = ageMs(timestamp, nowMs);
  if (age == null) return { status: "unknown", ageMs: null };
  if (age >= thresholds.criticalAfterMs) return { status: "critical", ageMs: age };
  if (age >= thresholds.warningAfterMs) return { status: "warning", ageMs: age };
  return { status: "fresh", ageMs: age };
}

function diagnostic(severity, code, component, message) {
  return Object.freeze({ severity, code, component, message });
}

export function createCockpitRuntimeHealthMonitor({
  operations,
  runtimeInspector,
  now = () => Date.now(),
  thresholds = DEFAULT_THRESHOLDS
} = {}) {
  if (!operations?.snapshot) throw new TypeError("Runtime health monitor requires an operations overview API.");
  if (!runtimeInspector?.snapshot) throw new TypeError("Runtime health monitor requires a runtime inspector API.");
  if (typeof now !== "function") throw new TypeError("Runtime health monitor clock must be a function.");

  const limits = Object.freeze({ ...DEFAULT_THRESHOLDS, ...thresholds });
  if (!Number.isFinite(limits.warningAfterMs) || !Number.isFinite(limits.criticalAfterMs) || limits.warningAfterMs < 0 || limits.criticalAfterMs <= limits.warningAfterMs) {
    throw new RangeError("Runtime health thresholds must be finite and criticalAfterMs must exceed warningAfterMs.");
  }

  function snapshot() {
    const generatedAtMs = Number(now());
    const operationsState = operations.snapshot();
    const runtimeState = runtimeInspector.snapshot();
    const diagnostics = [];

    if (operationsState.status === "degraded") diagnostics.push(diagnostic("warning", "OPERATIONS_DEGRADED", "operations", "Cockpit operations reports a degraded state."));
    if (operationsState.status === "unavailable") diagnostics.push(diagnostic("critical", "OPERATIONS_UNAVAILABLE", "operations", "Cockpit operations is unavailable."));
    if (runtimeState.summary.status === "degraded") diagnostics.push(diagnostic("warning", "RUNTIME_DEGRADED", "runtime", "One or more Runtime components are unavailable."));
    if (runtimeState.summary.status === "unavailable") diagnostics.push(diagnostic("critical", "RUNTIME_UNAVAILABLE", "runtime", "Runtime inspection is unavailable."));

    for (const component of Object.values(operationsState.components || {})) {
      if (component.status === "degraded") diagnostics.push(diagnostic("warning", "COMPONENT_DEGRADED", "operations", "An operations component is degraded."));
    }

    const operationsFreshness = freshness(operationsState.generatedAt, generatedAtMs, limits);
    const runtimeFreshness = freshness(runtimeState.generatedAt, generatedAtMs, limits);
    for (const [component, state] of [["operations", operationsFreshness], ["runtime", runtimeFreshness]]) {
      if (state.status === "warning") diagnostics.push(diagnostic("warning", "SNAPSHOT_STALE", component, `${component} snapshot is stale.`));
      if (state.status === "critical") diagnostics.push(diagnostic("critical", "SNAPSHOT_EXPIRED", component, `${component} snapshot is expired.`));
      if (state.status === "unknown") diagnostics.push(diagnostic("warning", "SNAPSHOT_TIME_UNKNOWN", component, `${component} snapshot timestamp is unavailable.`));
    }

    const criticalCount = diagnostics.filter((entry) => entry.severity === "critical").length;
    const warningCount = diagnostics.filter((entry) => entry.severity === "warning").length;
    const status = criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy";

    return freezeDeep({
      version: COCKPIT_RUNTIME_HEALTH_MONITOR_VERSION,
      generatedAt: new Date(generatedAtMs).toISOString(),
      status,
      summary: {
        warnings: warningCount,
        criticals: criticalCount,
        runtimeComponents: runtimeState.summary,
        operationsStatus: operationsState.status
      },
      freshness: {
        operations: operationsFreshness,
        runtime: runtimeFreshness,
        thresholds: limits
      },
      diagnostics
    });
  }

  return Object.freeze({
    version: COCKPIT_RUNTIME_HEALTH_MONITOR_VERSION,
    snapshot
  });
}
