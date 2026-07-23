export const COCKPIT_SUPERVISION_SNAPSHOT_VERSION = "CockpitSupervisionSnapshot@1.0";

const STATUS_ORDER = Object.freeze({
  healthy: 0,
  unavailable: 1,
  degraded: 2,
  warning: 3,
  critical: 4
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function requireSnapshotApi(name, api) {
  if (!api?.snapshot || typeof api.snapshot !== "function") {
    throw new TypeError(`${name} requires a snapshot API.`);
  }
}

function normalizeStatus(value) {
  return Object.hasOwn(STATUS_ORDER, value) ? value : "unavailable";
}

function worstStatus(statuses) {
  return statuses
    .map(normalizeStatus)
    .sort((left, right) => STATUS_ORDER[right] - STATUS_ORDER[left])[0] || "unavailable";
}

function normalizeDiagnostic(entry = {}) {
  return {
    severity: entry.severity === "critical" ? "critical" : "warning",
    code: String(entry.code || "UNKNOWN_DIAGNOSTIC"),
    component: String(entry.component || "unknown"),
    message: String(entry.message || "Technical diagnostic unavailable.")
  };
}

function sortDiagnostics(entries) {
  return [...entries].sort((left, right) => {
    const severityDelta = STATUS_ORDER[right.severity] - STATUS_ORDER[left.severity];
    if (severityDelta !== 0) return severityDelta;
    return `${left.code}:${left.component}:${left.message}`.localeCompare(`${right.code}:${right.component}:${right.message}`);
  });
}

export function createCockpitSupervisionSnapshot({
  operations,
  runtimeInspector,
  healthMonitor,
  diagnosticsRecovery,
  now = () => new Date().toISOString()
} = {}) {
  requireSnapshotApi("Cockpit supervision operations", operations);
  requireSnapshotApi("Cockpit supervision runtime inspector", runtimeInspector);
  requireSnapshotApi("Cockpit supervision health monitor", healthMonitor);
  requireSnapshotApi("Cockpit supervision diagnostics", diagnosticsRecovery);
  if (typeof now !== "function") throw new TypeError("Cockpit supervision clock must be a function.");

  function snapshot() {
    const operationsState = operations.snapshot();
    const runtimeState = runtimeInspector.snapshot();
    const healthState = healthMonitor.snapshot();
    const diagnosticsState = diagnosticsRecovery.snapshot();
    const diagnostics = sortDiagnostics((diagnosticsState.diagnostics || []).map(normalizeDiagnostic));

    const eventComponent = runtimeState.components?.find((entry) => entry.name === "events") || null;
    const persistenceComponent = runtimeState.components?.find((entry) => entry.name === "persistence") || null;
    const status = worstStatus([
      operationsState.status,
      runtimeState.summary?.status,
      healthState.status,
      diagnosticsState.status
    ]);

    return freezeDeep({
      version: COCKPIT_SUPERVISION_SNAPSHOT_VERSION,
      generatedAt: String(now()),
      status,
      runtime: {
        version: runtimeState.runtime?.version || null,
        capabilities: [...(runtimeState.runtime?.capabilities || [])],
        components: [...(runtimeState.components || [])],
        summary: runtimeState.summary || null
      },
      registry: runtimeState.registry || null,
      events: {
        component: eventComponent,
        activity: operationsState.activity || null
      },
      persistence: {
        component: persistenceComponent
      },
      operations: operationsState,
      health: {
        status: normalizeStatus(healthState.status),
        summary: healthState.summary || null,
        freshness: healthState.freshness || null
      },
      diagnostics: {
        status: normalizeStatus(diagnosticsState.status),
        summary: diagnosticsState.summary || null,
        entries: diagnostics,
        recovery: [...(diagnosticsState.recovery || [])]
      }
    });
  }

  return Object.freeze({
    version: COCKPIT_SUPERVISION_SNAPSHOT_VERSION,
    snapshot
  });
}
