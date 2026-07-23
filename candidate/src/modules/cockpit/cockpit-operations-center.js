import { createCockpitOperationsJournal } from "./cockpit-operations-journal.js";

export const COCKPIT_OPERATIONS_CENTER_VERSION = "CockpitOperationsCenter@1.0";

const HEALTH_SEVERITY = Object.freeze({
  healthy: "info",
  available: "info",
  fresh: "info",
  degraded: "warning",
  warning: "warning",
  stale: "warning",
  critical: "critical",
  unavailable: "critical",
  unknown: "warning"
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function clone(value) {
  return value === undefined ? null : structuredClone(value);
}

function requireSnapshotApi(api) {
  if (!api?.snapshot || typeof api.snapshot !== "function") {
    throw new TypeError("Cockpit operations center requires a supervision snapshot API.");
  }
}

function normalizeStatus(value) {
  return Object.hasOwn(HEALTH_SEVERITY, value) ? value : "unknown";
}

function severityFor(status, explicitSeverity = null) {
  if (["info", "warning", "critical"].includes(explicitSeverity)) return explicitSeverity;
  return HEALTH_SEVERITY[normalizeStatus(status)];
}

function normalizedTimestamp(value, fallback) {
  return Number.isNaN(Date.parse(value)) ? fallback : new Date(value).toISOString();
}

function sumCounters(counters = {}) {
  return Object.values(counters).reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function componentIndicators(components = []) {
  const available = components.filter((entry) => entry?.status === "available").length;
  const unavailable = components.filter((entry) => entry?.status === "unavailable").length;
  return { total: components.length, available, unavailable };
}

function freshnessIndicators(freshness = {}) {
  const states = Object.values(freshness).map((entry) => normalizeStatus(entry?.status));
  return {
    total: states.length,
    fresh: states.filter((status) => status === "fresh").length,
    stale: states.filter((status) => status === "stale").length,
    unknown: states.filter((status) => status === "unknown").length
  };
}

function deriveIndicators(supervision, journalSnapshot) {
  const components = componentIndicators(supervision.runtime?.components || []);
  const freshness = freshnessIndicators(supervision.health?.freshness || {});
  const activity = supervision.events?.activity || {};
  const diagnostics = supervision.diagnostics?.entries || [];

  return freezeDeep({
    overallHealth: normalizeStatus(supervision.status),
    activityVolume: Number.isFinite(activity.sequence) ? activity.sequence : sumCounters(activity.counters),
    retainedEventCount: Number.isFinite(activity.retainedEvents) ? activity.retainedEvents : 0,
    warningCount: diagnostics.filter((entry) => entry?.severity === "warning").length,
    criticalCount: diagnostics.filter((entry) => entry?.severity === "critical").length,
    components,
    freshness,
    journal: clone(journalSnapshot.retention)
  });
}

export function createCockpitOperationsCenter({
  supervision,
  journal = createCockpitOperationsJournal(),
  now = () => new Date().toISOString()
} = {}) {
  requireSnapshotApi(supervision);
  if (!journal?.record || !journal?.snapshot || !journal?.latest || !journal?.query) {
    throw new TypeError("Cockpit operations center requires an operations journal API.");
  }
  if (typeof now !== "function") throw new TypeError("Cockpit operations center clock must be a function.");

  let lastSupervision = null;

  function recordSupervision(snapshot, timestamp) {
    journal.record({
      timestamp,
      type: "supervision",
      severity: severityFor(snapshot.status),
      status: normalizeStatus(snapshot.status),
      source: "cockpit-supervision",
      code: "SUPERVISION_SNAPSHOT",
      message: "Cockpit supervision snapshot captured.",
      details: { version: snapshot.version, generatedAt: snapshot.generatedAt }
    });

    const activity = snapshot.events?.activity;
    if (activity) {
      journal.record({
        timestamp,
        type: "activity",
        severity: "info",
        status: "available",
        source: "event-activity",
        code: "EVENT_ACTIVITY",
        message: "Observable technical event activity captured.",
        details: activity
      });
    }

    for (const diagnostic of snapshot.diagnostics?.entries || []) {
      journal.record({
        timestamp,
        type: "diagnostic",
        severity: severityFor(diagnostic.severity, diagnostic.severity),
        status: diagnostic.severity === "critical" ? "critical" : "warning",
        source: diagnostic.component || "diagnostics",
        code: diagnostic.code || "UNKNOWN_DIAGNOSTIC",
        message: diagnostic.message || "Technical diagnostic unavailable.",
        details: diagnostic
      });
    }

    for (const component of snapshot.runtime?.components || []) {
      journal.record({
        timestamp,
        type: "component",
        severity: severityFor(component.status),
        status: normalizeStatus(component.status),
        source: component.name || "runtime-component",
        code: `COMPONENT_${String(component.name || "unknown").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
        message: `Runtime component ${component.name || "unknown"} is ${component.status || "unknown"}.`,
        details: component
      });
    }

    for (const [source, state] of Object.entries(snapshot.health?.freshness || {}).sort(([left], [right]) => left.localeCompare(right))) {
      journal.record({
        timestamp,
        type: "freshness",
        severity: severityFor(state?.status),
        status: normalizeStatus(state?.status),
        source,
        code: `FRESHNESS_${source.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
        message: `${source} snapshot freshness is ${state?.status || "unknown"}.`,
        details: state
      });
    }
  }

  function refresh() {
    const snapshot = supervision.snapshot();
    const fallback = normalizedTimestamp(now(), new Date(0).toISOString());
    const timestamp = normalizedTimestamp(snapshot.generatedAt, fallback);
    lastSupervision = freezeDeep(clone(snapshot));
    recordSupervision(lastSupervision, timestamp);
    return state();
  }

  function indicators() {
    const journalSnapshot = journal.snapshot();
    return deriveIndicators(lastSupervision || {}, journalSnapshot);
  }

  function timeline(options = {}) {
    return journal.query(options);
  }

  function latest(limit) {
    return limit === undefined ? journal.latest() : journal.latest(limit);
  }

  function state() {
    const journalSnapshot = journal.snapshot();
    return freezeDeep({
      version: COCKPIT_OPERATIONS_CENTER_VERSION,
      generatedAt: normalizedTimestamp(now(), new Date(0).toISOString()),
      supervision: clone(lastSupervision),
      indicators: deriveIndicators(lastSupervision || {}, journalSnapshot),
      timeline: clone(journalSnapshot.entries),
      retention: clone(journalSnapshot.retention)
    });
  }

  return Object.freeze({
    version: COCKPIT_OPERATIONS_CENTER_VERSION,
    refresh,
    indicators,
    timeline,
    latest,
    state
  });
}
