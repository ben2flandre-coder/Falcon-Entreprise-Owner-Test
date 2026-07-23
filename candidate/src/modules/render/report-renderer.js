export const REPORT_RENDERER_VERSION = "V48.0.0-dev";
export const REPORT_TEMPLATE_VERSION = "FalconPrestige@1.0";

export class ReportRendererError extends Error {
  constructor(message, code = "REPORT_RENDERER_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ReportRendererValidationError extends ReportRendererError {
  constructor(message) { super(message, "REPORT_RENDERER_VALIDATION_ERROR"); }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMetric(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)} %` : "Non évalué";
}

function normalizeReport(report) {
  if (!report || typeof report !== "object") throw new ReportRendererValidationError("Report input is required.");
  if (!report.id || !report.missionId || !Array.isArray(report.sections)) {
    throw new ReportRendererValidationError("Report structure is invalid.");
  }
  return structuredClone(report);
}

function sectionById(report, id) {
  return report.sections.find((section) => section.id === id) || { content: {} };
}

function renderDimensionRows(dimensions = []) {
  if (!dimensions.length) return '<tr><td colspan="6">Aucune dimension exploitable.</td></tr>';
  return dimensions.map((item) => `
    <tr>
      <td>${escapeHtml(item.label || item.dimensionId)}</td>
      <td>${formatMetric(item.score)}</td>
      <td>${escapeHtml(item.level || "unknown")}</td>
      <td>${formatMetric(item.coverage)}</td>
      <td>${formatMetric(item.confidence)}</td>
      <td>${escapeHtml(item.interpretationStatus || "not-evaluable")}</td>
    </tr>`).join("");
}

function renderReservations(title, reservations = []) {
  if (!reservations.length) return `<section class="panel"><h2>${escapeHtml(title)}</h2><p>Aucune réserve enregistrée.</p></section>`;
  const items = reservations.map((item) => `<li><strong>${escapeHtml(item.code || item.dimensionId || "Réserve")}</strong>${item.severity ? ` — ${escapeHtml(item.severity)}` : ""}${Array.isArray(item.reasons) ? ` — ${escapeHtml(item.reasons.join(", "))}` : ""}</li>`).join("");
  return `<section class="panel"><h2>${escapeHtml(title)}</h2><ul>${items}</ul></section>`;
}

export function createReportRenderer({ templateVersion = REPORT_TEMPLATE_VERSION } = {}) {
  function renderHtml(reportInput, options = {}) {
    const report = normalizeReport(reportInput);
    const summary = sectionById(report, "executive-summary").content || {};
    const radar = sectionById(report, "radar-analysis").content || {};
    const trust = sectionById(report, "trust-analysis").content || {};
    const reservations = sectionById(report, "reservations").content || {};
    const priorities = sectionById(report, "investigation-priorities").content?.priorities || [];
    const traceability = sectionById(report, "traceability").content || {};
    const generatedAt = String(options.generatedAt || report.updatedAt || report.createdAt || "");
    const organization = escapeHtml(options.organization || "Falcon Enterprise");
    const title = escapeHtml(report.title || "Rapport Falcon");

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#14202b;background:#f4f6f8}*{box-sizing:border-box}body{margin:0;background:#f4f6f8}.page{max-width:1180px;margin:0 auto;padding:32px}.hero{background:#111f2b;color:white;padding:32px;border-radius:18px;margin-bottom:24px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em;opacity:.72}.hero h1{margin:8px 0 6px;font-size:34px}.meta{opacity:.8}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}.metric,.panel{background:white;border:1px solid #d9e0e6;border-radius:14px;padding:20px}.metric strong{display:block;font-size:28px;margin-top:8px}.panel{margin-bottom:20px}.panel h2{margin-top:0;font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5eaee}th{background:#eef2f5}.tag{display:inline-block;padding:5px 9px;border-radius:999px;background:#eaf0f4;margin:3px;font-size:12px}.footer{font-size:11px;color:#60717f;padding:10px 0 30px}@media(max-width:780px){.page{padding:16px}.grid{grid-template-columns:1fr}.hero h1{font-size:27px}table{display:block;overflow-x:auto}}@media print{body{background:white}.page{max-width:none;padding:0}.hero,.metric,.panel{break-inside:avoid;box-shadow:none}.hero{border-radius:0}.panel,.metric{border-color:#bbb}.no-print{display:none}@page{size:A4;margin:14mm}}
</style>
</head>
<body>
<main class="page" data-report-id="${escapeHtml(report.id)}" data-template-version="${escapeHtml(templateVersion)}">
<header class="hero"><div class="eyebrow">${organization} · Rapport décisionnel</div><h1>${title}</h1><div class="meta">Mission : ${escapeHtml(summary.missionName || report.missionId)} · Statut : ${escapeHtml(report.status)} · Généré : ${escapeHtml(generatedAt)}</div></header>
<section class="grid">
<div class="metric"><span>Score Radar</span><strong>${formatMetric(summary.radarScore)}</strong><small>${escapeHtml(summary.radarLevel || "unknown")}</small></div>
<div class="metric"><span>Indice de confiance</span><strong>${formatMetric(summary.trustIndex)}</strong><small>${escapeHtml(summary.trustLevel || "low")}</small></div>
<div class="metric"><span>Légitimité d’interprétation</span><strong>${escapeHtml(summary.trustInterpretation || "not-evaluable")}</strong><small>Radar : ${escapeHtml(summary.radarInterpretation || "not-evaluable")}</small></div>
</section>
<section class="panel"><h2>Lecture Radar 360</h2><p>Couverture : <strong>${formatMetric(radar.coverage)}</strong> · Confiance : <strong>${formatMetric(radar.confidence)}</strong> · Accord : <strong>${formatMetric(radar.agreement)}</strong></p><table><thead><tr><th>Dimension</th><th>Score</th><th>Niveau</th><th>Couverture</th><th>Confiance</th><th>Interprétation</th></tr></thead><tbody>${renderDimensionRows(radar.dimensions)}</tbody></table></section>
<section class="panel"><h2>Solidité de l’interprétation</h2><p>Indice global : <strong>${formatMetric(trust.trustIndex)}</strong> · Niveau : <strong>${escapeHtml(trust.trustLevel || "low")}</strong></p>${Object.entries(trust.axes || {}).map(([key,value]) => `<span class="tag">${escapeHtml(key)} : ${formatMetric(value)}</span>`).join("")}</section>
${renderReservations("Réserves Radar", reservations.radar)}
${renderReservations("Réserves Trust", reservations.trust)}
<section class="panel"><h2>Priorités d’investigation</h2>${priorities.length ? `<ol>${priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>Aucune priorité enregistrée.</p>"}</section>
<section class="panel"><h2>Traçabilité</h2><table><tbody><tr><th>Radar</th><td>${escapeHtml(traceability.radarId)} · révision ${escapeHtml(traceability.radarRevision)}</td></tr><tr><th>Empreinte Radar</th><td>${escapeHtml(traceability.radarCalculationKey)}</td></tr><tr><th>Trust</th><td>${escapeHtml(traceability.trustId)} · révision ${escapeHtml(traceability.trustRevision)}</td></tr><tr><th>Définition rapport</th><td>${escapeHtml(traceability.reportDefinitionVersion)}</td></tr><tr><th>Template</th><td>${escapeHtml(templateVersion)}</td></tr></tbody></table></section>
<footer class="footer">Document généré par Falcon Enterprise. L’analyse assiste l’arbitrage humain et ne constitue pas une décision automatique.</footer>
</main>
</body>
</html>`;

    return Object.freeze({
      mimeType: "text/html;charset=utf-8",
      extension: "html",
      templateVersion,
      reportId: report.id,
      content: html
    });
  }

  return Object.freeze({ renderHtml });
}
