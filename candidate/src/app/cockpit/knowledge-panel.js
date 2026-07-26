function metric(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)} %` : "Non évaluée";
}

export function createKnowledgePanel(view) {
  const section = document.createElement("section");
  section.id = "cockpit-enterprise-knowledge";
  section.className = "falcon-cockpit-panel falcon-knowledge-panel";
  section.setAttribute("aria-labelledby", "cockpit-enterprise-knowledge-title");

  const title = document.createElement("h2");
  title.id = "cockpit-enterprise-knowledge-title";
  title.textContent = "Expertises mobilisées";
  section.append(title);

  const panel = view?.knowledge;
  if (!panel) {
    const empty = document.createElement("p");
    empty.textContent = "Aucune expertise EKI n’a encore été mobilisée pour cette mission.";
    section.append(empty);
    return section;
  }

  const summary = document.createElement("p");
  summary.textContent =
    `${panel.items.length} expertise(s) · couverture ${metric(panel.summary.coverage)} · décision humaine requise`;
  section.append(summary);

  const list = document.createElement("ol");
  for (const item of panel.items) {
    const node = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = item.title;
    const detail = document.createElement("span");
    detail.textContent =
      ` — ${item.status === "ready-for-human-analysis" ? "prête pour analyse humaine" : "validation requise"}`
      + ` · ${item.missingInputCount} entrée(s) manquante(s)`;
    node.append(label, detail);
    list.append(node);
  }
  section.append(list);

  const proof = document.createElement("p");
  proof.className = "falcon-knowledge-proof";
  proof.textContent = `Empreinte de preuve : ${panel.proofFingerprint}`;
  section.append(proof);
  return section;
}
