const REASON_LABELS = Object.freeze({
  "radar-unavailable": "Analyse Radar indisponible",
  "trust-unavailable": "Évaluation de confiance indisponible",
  "trust-outdated": "Évaluation de confiance désynchronisée",
  "report-unavailable": "Rapport décisionnel indisponible"
});

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freeze(item);
  return value;
}

function item(id, title, detail, sourceIds = []) {
  return { id, title, detail, sourceIds: [...sourceIds] };
}

export function createArbitrationModel(view) {
  if (!view?.scope?.missionId) throw new TypeError("Le centre d’arbitrage nécessite une vue du cockpit.");

  const evidenceByObservation = new Map((view.evidence?.items || []).map((entry) => [entry.observation.id, entry]));
  const convergences = [];
  const divergences = [];
  const pending = [];
  const impacts = [];

  for (const alert of view.alerts || []) {
    const evidence = evidenceByObservation.get(alert.observationId);
    if (evidence) {
      convergences.push(item(
        `convergence:${alert.id}`,
        "Criticité étayée par une observation",
        `L’alerte ${alert.level || "non qualifiée"} est reliée à « ${evidence.observation.title} » et à ${evidence.media.length} média(s).`,
        [alert.id, evidence.observation.id, ...evidence.media.map((medium) => medium.id)]
      ));
    } else {
      divergences.push(item(
        `divergence:${alert.id}`,
        "Alerte sans preuve visible dans le cockpit",
        `L’alerte associée à l’observation ${alert.observationId} ne dispose pas d’une observation projetée dans la vue actuelle.`,
        [alert.id, alert.observationId]
      ));
    }
    pending.push(item(
      `pending:${alert.id}`,
      "Validation humaine d’une alerte critique",
      `Examiner le niveau ${alert.level || "non qualifié"}, le score ${alert.score ?? "non disponible"} et les preuves associées avant arbitrage.`,
      [alert.id, alert.observationId]
    ));
  }

  if (view.radar && view.trust && !view.freshness?.reasons?.includes("trust-outdated")) {
    convergences.push(item(
      "convergence:radar-trust",
      "Radar et confiance synchronisés",
      "L’évaluation de confiance porte sur la révision Radar actuellement affichée.",
      [view.radar.id, view.trust.id]
    ));
  }

  for (const reason of view.freshness?.reasons || []) {
    divergences.push(item(
      `freshness:${reason}`,
      REASON_LABELS[reason] || "Donnée à consolider",
      "La chaîne décisionnelle comporte une information absente ou désynchronisée qui doit être examinée avant validation.",
      []
    ));
  }

  if (view.evidence?.truncated) {
    divergences.push(item(
      "evidence:truncated",
      "Vue des preuves partielle",
      "Le cockpit affiche uniquement les vingt observations les plus récentes.",
      []
    ));
  }

  if (view.report) {
    impacts.push(item(
      "impact:report",
      "Rapport déjà matérialisé",
      `Un rapport au statut « ${view.report.status || "non renseigné"} » est présent dans la chaîne de décision.`,
      [view.report.id]
    ));
  } else {
    pending.push(item(
      "pending:report",
      "Décider du moment de production du rapport",
      "Aucun rapport décisionnel n’est disponible pour cette portée.",
      []
    ));
  }

  if (view.capabilities?.export) {
    impacts.push(item(
      "impact:export",
      "Export disponible",
      "La décision validée pourra être transmise via le service d’export Enterprise.",
      []
    ));
  }

  if (!pending.length && !divergences.length) {
    pending.push(item(
      "pending:final-validation",
      "Validation finale par le décideur",
      "Les éléments disponibles sont cohérents, mais la décision demeure exclusivement humaine.",
      []
    ));
  }

  return freeze({ convergences, divergences, pending, impacts });
}

function createList(items, emptyMessage) {
  const list = document.createElement("ul");
  list.className = "falcon-arbitration-list";
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "falcon-arbitration-list__empty";
    empty.textContent = emptyMessage;
    list.append(empty);
    return list;
  }
  for (const entry of items) {
    const row = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const detail = document.createElement("p");
    detail.textContent = entry.detail;
    row.append(title, detail);
    list.append(row);
  }
  return list;
}

function createPanel(title, count, items, emptyMessage, tone) {
  const panel = document.createElement("section");
  panel.className = "falcon-arbitration-panel";
  panel.dataset.tone = tone;
  const heading = document.createElement("h3");
  heading.textContent = `${title} (${count})`;
  panel.append(heading, createList(items, emptyMessage));
  return panel;
}

export function createArbitrationCenter(view) {
  const model = createArbitrationModel(view);
  const section = document.createElement("section");
  section.id = "cockpit-arbitration-center";
  section.className = "falcon-arbitration-center";
  section.setAttribute("aria-labelledby", "cockpit-arbitration-center-title");

  const title = document.createElement("h2");
  title.id = "cockpit-arbitration-center-title";
  title.textContent = "Centre d’arbitrage";
  const lead = document.createElement("p");
  lead.className = "falcon-arbitration-center__lead";
  lead.textContent = "Mise en perspective des éléments cohérents, des écarts à traiter et des validations qui relèvent du décideur.";
  const doctrine = document.createElement("p");
  doctrine.className = "falcon-arbitration-center__doctrine";
  doctrine.textContent = "Falcon structure l’arbitrage. La décision reste humaine.";

  const grid = document.createElement("div");
  grid.className = "falcon-arbitration-grid";
  grid.append(
    createPanel("Convergences", model.convergences.length, model.convergences, "Aucune convergence explicite disponible.", "positive"),
    createPanel("Divergences et vigilances", model.divergences.length, model.divergences, "Aucune divergence détectée dans la vue actuelle.", "attention"),
    createPanel("Validations humaines requises", model.pending.length, model.pending, "Aucune validation spécifique en attente.", "decision"),
    createPanel("Impacts observables", model.impacts.length, model.impacts, "Aucun impact matérialisé dans la vue actuelle.", "neutral")
  );

  section.append(title, lead, doctrine, grid);
  return section;
}
