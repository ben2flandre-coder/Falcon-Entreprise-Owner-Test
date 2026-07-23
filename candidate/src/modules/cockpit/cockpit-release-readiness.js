export const COCKPIT_RELEASE_READINESS_VERSION = "CockpitReleaseReadiness@1.0";

const DEFAULT_CRITERIA = Object.freeze({
  architectureStable: true,
  testsPassing: true,
  documentationComplete: true,
  noCriticalDiagnostics: true,
  noAutomaticRecovery: true
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeCriteria(criteria = {}) {
  return Object.freeze({ ...DEFAULT_CRITERIA, ...criteria });
}

export function createCockpitReleaseReadiness({
  healthMonitor,
  diagnosticsRecovery,
  criteria = DEFAULT_CRITERIA,
  now = () => new Date().toISOString()
} = {}) {
  if (!healthMonitor?.snapshot) throw new TypeError("Release readiness requires a Runtime health monitor API.");
  if (!diagnosticsRecovery?.snapshot) throw new TypeError("Release readiness requires a diagnostics recovery API.");
  if (typeof now !== "function") throw new TypeError("Release readiness clock must be a function.");

  const expected = normalizeCriteria(criteria);

  function snapshot() {
    const health = healthMonitor.snapshot();
    const recovery = diagnosticsRecovery.snapshot();
    const checks = {
      architectureStable: expected.architectureStable === true,
      testsPassing: expected.testsPassing === true,
      documentationComplete: expected.documentationComplete === true,
      noCriticalDiagnostics: health.status !== "critical" && recovery.summary.criticals === 0,
      noAutomaticRecovery: recovery.summary.automaticActions === 0
    };

    const entries = Object.entries(checks).map(([id, passed]) => ({
      id,
      passed,
      blocking: id === "architectureStable" || id === "testsPassing" || id === "noCriticalDiagnostics"
    }));
    const blockers = entries.filter((entry) => entry.blocking && !entry.passed);
    const passed = entries.filter((entry) => entry.passed).length;
    const score = Math.round((passed / entries.length) * 100);
    const status = blockers.length > 0 ? "blocked" : score === 100 ? "ready" : "conditional";

    return freezeDeep({
      version: COCKPIT_RELEASE_READINESS_VERSION,
      generatedAt: String(now()),
      status,
      score,
      summary: {
        totalCriteria: entries.length,
        passedCriteria: passed,
        failedCriteria: entries.length - passed,
        blockers: blockers.length,
        healthStatus: health.status,
        diagnostics: recovery.summary.diagnostics
      },
      criteria: entries,
      blockers,
      target: "release-candidate"
    });
  }

  return Object.freeze({
    version: COCKPIT_RELEASE_READINESS_VERSION,
    snapshot
  });
}
