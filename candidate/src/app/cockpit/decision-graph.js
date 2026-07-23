const LAYER_LABELS = Object.freeze({ context: "Contexte", evidence: "Preuves", analysis: "Analyses", decision: "Décision" });
const TYPE_LABELS = Object.freeze({ mission: "Mission", folder: "Dossier", observation: "Observation", media: "Média", alert: "Criticité", radar: "Radar", trust: "Confiance", report: "Rapport" });
const RELATION_LABELS = Object.freeze({ contains: "contient", documents: "documente", evaluates: "évalue", contributes: "alimente", supports: "étaye", materializes: "formalise" });

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freeze(item);
  return value;
}

function addNode(nodes, input) {
  if (!input.id || nodes.has(input.id)) return;
  nodes.set(input.id, { ...input });
}

function addEdge(edges, from, to, relation) {
  if (!from || !to) return;
  const id = `${from}:${relation}:${to}`;
  if (edges.some((item) => item.id === id)) return;
  edges.push({ id, from, to, relation, label: RELATION_LABELS[relation] || relation });
}

export function createDecisionGraphModel(view) {
  if (!view?.scope?.missionId) throw new TypeError("Le graphe décisionnel nécessite une vue du cockpit.");
  const nodes = new Map();
  const edges = [];
  const missionId = `mission:${view.scope.missionId}`;

  addNode(nodes, { id: missionId, type: "mission", layer: "context", label: view.mission?.name || "Mission active", detail: view.mission?.status || "Statut non disponible" });

  for (const item of view.evidence?.items || []) {
    const observation = item.observation;
    const observationId = `observation:${observation.id}`;
    let parentId = missionId;
    if (observation.folderId) {
      const folderId = `folder:${observation.folderId}`;
      addNode(nodes, { id: folderId, type: "folder", layer: "context", label: `Dossier ${observation.folderId}`, detail: "Regroupement documentaire" });
      addEdge(edges, missionId, folderId, "contains");
      parentId = folderId;
    }
    addNode(nodes, { id: observationId, type: "observation", layer: "evidence", label: observation.title, detail: `${observation.kind || "Observation"} · ${observation.severity || "gravité non renseignée"}` });
    addEdge(edges, parentId, observationId, "contains");

    for (const medium of item.media || []) {
      const mediaId = `media:${medium.id}`;
      addNode(nodes, { id: mediaId, type: "media", layer: "evidence", label: medium.caption || medium.fileName, detail: medium.kind || "Média" });
      addEdge(edges, mediaId, observationId, "documents");
    }
  }

  for (const alert of view.alerts || []) {
    const alertId = `alert:${alert.id}`;
    addNode(nodes, { id: alertId, type: "alert", layer: "analysis", label: `Criticité ${alert.level || "non qualifiée"}`, detail: `Score ${alert.score ?? "non disponible"}` });
    addEdge(edges, `observation:${alert.observationId}`, alertId, "evaluates");
  }

  if (view.radar) {
    const radarId = `radar:${view.radar.id}`;
    addNode(nodes, { id: radarId, type: "radar", layer: "analysis", label: "Analyse Radar", detail: view.radar.result?.interpretationStatus || "Analyse systémique" });
    addEdge(edges, missionId, radarId, "contributes");
    for (const alert of view.alerts || []) addEdge(edges, `alert:${alert.id}`, radarId, "contributes");
  }

  if (view.trust) {
    const trustId = `trust:${view.trust.id}`;
    addNode(nodes, { id: trustId, type: "trust", layer: "analysis", label: "Indice de confiance", detail: view.trust.result?.interpretationStatus || "Solidité de l’analyse" });
    if (view.radar) addEdge(edges, `radar:${view.radar.id}`, trustId, "supports");
  }

  if (view.report) {
    const reportId = `report:${view.report.id}`;
    addNode(nodes, { id: reportId, type: "report", layer: "decision", label: view.report.title || "Rapport décisionnel", detail: view.report.status || "Statut non disponible" });
    if (view.trust) addEdge(edges, `trust:${view.trust.id}`, reportId, "materializes");
    else if (view.radar) addEdge(edges, `radar:${view.radar.id}`, reportId, "materializes");
  }

  return freeze({ nodes: [...nodes.values()], edges });
}

function createNode(node) {
  const article = document.createElement("article");
  article.className = "falcon-graph-node";
  article.dataset.type = node.type;
  const type = document.createElement("p");
  type.className = "falcon-graph-node__type";
  type.textContent = TYPE_LABELS[node.type] || "Élément";
  const title = document.createElement("h3");
  title.textContent = node.label;
  const detail = document.createElement("p");
  detail.textContent = node.detail;
  article.append(type, title, detail);
  return article;
}

export function createDecisionGraph(view) {
  const model = createDecisionGraphModel(view);
  const section = document.createElement("section");
  section.id = "cockpit-decision-graph";
  section.className = "falcon-decision-graph";
  section.setAttribute("aria-labelledby", "cockpit-decision-graph-title");
  const title = document.createElement("h2");
  title.id = "cockpit-decision-graph-title";
  title.textContent = "Graphe décisionnel";
  const lead = document.createElement("p");
  lead.className = "falcon-decision-graph__lead";
  lead.textContent = "Lecture de la chaîne de traçabilité, du contexte jusqu’au rapport décisionnel.";
  const layers = document.createElement("div");
  layers.className = "falcon-graph-layers";

  for (const layer of ["context", "evidence", "analysis", "decision"]) {
    const column = document.createElement("section");
    column.className = "falcon-graph-layer";
    column.dataset.layer = layer;
    const heading = document.createElement("h3");
    heading.textContent = LAYER_LABELS[layer];
    const list = document.createElement("div");
    list.className = "falcon-graph-layer__nodes";
    for (const node of model.nodes.filter((item) => item.layer === layer)) list.append(createNode(node));
    if (!list.children.length) {
      const empty = document.createElement("p");
      empty.className = "falcon-graph-layer__empty";
      empty.textContent = "Aucun élément disponible.";
      list.append(empty);
    }
    column.append(heading, list);
    layers.append(column);
  }

  const relations = document.createElement("details");
  relations.className = "falcon-graph-relations";
  const summary = document.createElement("summary");
  summary.textContent = `Relations de traçabilité (${model.edges.length})`;
  const relationList = document.createElement("ul");
  for (const edge of model.edges) {
    const from = model.nodes.find((node) => node.id === edge.from)?.label || edge.from;
    const to = model.nodes.find((node) => node.id === edge.to)?.label || edge.to;
    const item = document.createElement("li");
    item.textContent = `${from} ${edge.label} ${to}.`;
    relationList.append(item);
  }
  relations.append(summary, relationList);
  section.append(title, lead, layers, relations);
  return section;
}
