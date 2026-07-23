const TYPE_LABELS = Object.freeze({
  mission: "Mission",
  radar: "Analyse Radar",
  trust: "Évaluation de confiance",
  report: "Rapport",
  alert: "Alerte critique"
});

function dateValue(item) {
  return item.updatedAt || item.createdAt || item.issuedAt || null;
}

function pushEvent(events, { id, type, title, description, date, revision = null, status = null }) {
  if (!id) return;
  events.push(Object.freeze({
    id: String(id),
    type,
    typeLabel: TYPE_LABELS[type] || "Événement",
    title: String(title),
    description: String(description || ""),
    date: date == null ? null : String(date),
    revision: Number.isInteger(revision) ? revision : null,
    status: status == null ? null : String(status)
  }));
}

export function createDecisionTimelineModel(view) {
  if (!view?.scope?.missionId) throw new TypeError("La chronologie nécessite une vue du cockpit.");
  const events = [];

  pushEvent(events, {
    id: `mission:${view.scope.missionId}`,
    type: "mission",
    title: view.mission?.name || "Mission active",
    description: "Périmètre décisionnel ouvert.",
    date: dateValue(view.mission || {}),
    revision: view.sourceRevisions?.mission,
    status: view.mission?.status
  });

  if (view.radar) pushEvent(events, {
    id: `radar:${view.radar.id}`,
    type: "radar",
    title: "Analyse systémique disponible",
    description: view.radar.result?.interpretationStatus || "Résultat Radar produit.",
    date: dateValue(view.radar),
    revision: view.sourceRevisions?.radar,
    status: view.radar.status
  });

  if (view.trust) pushEvent(events, {
    id: `trust:${view.trust.id}`,
    type: "trust",
    title: "Solidité de l’interprétation évaluée",
    description: view.trust.result?.interpretationStatus || "Évaluation Trust produite.",
    date: dateValue(view.trust),
    revision: view.sourceRevisions?.trust,
    status: view.trust.status
  });

  if (view.report) pushEvent(events, {
    id: `report:${view.report.id}`,
    type: "report",
    title: "Rapport décisionnel disponible",
    description: view.report.title || "Rapport Falcon généré.",
    date: dateValue(view.report),
    revision: view.sourceRevisions?.report,
    status: view.report.status
  });

  for (const alert of view.alerts || []) pushEvent(events, {
    id: `alert:${alert.id}`,
    type: "alert",
    title: `Alerte liée à l’observation ${alert.observationId}`,
    description: `Niveau ${alert.level || "non qualifié"} · score ${alert.score ?? "non disponible"}.`,
    date: alert.updatedAt,
    revision: alert.sourceRevision,
    status: alert.level
  });

  return Object.freeze(events.sort((a, b) => {
    const byDate = String(b.date || "").localeCompare(String(a.date || ""));
    return byDate || a.id.localeCompare(b.id);
  }));
}

function formatDate(value) {
  if (!value) return "Date non disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non disponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function createDecisionTimeline(view) {
  const events = createDecisionTimelineModel(view);
  const section = document.createElement("section");
  section.id = "cockpit-decision-timeline";
  section.className = "falcon-timeline";
  section.setAttribute("aria-labelledby", "cockpit-decision-timeline-title");

  const title = document.createElement("h2");
  title.id = "cockpit-decision-timeline-title";
  title.textContent = "Chronologie décisionnelle";
  const lead = document.createElement("p");
  lead.className = "falcon-timeline__lead";
  lead.textContent = "Jalons de la mission, des analyses et des éléments critiques, classés du plus récent au plus ancien.";
  const list = document.createElement("ol");
  list.className = "falcon-timeline__list";

  for (const event of events) {
    const item = document.createElement("li");
    item.className = "falcon-timeline__item";
    item.dataset.type = event.type;
    const meta = document.createElement("p");
    meta.className = "falcon-timeline__meta";
    meta.textContent = `${event.typeLabel} · ${formatDate(event.date)}${event.revision == null ? "" : ` · révision ${event.revision}`}`;
    const heading = document.createElement("h3");
    heading.textContent = event.title;
    const description = document.createElement("p");
    description.textContent = event.description;
    item.append(meta, heading, description);
    list.append(item);
  }

  if (!events.length) {
    const item = document.createElement("li");
    item.className = "falcon-timeline__empty";
    item.textContent = "Aucun jalon décisionnel disponible.";
    list.append(item);
  }

  section.append(title, lead, list);
  return section;
}
