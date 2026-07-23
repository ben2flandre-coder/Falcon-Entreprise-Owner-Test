import { createCockpitIncrementalRenderer } from "./cockpit-incremental-renderer.js";
import { createCockpitSyncController } from "../../modules/cockpit/cockpit-sync-controller.js";
import { createCockpitPerformanceMonitor } from "../../modules/cockpit/cockpit-performance-monitor.js";
import { createCockpitObservability } from "../../modules/cockpit/cockpit-observability.js";
import { createCockpitOperationsOverview } from "../../modules/cockpit/cockpit-operations-overview.js";
import { createCockpitRuntimeInspector } from "../../modules/cockpit/cockpit-runtime-inspector.js";
import { createCockpitRuntimeHealthMonitor } from "../../modules/cockpit/cockpit-runtime-health-monitor.js";
import { createCockpitDiagnosticsRecovery } from "../../modules/cockpit/cockpit-diagnostics-recovery.js";
import { createCockpitReleaseReadiness } from "../../modules/cockpit/cockpit-release-readiness.js";

function targetMetadata(target) {
  if (!target || typeof target !== "object") return {};
  return {
    tag: target.tagName ? String(target.tagName).toLowerCase() : null,
    id: target.id ? String(target.id) : null,
    role: target.getAttribute?.("role") || null,
    action: target.dataset?.action || null
  };
}

export function createDecisionCockpit({
  queryService,
  root,
  eventBus = null,
  refreshContract = undefined,
  delayMs = 40,
  shouldHandle = () => true,
  performanceMonitor = createCockpitPerformanceMonitor(),
  observability = null,
  runtime = null,
  runtimeVersion = null,
  runtimeHealthThresholds = undefined,
  releaseReadinessCriteria = undefined
} = {}) {
  const telemetry = observability || createCockpitObservability({ performanceMonitor });
  const renderer = createCockpitIncrementalRenderer({ queryService, root, performanceMonitor });
  let syncController = null;
  const operations = createCockpitOperationsOverview({
    observability: telemetry,
    synchronization: () => syncController
  });
  const runtimeInspector = runtime
    ? createCockpitRuntimeInspector({ runtime, runtimeVersion })
    : null;
  const runtimeHealthMonitor = runtimeInspector
    ? createCockpitRuntimeHealthMonitor({ operations, runtimeInspector, thresholds: runtimeHealthThresholds })
    : null;
  const diagnosticsRecovery = runtimeHealthMonitor
    ? createCockpitDiagnosticsRecovery({ healthMonitor: runtimeHealthMonitor })
    : null;
  const releaseReadiness = diagnosticsRecovery
    ? createCockpitReleaseReadiness({
        healthMonitor: runtimeHealthMonitor,
        diagnosticsRecovery,
        criteria: releaseReadinessCriteria
      })
    : null;
  const uiListeners = [];

  function recordUiEvent(event) {
    telemetry.record("ui", event?.type || "unknown", targetMetadata(event?.target));
  }

  for (const type of ["click", "change", "input"]) {
    if (typeof root?.addEventListener === "function") {
      root.addEventListener(type, recordUiEvent, { passive: true });
      uiListeners.push(type);
    }
  }

  function render(scope) {
    root.setAttribute?.("aria-busy", "true");
    telemetry.record("render", "full:start", { missionId: scope?.missionId || null, sessionId: scope?.sessionId || null });
    try {
      const view = renderer.renderFull(scope);
      telemetry.record("render", "full:complete", { state: view?.state || null });
      return view;
    } catch (error) {
      telemetry.record("diagnostic", "render:error", { message: String(error?.message || error) });
      throw error;
    } finally {
      root.setAttribute?.("aria-busy", "false");
    }
  }

  function enableSynchronization() {
    if (!eventBus || syncController) return syncController;
    telemetry.record("sync", "enable");
    syncController = createCockpitSyncController({
      eventBus,
      contract: refreshContract,
      delayMs,
      shouldHandle,
      onRefresh(batch) {
        telemetry.record("refresh", "batch", {
          mode: batch.mode,
          eventCount: batch.eventCount,
          eventTypes: batch.eventTypes,
          zones: batch.zones
        });
        root.setAttribute?.("aria-busy", "true");
        try {
          renderer.renderBatch(batch);
          telemetry.record("render", batch.mode === "full" ? "full:refresh" : "targeted:complete", { zoneCount: batch.zones?.length || 0 });
        } catch (error) {
          telemetry.record("diagnostic", "refresh:error", { message: String(error?.message || error), mode: batch.mode });
          throw error;
        } finally {
          root.setAttribute?.("aria-busy", "false");
        }
      }
    });
    telemetry.record("sync", "enabled", { subscriptions: syncController.subscriptionCount?.() || 0 });
    return syncController;
  }

  function renderError(error) {
    telemetry.record("diagnostic", "ui:error", { message: String(error?.message || error) });
    const section = document.createElement("section");
    section.className = "falcon-cockpit-error";
    section.setAttribute("role", "alert");
    const title = document.createElement("h1"); title.textContent = "Cockpit indisponible";
    const message = document.createElement("p"); message.textContent = String(error?.message || "Une erreur empêche l’affichage du cockpit.");
    section.append(title, message);
    root.replaceChildren(section);
    root.setAttribute?.("aria-busy", "false");
  }

  function destroy() {
    const destroyed = syncController?.destroy() || false;
    syncController = null;
    for (const type of uiListeners) root.removeEventListener?.(type, recordUiEvent);
    uiListeners.length = 0;
    telemetry.record("lifecycle", "destroy", { synchronizationDestroyed: destroyed });
    return destroyed;
  }

  return Object.freeze({
    render,
    renderError,
    enableSynchronization,
    destroy,
    renderer,
    observability: telemetry,
    operations,
    runtimeInspector,
    runtimeHealthMonitor,
    diagnosticsRecovery,
    releaseReadiness,
    diagnostics: () => telemetry.diagnostics(),
    observabilitySnapshot: () => telemetry.snapshot(),
    operationsSnapshot: () => operations.snapshot(),
    runtimeInspectionSnapshot: () => runtimeInspector?.snapshot() || null,
    inspectRuntimeComponent: (name) => runtimeInspector?.inspect(name) || null,
    runtimeHealthSnapshot: () => runtimeHealthMonitor?.snapshot() || null,
    diagnosticsRecoverySnapshot: () => diagnosticsRecovery?.snapshot() || null,
    recoveryProcedure: (code) => diagnosticsRecovery?.procedure(code) || null,
    releaseReadinessSnapshot: () => releaseReadiness?.snapshot() || null,
    resetObservability: () => telemetry.clear()
  });
}
