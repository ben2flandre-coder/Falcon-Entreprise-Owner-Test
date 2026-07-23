export const COCKPIT_REFRESH_CONTRACT_VERSION = "CockpitRefreshContract@1.0";

export const COCKPIT_REFRESH_ZONES = Object.freeze({
  HEADER: "cockpit-header",
  SUMMARY: "cockpit-summary",
  EXECUTIVE_DASHBOARD: "executive-dashboard",
  CAPABILITIES: "cockpit-capabilities",
  TIMELINE: "decision-timeline",
  EVIDENCE: "evidence-panel",
  GRAPH: "decision-graph",
  ARBITRATION: "arbitration-center"
});

const Z = COCKPIT_REFRESH_ZONES;

const TARGETS = Object.freeze({
  "Mission.Changed": Object.freeze({ mode: "full", zones: Object.freeze([]) }),
  "Session.Changed": Object.freeze({ mode: "full", zones: Object.freeze([]) }),
  "Folder.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.EVIDENCE, Z.GRAPH, Z.ARBITRATION]) }),
  "Observation.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.SUMMARY, Z.EXECUTIVE_DASHBOARD, Z.TIMELINE, Z.EVIDENCE, Z.GRAPH, Z.ARBITRATION]) }),
  "Media.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.EVIDENCE, Z.GRAPH, Z.ARBITRATION]) }),
  "Criticality.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.SUMMARY, Z.EXECUTIVE_DASHBOARD, Z.TIMELINE, Z.GRAPH, Z.ARBITRATION]) }),
  "Radar.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.SUMMARY, Z.EXECUTIVE_DASHBOARD, Z.TIMELINE, Z.GRAPH, Z.ARBITRATION]) }),
  "Trust.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.SUMMARY, Z.EXECUTIVE_DASHBOARD, Z.TIMELINE, Z.GRAPH, Z.ARBITRATION]) }),
  "Report.Changed": Object.freeze({ mode: "targeted", zones: Object.freeze([Z.SUMMARY, Z.EXECUTIVE_DASHBOARD, Z.CAPABILITIES, Z.TIMELINE, Z.GRAPH, Z.ARBITRATION]) })
});

const NONE = Object.freeze({ mode: "none", zones: Object.freeze([]) });

function normalizeEventType(eventOrType) {
  const value = typeof eventOrType === "string" ? eventOrType : eventOrType?.type;
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCockpitRefresh(eventOrType) {
  const type = normalizeEventType(eventOrType);
  return TARGETS[type] || NONE;
}

export function listCockpitRefreshEventTypes() {
  return Object.freeze(Object.keys(TARGETS));
}

export function createCockpitRefreshContract() {
  return Object.freeze({
    version: COCKPIT_REFRESH_CONTRACT_VERSION,
    zones: COCKPIT_REFRESH_ZONES,
    eventTypes: listCockpitRefreshEventTypes(),
    resolve: resolveCockpitRefresh
  });
}
