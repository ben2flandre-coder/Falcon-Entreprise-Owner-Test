export const REPORT_DELIVERY_SCHEMA = "falcon.report.delivery.v1";
export const REPORT_DELIVERY_VERSION = "1.0.0";

export const REPORT_DELIVERY_ACTIONS = Object.freeze([
  "save",
  "save-as",
  "print",
  "share",
  "email",
  "open-with",
  "connected-space"
]);

export class ReportDeliveryError extends Error {
  constructor(message, code = "REPORT_DELIVERY_ERROR") {
    super(message);
    this.name = "ReportDeliveryError";
    this.code = code;
  }
}

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new ReportDeliveryError(`${label} est obligatoire.`, "INVALID_REPORT");
  return normalized;
}

export function safeReportFileName(value, date = new Date().toISOString().slice(0, 10)) {
  const stem = String(value || "Rapport Falcon")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Rapport Falcon";
  return `${stem} — ${String(date).slice(0, 10)}.html`;
}

export function buildStandaloneReport({
  title,
  reportHtml,
  generatedAt = new Date().toISOString(),
  sourceCommit = "runtime-local",
  language = "fr"
} = {}) {
  const normalizedTitle = required(title, "Le titre du rapport");
  const content = required(reportHtml, "Le contenu du rapport");
  const document = `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${normalizedTitle.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { margin: 0; color: #142033; background: #fff; font: 15px/1.45 system-ui, sans-serif; }
    .report { max-width: 190mm; margin: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border: 1px solid #cbd5e1; vertical-align: top; }
    img, svg, canvas { max-width: 100%; height: auto; }
    .btn, button, nav, aside, .no-print { display: none !important; }
    .box, section, article, tr { break-inside: avoid; }
  </style>
</head>
<body>
${content}
<!-- Falcon Enterprise · ${generatedAt} · ${sourceCommit} -->
</body>
</html>
`;
  return Object.freeze({
    schema: REPORT_DELIVERY_SCHEMA,
    version: REPORT_DELIVERY_VERSION,
    title: normalizedTitle,
    generatedAt,
    sourceCommit: String(sourceCommit),
    mimeType: "text/html",
    fileName: safeReportFileName(normalizedTitle, generatedAt),
    bytes: new TextEncoder().encode(document),
    html: document
  });
}

export function deliveryCapabilities(environment = {}) {
  return Object.freeze({
    save: true,
    saveAs: Boolean(environment.showSaveFilePicker),
    print: Boolean(environment.print),
    nativeShare: Boolean(environment.share),
    fileShare: Boolean(environment.share) && environment.canShareFiles !== false,
    email: true,
    openWith: Boolean(environment.share),
    connectedSpace: Boolean(environment.showSaveFilePicker),
    fullscreen: Boolean(environment.requestFullscreen)
  });
}

export function createDeliveryReceipt(artifact, {
  action,
  status,
  destination = "local",
  now = () => new Date().toISOString(),
  detail = ""
} = {}) {
  if (artifact?.schema !== REPORT_DELIVERY_SCHEMA) {
    throw new ReportDeliveryError("Artefact rapport invalide.", "INVALID_ARTIFACT");
  }
  if (!REPORT_DELIVERY_ACTIONS.includes(action)) {
    throw new ReportDeliveryError("Action de diffusion invalide.", "INVALID_ACTION");
  }
  if (!["completed", "requested", "cancelled", "error"].includes(status)) {
    throw new ReportDeliveryError("Statut de diffusion invalide.", "INVALID_STATUS");
  }
  return Object.freeze({
    schema: "falcon.report.delivery-receipt.v1",
    reportFileName: artifact.fileName,
    generatedAt: artifact.generatedAt,
    action,
    status,
    destination: String(destination),
    recordedAt: String(now()),
    detail: String(detail || "")
  });
}
