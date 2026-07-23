import { createReportRenderer } from "../render/report-renderer.js";

export function createEnterpriseReportRendering({ runtime, renderer = createReportRenderer() } = {}) {
  if (!runtime?.reports || typeof runtime.reports.getReport !== "function") {
    throw new TypeError("Enterprise report rendering requires a runtime exposing reports.getReport().");
  }
  if (!renderer || typeof renderer.renderHtml !== "function") {
    throw new TypeError("Enterprise report rendering requires a renderer exposing renderHtml().");
  }

  function renderReportHtml(reportId, options = {}) {
    const report = runtime.reports.getReport(reportId);
    return renderer.renderHtml(report, options);
  }

  return Object.freeze({ renderReportHtml });
}
