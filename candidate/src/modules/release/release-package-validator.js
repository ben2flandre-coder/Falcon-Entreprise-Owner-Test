export const RELEASE_PACKAGE_VALIDATOR_VERSION = "ReleasePackageValidator@1.0";
export const RELEASE_MANIFEST_SCHEMA = "falcon.release.manifest.v1";

const REQUIRED_DOCUMENTS = Object.freeze([
  "docs/operator/installation.md",
  "docs/operator/update.md",
  "docs/operator/rollback.md",
  "docs/operator/deployment-checklist.md",
  "docs/developer/release-candidate.md"
]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function issue(code, message, path = null) {
  return Object.freeze({ code, message, path });
}

export function validateReleasePackage({ manifest, availablePaths = [] } = {}) {
  const issues = [];
  if (!isRecord(manifest)) {
    return freezeDeep({ ready: false, decision: "blocked", issues: [issue("MANIFEST_REQUIRED", "Release manifest is required.")] });
  }

  if (manifest.schema !== RELEASE_MANIFEST_SCHEMA) {
    issues.push(issue("SCHEMA_UNSUPPORTED", `Unsupported release manifest schema: ${String(manifest.schema)}.`, "schema"));
  }
  if (typeof manifest.product !== "string" || !manifest.product.trim()) {
    issues.push(issue("PRODUCT_REQUIRED", "Product name is required.", "product"));
  }
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+-(?:rc|beta|alpha)\.\d+$/.test(manifest.version)) {
    issues.push(issue("VERSION_INVALID", "Release candidate version must follow semantic prerelease format.", "version"));
  }
  if (manifest.channel !== "release-candidate") {
    issues.push(issue("CHANNEL_INVALID", "Release channel must be release-candidate.", "channel"));
  }
  if (typeof manifest.commit !== "string" || !/^[0-9a-f]{40}$/.test(manifest.commit)) {
    issues.push(issue("COMMIT_INVALID", "Release commit must be a full Git SHA.", "commit"));
  }
  if (manifest.environmentProfile !== "production") {
    issues.push(issue("PROFILE_INVALID", "Release candidate must target the production environment profile.", "environmentProfile"));
  }
  if (manifest.engineeringGate !== "green") {
    issues.push(issue("GATE_NOT_GREEN", "Falcon Engineering Gate must be green.", "engineeringGate"));
  }
  if (manifest.demoMode !== false) {
    issues.push(issue("DEMO_MODE_ENABLED", "Demonstration mode must be disabled.", "demoMode"));
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    issues.push(issue("ARTIFACTS_REQUIRED", "At least one release artifact is required.", "artifacts"));
  }

  const normalizedPaths = new Set(availablePaths.filter((path) => typeof path === "string"));
  for (const path of REQUIRED_DOCUMENTS) {
    if (!normalizedPaths.has(path)) issues.push(issue("DOCUMENT_MISSING", `Required release document is missing: ${path}.`, path));
  }

  const blocking = issues.length > 0;
  return freezeDeep({
    version: RELEASE_PACKAGE_VALIDATOR_VERSION,
    ready: !blocking,
    decision: blocking ? "blocked" : "ready",
    checkedAt: manifest.generatedAt || null,
    requiredDocuments: [...REQUIRED_DOCUMENTS],
    issues
  });
}
