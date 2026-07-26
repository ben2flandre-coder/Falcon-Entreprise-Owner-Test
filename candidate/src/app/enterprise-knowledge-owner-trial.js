const SCOPE_ID = "owner-trial";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function knowledgeService() {
  return window.FalconEnterprise?.runtime?.knowledge || null;
}

function currentPanel() {
  return knowledgeService()?.getCockpitPanel(SCOPE_ID) || null;
}

function currentRestitution() {
  return knowledgeService()?.getRestitution(SCOPE_ID) || null;
}

function renderResult(panel, restitution) {
  if (!panel || !restitution) {
    return `<div class="falcon-eki-empty" role="status">
      Choisissez un cas d’essai. Falcon affichera les expertises retenues, les sources,
      les données manquantes et les limites à arbitrer.
    </div>`;
  }
  const items = restitution.steps.map((step) => `
    <details class="falcon-eki-result">
      <summary>
        <strong>${escapeHtml(step.title)}</strong>
        <span class="tag ${step.status === "ready-for-human-analysis" ? "green" : "yellow"}">
          ${step.status === "ready-for-human-analysis" ? "prêt pour analyse humaine" : "validation requise"}
        </span>
      </summary>
      <p><strong>Méthodes :</strong> ${step.methods.map(escapeHtml).join(" · ")}</p>
      <p><strong>Entrées manquantes :</strong> ${
        step.missingRequiredInputs.length
          ? step.missingRequiredInputs.map(escapeHtml).join(" · ")
          : "aucune"
      }</p>
      <p><strong>Sources :</strong></p>
      <ul>${step.sources.map((source) =>
        `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.authority)} · ${escapeHtml(source.locator)}</a> — ${escapeHtml(source.lifecycle.state)}</li>`
      ).join("")}</ul>
      <p><strong>Limites :</strong> ${step.limitations.map(escapeHtml).join(" · ")}</p>
    </details>`).join("");
  return `<div class="falcon-eki-summary" data-state="${escapeHtml(panel.state)}">
    <div>
      <span class="tag ${panel.state === "ready" ? "green" : "yellow"}">${escapeHtml(panel.state)}</span>
      <strong>${panel.summary.selectedSkillCount} expertise(s) mobilisée(s)</strong>
      <span>Couverture ${Math.round(panel.summary.coverage * 100)} %</span>
    </div>
    <p><strong>Autorité de décision :</strong> humaine. Falcon structure et documente ; il ne conclut pas à la place du professionnel.</p>
    <p class="small">Empreinte de preuve : <code>${escapeHtml(panel.proofFingerprint)}</code></p>
  </div>${items}`;
}

export function renderEnterpriseKnowledgeOwnerTrial() {
  const service = knowledgeService();
  if (!service) return "";
  const selectedScenario = service.listAnalyses()
    .find(({ scopeId }) => scopeId === SCOPE_ID)?.scenarioId || null;
  const buttons = service.scenarios.map((scenario) => `
    <button class="btn ${selectedScenario === scenario.id ? "green" : "ghost"}"
      type="button" data-eki-scenario="${escapeHtml(scenario.id)}"
      onclick="falconRunKnowledgeScenario('${escapeHtml(scenario.id)}')">
      ${escapeHtml(scenario.title)}
    </button>`).join("");
  return `<section class="panel falcon-eki-owner-trial" data-falcon-eki-owner-trial="ready">
    <div class="section-title">
      <div>
        <span class="tag blue">Enterprise Knowledge Intelligence</span>
        <h3>Essais réels · expertises mobilisées</h3>
        <p class="small">Testez les six corpus EKI. Chaque résultat expose les sources, limites, entrées manquantes et l’empreinte de preuve.</p>
      </div>
      <span class="tag neutral">Décision humaine</span>
    </div>
    <div class="row falcon-eki-scenarios" role="group" aria-label="Cas d’essai EKI">${buttons}</div>
    <div data-falcon-eki-result>${renderResult(currentPanel(), currentRestitution())}</div>
  </section>`;
}

export function renderEnterpriseKnowledgeReportTrial() {
  const restitution = currentRestitution();
  if (!restitution) return "";
  return `<div class="box falcon-eki-report-section" data-falcon-eki-report="ready">
    <h2>Expertises, couverture et limites</h2>
    <p><strong>Empreinte de preuve :</strong> ${escapeHtml(restitution.proofFingerprint)}</p>
    <p><strong>Couverture :</strong> ${Math.round(restitution.summary.coverage * 100)} % ·
      <strong>Expertises :</strong> ${restitution.summary.selectedSkillCount} ·
      <strong>Autorité :</strong> décision humaine</p>
    ${restitution.steps.map((step) => `<h3>${escapeHtml(step.title)}</h3>
      <p><strong>Statut :</strong> ${escapeHtml(step.status)} · <strong>Corpus :</strong> ${escapeHtml(step.corpusId)}</p>
      <p><strong>Sources :</strong> ${step.sources.map((source) =>
        `${escapeHtml(source.authority)} — ${escapeHtml(source.locator)}`
      ).join(" · ")}</p>
      <p><strong>Limites :</strong> ${step.limitations.map(escapeHtml).join(" · ")}</p>`).join("")}
  </div>`;
}

export function installEnterpriseKnowledgeOwnerTrial() {
  const service = knowledgeService();
  if (!service) return false;

  window.falconRunKnowledgeScenario = function runKnowledgeScenario(scenarioId) {
    service.analyzeScenario(scenarioId, { scopeId: SCOPE_ID });
    try {
      window.FalconEnterprise.runtime.save({ origin: "eki-owner-trial" });
    } catch (error) {
      console.warn("EKI persistence deferred.", error);
    }
    if (typeof window.render === "function") window.render();
    window.dispatchEvent(new CustomEvent("falcon:knowledge:analyzed", {
      detail: service.getCockpitPanel(SCOPE_ID)
    }));
    return service.getRestitution(SCOPE_ID);
  };

  const originalAccueil = window.renderAccueil;
  if (typeof originalAccueil === "function" && !originalAccueil.__falconEkiIntegrated) {
    function renderAccueilWithKnowledge() {
      const html = String(originalAccueil());
      if (html.includes("data-falcon-eki-owner-trial")) return html;
      return html.replace("</section>", `${renderEnterpriseKnowledgeOwnerTrial()}</section>`);
    }
    renderAccueilWithKnowledge.__falconEkiIntegrated = true;
    window.renderAccueil = renderAccueilWithKnowledge;
  }

  const originalReport = window.renderReport;
  if (typeof originalReport === "function" && !originalReport.__falconEkiIntegrated) {
    function renderReportWithKnowledge() {
      const html = String(originalReport());
      const section = renderEnterpriseKnowledgeReportTrial();
      if (!section || html.includes("data-falcon-eki-report")) return html;
      return html.replace("</section>", `${section}</section>`);
    }
    renderReportWithKnowledge.__falconEkiIntegrated = true;
    window.renderReport = renderReportWithKnowledge;
  }

  if (typeof window.render === "function") window.render();
  document.documentElement.dataset.falconEnterpriseKnowledge = "ready";
  return true;
}
