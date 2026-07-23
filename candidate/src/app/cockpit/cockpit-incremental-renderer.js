import { COCKPIT_REFRESH_ZONES } from "../../modules/cockpit/cockpit-refresh-contract.js";
import { createHeader, createSummary, createDashboardZone, createCapabilities, createCockpitShell } from "./cockpit-shell.js";
import { createDecisionTimeline } from "./decision-timeline.js";
import { createEvidencePanel } from "./evidence-panel.js";
import { createDecisionGraph } from "./decision-graph.js";
import { createArbitrationCenter } from "./arbitration-center.js";

const Z = COCKPIT_REFRESH_ZONES;
const FACTORIES = Object.freeze({
  [Z.HEADER]: createHeader,
  [Z.SUMMARY]: createSummary,
  [Z.EXECUTIVE_DASHBOARD]: createDashboardZone,
  [Z.CAPABILITIES]: createCapabilities,
  [Z.TIMELINE]: createDecisionTimeline,
  [Z.EVIDENCE]: createEvidencePanel,
  [Z.GRAPH]: createDecisionGraph,
  [Z.ARBITRATION]: createArbitrationCenter
});

const NOOP_MONITOR = Object.freeze({
  measure: (_name, operation) => operation(),
  snapshot: () => Object.freeze({ enabled: false, metrics: Object.freeze({}) }),
  evaluate: () => Object.freeze({ passed: true, violations: Object.freeze([]) }),
  reset: () => {}
});

function captureOpenDetails(root) {
  const open = new Set();
  for (const node of root.querySelectorAll?.("details[open][id]") || []) open.add(node.id);
  return open;
}

function restoreOpenDetails(root, open) {
  for (const id of open) root.ownerDocument?.getElementById?.(id)?.setAttribute("open", "");
}

export function createCockpitIncrementalRenderer({ root, queryService, performanceMonitor = NOOP_MONITOR } = {}) {
  if (!root || typeof root.replaceChildren !== "function" || typeof root.querySelector !== "function") throw new TypeError("Le rendu incrémental nécessite une racine DOM.");
  if (!queryService || typeof queryService.getOverview !== "function") throw new TypeError("Le rendu incrémental nécessite un service de lecture du cockpit.");
  if (!performanceMonitor || typeof performanceMonitor.measure !== "function") throw new TypeError("Le rendu incrémental nécessite un moniteur de performance compatible.");

  let scope = null;
  let view = null;

  function readView() {
    return performanceMonitor.measure("view-read", () => queryService.getOverview(scope));
  }

  function renderFull(nextScope = scope) {
    if (!nextScope?.missionId) throw new TypeError("Une portée Mission est requise.");
    scope = { missionId: String(nextScope.missionId), sessionId: nextScope.sessionId == null ? null : String(nextScope.sessionId) };
    view = readView();
    performanceMonitor.measure("full-render", () => root.replaceChildren(createCockpitShell(view)));
    return view;
  }

  function renderBatch(batch) {
    if (!scope) throw new Error("Le cockpit doit être rendu une première fois avant une mise à jour incrémentale.");
    if (!batch || batch.mode === "none") return view;
    if (batch.mode === "full") return renderFull(scope);

    const nextView = readView();
    const openDetails = captureOpenDetails(root);
    const scrollX = globalThis.scrollX || 0;
    const scrollY = globalThis.scrollY || 0;
    const zones = [...new Set((batch.zones || []).map(String))].sort();

    performanceMonitor.measure("targeted-render", () => {
      for (const zone of zones) {
        const factory = FACTORIES[zone];
        if (!factory) continue;
        const current = root.querySelector(`#${zone}`);
        if (!current || typeof current.replaceWith !== "function") continue;
        current.replaceWith(factory(nextView));
      }
      const shell = root.querySelector(".falcon-decision-cockpit");
      if (shell) shell.dataset.state = nextView.state;
      restoreOpenDetails(root, openDetails);
      globalThis.scrollTo?.(scrollX, scrollY);
    }, { zoneCount: zones.length });

    view = nextView;
    return view;
  }

  return Object.freeze({
    renderFull,
    renderBatch,
    currentView: () => view,
    currentScope: () => scope ? { ...scope } : null,
    performanceSnapshot: () => performanceMonitor.snapshot?.(),
    performanceEvaluation: () => performanceMonitor.evaluate?.(),
    resetPerformance: () => performanceMonitor.reset?.()
  });
}
