const KIND_LABELS = Object.freeze({
  fact: "Fait observé",
  hazard: "Danger",
  nonconformity: "Non-conformité",
  "good-practice": "Bonne pratique",
  signal: "Signal faible"
});
const SEVERITY_LABELS = Object.freeze({ low: "Faible", moderate: "Modérée", high: "Élevée", critical: "Critique" });
const STATUS_LABELS = Object.freeze({ draft: "Brouillon", validated: "Validée", closed: "Clôturée" });
const MEDIA_LABELS = Object.freeze({ image: "Image", video: "Vidéo", audio: "Enregistrement audio", document: "Document", other: "Autre média" });

function label(dictionary, value, fallback = "Non renseigné") {
  return dictionary[value] || (value ? String(value) : fallback);
}

function formatSize(value) {
  if (!Number.isFinite(value)) return "Taille non disponible";
  if (value < 1024) return `${value} octets`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} ko`;
  return `${Math.round((value / (1024 * 1024)) * 10) / 10} Mo`;
}

function createMediaList(media) {
  const list = document.createElement("ul");
  list.className = "falcon-evidence-media";
  if (!media.length) {
    const item = document.createElement("li");
    item.textContent = "Aucun média associé.";
    list.append(item);
    return list;
  }
  for (const medium of media) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = medium.caption || medium.fileName;
    const detail = document.createElement("span");
    detail.textContent = `${label(MEDIA_LABELS, medium.kind)} · ${formatSize(medium.sizeBytes)} · révision ${medium.revision ?? "non disponible"}`;
    item.append(title, detail);
    list.append(item);
  }
  return list;
}

function createEvidenceItem(item) {
  const observation = item.observation;
  const details = document.createElement("details");
  details.id = `cockpit-evidence-${observation.id}`;
  details.className = "falcon-evidence-item";
  const summary = document.createElement("summary");
  const title = document.createElement("span");
  title.textContent = observation.title;
  const meta = document.createElement("span");
  meta.textContent = `${label(KIND_LABELS, observation.kind)} · Gravité ${label(SEVERITY_LABELS, observation.severity)}`;
  summary.append(title, meta);

  const body = document.createElement("div");
  body.className = "falcon-evidence-item__body";
  const description = document.createElement("p");
  description.textContent = observation.description || "Aucune description complémentaire.";
  const context = document.createElement("p");
  context.className = "falcon-evidence-item__context";
  context.textContent = `Statut ${label(STATUS_LABELS, observation.status)} · Lieu ${observation.location || "non renseigné"} · révision ${observation.revision ?? "non disponible"}`;
  const mediaTitle = document.createElement("h3");
  mediaTitle.textContent = `Médias associés (${item.media.length})`;
  body.append(description, context, mediaTitle, createMediaList(item.media));
  details.append(summary, body);
  return details;
}

export function createEvidencePanel(view) {
  if (!view?.evidence) throw new TypeError("Le panneau des preuves nécessite une vue du cockpit.");
  const section = document.createElement("section");
  section.id = "cockpit-evidence-panel";
  section.className = "falcon-evidence-panel";
  section.setAttribute("aria-labelledby", "cockpit-evidence-panel-title");
  const title = document.createElement("h2");
  title.id = "cockpit-evidence-panel-title";
  title.textContent = "Panneau des preuves";
  const lead = document.createElement("p");
  lead.className = "falcon-evidence-panel__lead";
  lead.textContent = `${view.evidence.observationCount} observation(s) et ${view.evidence.mediaCount} média(s) disponibles pour cette portée.`;
  const list = document.createElement("div");
  list.className = "falcon-evidence-list";
  if (!view.evidence.items.length) {
    const empty = document.createElement("p");
    empty.className = "falcon-evidence-panel__empty";
    empty.textContent = "Aucune preuve n’est encore disponible.";
    list.append(empty);
  } else {
    for (const item of view.evidence.items) list.append(createEvidenceItem(item));
  }
  if (view.evidence.truncated) {
    const notice = document.createElement("p");
    notice.className = "falcon-evidence-panel__notice";
    notice.textContent = "Seules les vingt observations les plus récentes sont affichées dans le cockpit.";
    list.append(notice);
  }
  section.append(title, lead, list);
  return section;
}
