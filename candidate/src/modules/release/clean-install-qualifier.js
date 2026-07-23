export const CLEAN_INSTALL_QUALIFIER_VERSION = "CleanInstallQualifier@1.0";
export const CLEAN_INSTALL_REPORT_SCHEMA = "falcon.release.clean-install-report.v1";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function issue(code, message, path = null) {
  return Object.freeze({ code, message, path });
}

function normalizePaths(paths) {
  return new Set((Array.isArray(paths) ? paths : []).filter((entry) => typeof entry === "string"));
}

function demoArtifact(path) {
  return /(^|\/)(demo|demonstration|sample|fixture|seed)(\/|\.|-|_)/i.test(path)
    || /(^|\/)(demo-data|sample-data|seed-data)(\/|$)/i.test(path);
}

export function qualifyCleanInstall({
  manifest,
  availablePaths = [],
  declaredDemoPaths = [],
  persistedState = null,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof now !== "function") throw new TypeError("Clean install qualification clock must be a function.");

  const issues = [];
  const paths = normalizePaths(availablePaths);
  const allowedDemoPaths = normalizePaths(declaredDemoPaths);

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    issues.push(issue("MANIFEST_REQUIRED", "Release manifest is required."));
  } else {
    if (!/^[0-9a-f]{40}$/.test(String(manifest.sourceCommit || ""))) {
      issues.push(issue("SOURCE_COMMIT_INVALID", "Release package must reference a full source commit.", "sourceCommit"));
    }
    if (manifest.environmentProfile !== "production") {
      issues.push(issue("PROFILE_NOT_PRODUCTION", "Clean install qualification requires the production profile.", "environmentProfile"));
    }
    if (manifest.demoMode !== false) {
      issues.push(issue("DEMO_MODE_ACTIVE", "Demonstration mode must be explicitly disabled.", "demoMode"));
    }
    const entrypoint = manifest.artifact?.entrypoint;
    if (typeof entrypoint !== "string" || !entrypoint.trim()) {
      issues.push(issue("ENTRYPOINT_REQUIRED", "A stable package entrypoint is required.", "artifact.entrypoint"));
    } else if (!paths.has(entrypoint)) {
      issues.push(issue("ENTRYPOINT_MISSING", `Stable entrypoint is missing: ${entrypoint}.`, entrypoint));
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      issues.push(issue("INVENTORY_REQUIRED", "Release manifest file inventory is required.", "files"));
    } else {
      for (const record of manifest.files) {
        if (typeof record?.path !== "string" || !paths.has(record.path)) {
          issues.push(issue("INVENTORY_PATH_MISSING", `Manifest path is absent from the isolated package: ${String(record?.path)}.`, record?.path || null));
        }
        if (!/^[0-9a-f]{64}$/.test(String(record?.sha256 || ""))) {
          issues.push(issue("FILE_DIGEST_INVALID", `File digest is invalid: ${String(record?.path)}.`, record?.path || null));
        }
      }
    }
  }

  const implicitDemoPaths = [...paths]
    .filter((path) => demoArtifact(path) && !allowedDemoPaths.has(path))
    .sort();
  for (const path of implicitDemoPaths) {
    issues.push(issue("IMPLICIT_DEMO_ARTIFACT", `Undeclared demonstration artifact detected: ${path}.`, path));
  }

  const hasPersistedState = persistedState != null
    && (!(typeof persistedState === "object") || Object.keys(persistedState).length > 0);
  if (hasPersistedState) {
    issues.push(issue("PRELOADED_USER_STATE", "Clean installation contains preloaded user state.", "persistedState"));
  }

  const qualified = issues.length === 0;
  return freezeDeep({
    schema: CLEAN_INSTALL_REPORT_SCHEMA,
    version: CLEAN_INSTALL_QUALIFIER_VERSION,
    generatedAt: String(now()),
    verdict: qualified ? "qualified" : "rejected",
    qualified,
    checks: {
      sourceCommit: !issues.some((entry) => entry.code === "SOURCE_COMMIT_INVALID"),
      productionProfile: !issues.some((entry) => entry.code === "PROFILE_NOT_PRODUCTION"),
      demoModeDisabled: !issues.some((entry) => entry.code === "DEMO_MODE_ACTIVE"),
      stableEntrypoint: !issues.some((entry) => entry.code === "ENTRYPOINT_REQUIRED" || entry.code === "ENTRYPOINT_MISSING"),
      inventoryIntegrity: !issues.some((entry) => entry.code === "INVENTORY_REQUIRED" || entry.code === "INVENTORY_PATH_MISSING" || entry.code === "FILE_DIGEST_INVALID"),
      blankState: !issues.some((entry) => entry.code === "PRELOADED_USER_STATE"),
      demoIsolation: implicitDemoPaths.length === 0
    },
    package: {
      sourceCommit: manifest?.sourceCommit || null,
      environmentProfile: manifest?.environmentProfile || null,
      demoMode: manifest?.demoMode ?? null,
      entrypoint: manifest?.artifact?.entrypoint || null,
      pathCount: paths.size
    },
    issues
  });
}
