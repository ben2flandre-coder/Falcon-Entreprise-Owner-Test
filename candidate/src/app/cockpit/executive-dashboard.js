function text(value, fallback = "Non disponible") {
  return value == null || value === "" ? fallback : String(value);
}

function metric(value, fallback = "Non disponible") {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : fallback;
}

function section(id, title, description) {
  const node = document.createElement("section");
  node.id = id;
  node.className = "falcon-dashboard-section";
  node.setAttribute("aria-labelledby", `${id}-title`);
  const heading = document.createElement("h2");
  heading.id = `${id}-title`;
  heading.textContent = title;
  const lead = document.createElement("p");
  lead.className = "falcon-dashboard-section__lead";
  lead.textContent = description;
  node.append(heading, lead);
  return node;
}

function facts(entries) {
  const list = document.createElement("dl");
  list.className = "falcon-dashboard-facts";
  for (const [label, value] of entries) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = text(value);
    list.append(term, detail);
  }
  return list;
}

export function createMissionOverview(view) {
  const node = section("cockpit-mission", "Vue mission", "Périmètre et état de la mission active.");
  node.append(facts([
    ["Mission", view.mission?.name || view.scope.missionId],
    ["Statut", view.mission?.status],
    ["Session", view.scope.sessionId || "Vue mission"],
    ["Révision", view.sourceRevisions.mission]
  ]));
  return node;
}

export function createRadarSummary(view) {
  const node = section("cockpit-radar-summary", "Synthèse Radar", "Lecture systémique fournie par le Radar Engine.");
  node.append(facts([
    ["Score", metric(view.radar?.result?.score)],
    ["Interprétation", view.radar?.result?.interpretationStatus],
    ["Couverture", metric(view.radar?.result?.coverage)],
    ["Révision", view.sourceRevisions.radar]
  ]));
  return node;
}

export function createCriticalAlerts(view) {
  const node = section("cockpit-critical-alerts", "Alertes critiques", "Criticités déjà calculées, classées par le service de lecture.");
  const list = document.createElement("ol");
  list.className = "falcon-alert-list";
  if (!view.alerts.length) {
    const item = document.createElement("li");
    item.className = "falcon-alert-list__empty";
    item.textContent = "Aucune alerte critique active.";
    list.append(item);
  } else {
    for (const alert of view.alerts) {
      const item = document.createElement("li");
      item.className = "falcon-alert-item";
      item.dataset.level = text(alert.level, "unknown");
      const heading = document.createElement("h3");
      heading.textContent = `Observation ${alert.observationId}`;
      const detail = document.createElement("p");
      detail.textContent = `Niveau ${text(alert.level)} · Score ${text(alert.score)} · Confiance ${text(alert.confidence)}`;
      item.append(heading, detail);
      list.append(item);
    }
  }
  node.append(list);
  return node;
}

export function createTrustIndicators(view) {
  const node = section("cockpit-trust-indicators", "Indicateurs de confiance", "Solidité de l’interprétation produite par le Trust Engine.");
  node.append(facts([
    ["Indice", metric(view.trust?.result?.trustIndex)],
    ["Niveau", view.trust?.result?.trustLevel],
    ["Interprétation", view.trust?.result?.interpretationStatus],
    ["Révision", view.sourceRevisions.trust]
  ]));
  if (view.freshness.reasons.includes("trust-outdated")) {
    const warning = document.createElement("p");
    warning.className = "falcon-dashboard-warning";
    warning.setAttribute("role", "status");
    warning.textContent = "L’évaluation Trust ne correspond pas à la dernière révision Radar.";
    node.append(warning);
  }
  return node;
}

export function createExecutiveDashboard(view) {
  if (!view?.scope?.missionId) throw new TypeError("Executive Dashboard requires a CockpitView.");
  const dashboard = document.createElement("div");
  dashboard.className = "falcon-executive-dashboard";
  dashboard.append(createMissionOverview(view), createRadarSummary(view), createCriticalAlerts(view), createTrustIndicators(view));
  return dashboard;
}
