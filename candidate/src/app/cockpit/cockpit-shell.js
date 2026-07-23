import { createExecutiveCard } from "./executive-card.js";
import { createExecutiveDashboard } from "./executive-dashboard.js";
import { createDecisionTimeline } from "./decision-timeline.js";
import { createEvidencePanel } from "./evidence-panel.js";
import { createDecisionGraph } from "./decision-graph.js";
import { createArbitrationCenter } from "./arbitration-center.js";

const STATUS_LABELS = Object.freeze({ ready: "Lecture décisionnelle à jour", degraded: "Lecture décisionnelle à consolider", empty: "Aucune analyse disponible" });
function metric(value, fallback = "Non disponible") { return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : fallback; }
function stateDescription(view) {
  if (view.state === "ready") return "Les sources Radar, Trust et Rapport sont cohérentes pour cette portée.";
  if (view.state === "empty") return "Le cockpit est prêt. Lancez une analyse Radar pour alimenter la lecture décisionnelle.";
  return `Points à consolider : ${view.freshness.reasons.join(", ") || "données incomplètes"}.`;
}

export function createHeader(view) {
  const header = document.createElement("header"); header.id = "cockpit-header"; header.className = "falcon-cockpit-header";
  const identity = document.createElement("div");
  const eyebrow = document.createElement("p"); eyebrow.className = "falcon-cockpit-eyebrow"; eyebrow.textContent = view.scope.sessionId ? "Session décisionnelle" : "Mission décisionnelle";
  const title = document.createElement("h1"); title.id = "falcon-cockpit-title"; title.textContent = view.mission?.name || "Cockpit décisionnel";
  identity.append(eyebrow, title);
  const badge = document.createElement("p"); badge.className = "falcon-cockpit-state"; badge.dataset.state = view.state; badge.setAttribute("role", "status"); badge.textContent = STATUS_LABELS[view.state] || STATUS_LABELS.degraded;
  header.append(identity, badge); return header;
}

function createNavigation() {
  const nav = document.createElement("nav"); nav.className = "falcon-cockpit-nav"; nav.setAttribute("aria-label", "Navigation du cockpit");
  for (const [label, href] of [["Synthèse", "#cockpit-summary"], ["Mission", "#cockpit-mission"], ["Radar", "#cockpit-radar-summary"], ["Alertes", "#cockpit-critical-alerts"], ["Confiance", "#cockpit-trust-indicators"], ["Chronologie", "#cockpit-decision-timeline"], ["Preuves", "#cockpit-evidence-panel"], ["Graphe", "#cockpit-decision-graph"], ["Arbitrage", "#cockpit-arbitration-center"]]) {
    const link = document.createElement("a"); link.href = href; link.textContent = label; nav.append(link);
  }
  return nav;
}

export function createSummary(view) {
  const section = document.createElement("section"); section.id = "cockpit-summary"; section.className = "falcon-cockpit-section"; section.setAttribute("aria-labelledby", "cockpit-summary-title");
  const title = document.createElement("h2"); title.id = "cockpit-summary-title"; title.className = "falcon-cockpit-section__title"; title.textContent = "Synthèse exécutive";
  const description = document.createElement("p"); description.className = "falcon-cockpit-section__lead"; description.textContent = stateDescription(view);
  const grid = document.createElement("div"); grid.className = "falcon-cockpit-grid";
  grid.append(
    createExecutiveCard({ id: "cockpit-alerts-card", title: "Alertes critiques", value: view.alerts.length, description: "Éléments actifs à examiner.", status: view.alerts.length ? "attention" : "neutral", href: "#cockpit-critical-alerts" }),
    createExecutiveCard({ id: "cockpit-radar-card", title: "Radar", value: view.radar ? metric(view.radar.result?.score, "Disponible") : "Non disponible", description: view.radar?.result?.interpretationStatus || "Analyse non produite.", status: view.radar ? "active" : "neutral", href: "#cockpit-radar-summary" }),
    createExecutiveCard({ id: "cockpit-trust-card", title: "Confiance", value: view.trust ? metric(view.trust.result?.trustIndex, "Disponible") : "Non disponible", description: view.trust?.result?.interpretationStatus || "Solidité non qualifiée.", status: view.freshness.reasons.includes("trust-outdated") ? "attention" : (view.trust ? "active" : "neutral"), href: "#cockpit-trust-indicators" }),
    createExecutiveCard({ id: "cockpit-report-card", title: "Rapport", value: view.report?.status || "Non disponible", description: view.capabilities.reportRendering ? "Rendu disponible." : "Rendu indisponible.", status: view.report ? "active" : "neutral" })
  ); section.append(title, description, grid); return section;
}

export function createDashboardZone(view) {
  const node = createExecutiveDashboard(view);
  node.id = "executive-dashboard";
  return node;
}

export function createCapabilities(view) {
  const aside = document.createElement("aside"); aside.id = "cockpit-capabilities"; aside.className = "falcon-cockpit-panel falcon-cockpit-panel--secondary"; aside.setAttribute("aria-label", "État des capacités");
  const title = document.createElement("h2"); title.textContent = "Capacités disponibles";
  const list = document.createElement("ul");
  for (const [label, available] of [["Rendu du rapport", view.capabilities.reportRendering], ["Export Enterprise", view.capabilities.export]]) { const item = document.createElement("li"); item.textContent = `${label} : ${available ? "disponible" : "indisponible"}`; list.append(item); }
  aside.append(title, list); return aside;
}

export function createCockpitShell(view) {
  if (!view || !view.scope?.missionId) throw new TypeError("Cockpit shell requires a CockpitView.");
  const container = document.createElement("section"); container.className = "falcon-decision-cockpit"; container.dataset.state = view.state; container.setAttribute("aria-labelledby", "falcon-cockpit-title");
  const workspace = document.createElement("div"); workspace.className = "falcon-cockpit-workspace"; workspace.append(createDashboardZone(view), createCapabilities(view));
  container.append(createHeader(view), createNavigation(), createSummary(view), workspace, createDecisionTimeline(view), createEvidencePanel(view), createDecisionGraph(view), createArbitrationCenter(view)); return container;
}
