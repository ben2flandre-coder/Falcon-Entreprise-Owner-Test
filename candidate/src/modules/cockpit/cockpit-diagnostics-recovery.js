export const COCKPIT_DIAGNOSTICS_RECOVERY_VERSION = "CockpitDiagnosticsRecovery@1.0";

const RECOVERY_CATALOG = Object.freeze({
  OPERATIONS_DEGRADED: Object.freeze({ action: "inspect-operations", title: "Inspecter Operations", description: "Analyser les composants Operations dégradés avant toute action." }),
  OPERATIONS_UNAVAILABLE: Object.freeze({ action: "restart-cockpit", title: "Redémarrer le cockpit", description: "Recréer l’instance du Decision Cockpit et réévaluer son état." }),
  RUNTIME_DEGRADED: Object.freeze({ action: "inspect-runtime", title: "Inspecter le Runtime", description: "Identifier les composants Runtime indisponibles et vérifier leur intégration." }),
  RUNTIME_UNAVAILABLE: Object.freeze({ action: "reinitialize-runtime", title: "Réinitialiser le Runtime", description: "Recréer explicitement le Runtime Enterprise depuis l’intégrateur." }),
  COMPONENT_DEGRADED: Object.freeze({ action: "inspect-component", title: "Inspecter le composant", description: "Contrôler la capacité technique signalée comme dégradée." }),
  SNAPSHOT_STALE: Object.freeze({ action: "refresh-diagnostics", title: "Rafraîchir le diagnostic", description: "Générer un nouvel instantané avant tout arbitrage opérateur." }),
  SNAPSHOT_EXPIRED: Object.freeze({ action: "refresh-and-verify", title: "Rafraîchir et vérifier", description: "Régénérer les instantanés puis confirmer la persistance du défaut." }),
  SNAPSHOT_TIME_UNKNOWN: Object.freeze({ action: "verify-clock", title: "Vérifier l’horodatage", description: "Contrôler l’horloge et la production des instantanés techniques." })
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeDiagnostic(entry = {}) {
  return {
    severity: entry.severity === "critical" ? "critical" : "warning",
    code: String(entry.code || "UNKNOWN_DIAGNOSTIC"),
    component: String(entry.component || "unknown"),
    message: String(entry.message || "Technical diagnostic unavailable.")
  };
}

function recoveryFor(diagnostic) {
  const catalogEntry = RECOVERY_CATALOG[diagnostic.code] || {
    action: "manual-investigation",
    title: "Investigation manuelle",
    description: "Analyser le diagnostic technique avant toute intervention."
  };
  return {
    ...catalogEntry,
    component: diagnostic.component,
    severity: diagnostic.severity,
    automatic: false,
    requiresConfirmation: true
  };
}

export function createCockpitDiagnosticsRecovery({
  healthMonitor,
  now = () => new Date().toISOString()
} = {}) {
  if (!healthMonitor?.snapshot) throw new TypeError("Diagnostics recovery requires a Runtime health monitor API.");
  if (typeof now !== "function") throw new TypeError("Diagnostics recovery clock must be a function.");

  function snapshot() {
    const health = healthMonitor.snapshot();
    const diagnostics = (health.diagnostics || []).map(normalizeDiagnostic);
    const recovery = diagnostics.map((entry) => ({ diagnostic: entry, procedure: recoveryFor(entry) }));
    return freezeDeep({
      version: COCKPIT_DIAGNOSTICS_RECOVERY_VERSION,
      generatedAt: String(now()),
      status: health.status,
      summary: {
        diagnostics: diagnostics.length,
        warnings: diagnostics.filter((entry) => entry.severity === "warning").length,
        criticals: diagnostics.filter((entry) => entry.severity === "critical").length,
        recoveryProcedures: recovery.length,
        automaticActions: 0
      },
      diagnostics,
      recovery
    });
  }

  function procedure(code) {
    const normalized = String(code || "").trim();
    const item = snapshot().recovery.find((entry) => entry.diagnostic.code === normalized);
    return item?.procedure || null;
  }

  return Object.freeze({
    version: COCKPIT_DIAGNOSTICS_RECOVERY_VERSION,
    snapshot,
    procedure
  });
}
