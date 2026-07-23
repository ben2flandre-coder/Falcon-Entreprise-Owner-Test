export const COCKPIT_CONTRACT_VERSION = "CockpitView@1.2";
export const COCKPIT_STATES = Object.freeze(["ready", "degraded", "empty"]);

const clone = (value) => value == null ? value : structuredClone(value);

const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freeze(item);
  return value;
};

function normalizeScope(scope = {}) {
  if (!scope.missionId) throw new TypeError("Cockpit view requires a missionId.");
  return {
    missionId: String(scope.missionId),
    sessionId: scope.sessionId == null ? null : String(scope.sessionId)
  };
}

function normalizeCapabilities(input = {}) {
  const reportRendering = Boolean(input.reportRendering);
  const exportAvailable = Boolean(input.export);
  return {
    reportRendering,
    export: exportAvailable,
    details: {
      reportRendering: {
        available: reportRendering,
        reason: reportRendering ? null : String(input.details?.reportRendering?.reason || "report-rendering-unavailable")
      },
      export: {
        available: exportAvailable,
        reason: exportAvailable ? null : String(input.details?.export?.reason || "enterprise-export-unavailable")
      }
    }
  };
}

function normalizeEvidence(input = {}) {
  const items = Array.isArray(input.items) ? clone(input.items) : [];
  return {
    items,
    observationCount: Number.isInteger(input.observationCount) ? input.observationCount : items.length,
    mediaCount: Number.isInteger(input.mediaCount)
      ? input.mediaCount
      : items.reduce((total, item) => total + (Array.isArray(item.media) ? item.media.length : 0), 0),
    truncated: Boolean(input.truncated)
  };
}

export function createCockpitView(input = {}) {
  const scope = normalizeScope(input.scope);
  const reasons = Array.isArray(input.freshness?.reasons)
    ? [...new Set(input.freshness.reasons.map(String))].sort()
    : [];
  const state = COCKPIT_STATES.includes(input.state)
    ? input.state
    : (reasons.length ? "degraded" : "ready");

  return freeze({
    contractVersion: COCKPIT_CONTRACT_VERSION,
    generatedAt: String(input.generatedAt || new Date().toISOString()),
    state,
    scope,
    mission: clone(input.mission) || null,
    alerts: Array.isArray(input.alerts) ? clone(input.alerts) : [],
    evidence: normalizeEvidence(input.evidence),
    radar: clone(input.radar) || null,
    trust: clone(input.trust) || null,
    report: clone(input.report) || null,
    capabilities: normalizeCapabilities(input.capabilities),
    sourceRevisions: {
      mission: Number.isInteger(input.sourceRevisions?.mission) ? input.sourceRevisions.mission : null,
      radar: Number.isInteger(input.sourceRevisions?.radar) ? input.sourceRevisions.radar : null,
      trust: Number.isInteger(input.sourceRevisions?.trust) ? input.sourceRevisions.trust : null,
      report: Number.isInteger(input.sourceRevisions?.report) ? input.sourceRevisions.report : null
    },
    freshness: {
      stale: Boolean(input.freshness?.stale || reasons.length),
      checkedAt: String(input.freshness?.checkedAt || input.generatedAt || new Date().toISOString()),
      reasons
    }
  });
}
