export const RC_LIFECYCLE_QUALIFIER_VERSION = "RcLifecycleQualifier@1.0";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function issue(code, message, phase) {
  return Object.freeze({ code, message, phase });
}

function fullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function validScenario(value) {
  return value && typeof value === "object" && value.executed === true && value.result === "passed";
}

export function qualifyRcLifecycle({
  sourceCommit,
  cleanInstall,
  upgrade,
  restore,
  rollback,
  blankState,
  demonstrationState,
  pilotAcceptance,
  postMerge
} = {}) {
  const issues = [];

  if (!fullSha(sourceCommit)) issues.push(issue("SOURCE_COMMIT_INVALID", "A full source commit SHA is required.", "baseline"));
  if (!validScenario(cleanInstall)) issues.push(issue("CLEAN_INSTALL_NOT_QUALIFIED", "Clean-install qualification is missing or failed.", "clean-install"));
  if (!validScenario(upgrade)) issues.push(issue("UPGRADE_NOT_QUALIFIED", "Upgrade qualification is missing or failed.", "upgrade"));
  if (!validScenario(restore)) issues.push(issue("RESTORE_NOT_QUALIFIED", "Restore qualification is missing or failed.", "restore"));
  if (!validScenario(rollback)) issues.push(issue("ROLLBACK_NOT_QUALIFIED", "Rollback qualification is missing or failed.", "rollback"));

  if (!blankState || blankState.qualified !== true || blankState.demoMode !== false || blankState.userDataPresent !== false) {
    issues.push(issue("BLANK_STATE_NOT_ISOLATED", "Production blank state is not explicitly qualified.", "state-isolation"));
  }
  if (!demonstrationState || demonstrationState.explicit !== true || demonstrationState.isolated !== true || demonstrationState.productionDefault !== false) {
    issues.push(issue("DEMONSTRATION_STATE_NOT_ISOLATED", "Demonstration state must be explicit, isolated and disabled by default.", "state-isolation"));
  }
  if (!pilotAcceptance || pilotAcceptance.executed !== true || pilotAcceptance.decision !== "accepted" || !Array.isArray(pilotAcceptance.evidence) || pilotAcceptance.evidence.length === 0) {
    issues.push(issue("PILOT_ACCEPTANCE_MISSING", "Pilot acceptance evidence is missing or rejected.", "pilot"));
  }
  if (!postMerge || postMerge.executed !== true || postMerge.branch !== "main" || postMerge.result !== "passed" || !fullSha(postMerge.commit)) {
    issues.push(issue("POST_MERGE_QUALIFICATION_MISSING", "Post-merge qualification on main is missing or failed.", "post-merge"));
  }

  const phases = Object.freeze({
    cleanInstall: validScenario(cleanInstall),
    upgrade: validScenario(upgrade),
    restore: validScenario(restore),
    rollback: validScenario(rollback),
    stateIsolation: !issues.some((entry) => entry.phase === "state-isolation"),
    pilotAcceptance: !issues.some((entry) => entry.phase === "pilot"),
    postMerge: !issues.some((entry) => entry.phase === "post-merge")
  });

  return freezeDeep({
    version: RC_LIFECYCLE_QUALIFIER_VERSION,
    sourceCommit: fullSha(sourceCommit) ? sourceCommit : null,
    qualified: issues.length === 0,
    decision: issues.length === 0 ? "qualified" : "blocked",
    phases,
    issues
  });
}
