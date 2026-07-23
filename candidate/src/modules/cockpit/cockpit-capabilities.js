function capability(available, unavailableReason) {
  return Object.freeze({ available, reason: available ? null : unavailableReason });
}

export function detectCockpitCapabilities({ reportRendering = null, exportService = null } = {}) {
  const reportRenderingAvailable = Boolean(reportRendering && typeof reportRendering.renderReportHtml === "function");
  const exportAvailable = Boolean(exportService && typeof exportService.prepareExport === "function");

  return Object.freeze({
    reportRendering: reportRenderingAvailable,
    export: exportAvailable,
    details: Object.freeze({
      reportRendering: capability(reportRenderingAvailable, "report-rendering-unavailable"),
      export: capability(exportAvailable, "enterprise-export-unavailable")
    })
  });
}
