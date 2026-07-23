import { validateProductEditionConfiguration } from "./product-edition-configuration.js";

export const COMMERCIAL_PACKAGE_PROFILE_VERSION = "CommercialPackageProfile@1.0";
export const COMMERCIAL_PACKAGE_SCHEMA = "falcon.commercial-package.v1";

const CLASSIFICATIONS = Object.freeze(["required", "optional", "forbidden"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${field} is required.`);
  return normalized;
}

function normalizeArtifact(artifact) {
  const path = normalizeText(artifact?.path, "artifact.path");
  const classification = normalizeText(artifact?.classification, "artifact.classification");
  if (!CLASSIFICATIONS.includes(classification)) {
    throw new RangeError(`Unsupported artifact classification: ${classification}`);
  }
  const capability = artifact?.capability == null ? null : normalizeText(artifact.capability, "artifact.capability");
  return { path, classification, capability };
}

export function createCommercialPackageProfile({ packageId, editionConfiguration, artifacts }) {
  const editionValidation = validateProductEditionConfiguration(editionConfiguration);
  if (!editionValidation.valid) {
    throw new RangeError(`Invalid edition configuration: ${editionValidation.reasons.join(", ")}`);
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new TypeError("artifacts must be a non-empty array.");
  }

  const normalizedArtifacts = artifacts.map(normalizeArtifact).sort((left, right) => left.path.localeCompare(right.path));
  const duplicatePaths = normalizedArtifacts
    .filter((artifact, index, items) => index > 0 && artifact.path === items[index - 1].path)
    .map((artifact) => artifact.path);
  if (duplicatePaths.length) throw new RangeError(`Duplicate artifact paths: ${[...new Set(duplicatePaths)].join(", ")}`);

  const requiredCount = normalizedArtifacts.filter((artifact) => artifact.classification === "required").length;
  if (requiredCount === 0) throw new RangeError("At least one required artifact is mandatory.");

  return deepFreeze({
    schema: COMMERCIAL_PACKAGE_SCHEMA,
    version: COMMERCIAL_PACKAGE_PROFILE_VERSION,
    packageId: normalizeText(packageId, "packageId"),
    productId: editionConfiguration.productId,
    releaseVersion: editionConfiguration.releaseVersion,
    buildId: editionConfiguration.buildId,
    edition: editionConfiguration.edition,
    distributionChannel: editionConfiguration.distributionChannel,
    capabilities: [...editionConfiguration.capabilities],
    artifacts: normalizedArtifacts
  });
}

export function validateCommercialPackageProfile(profile, { editionConfiguration, packagedFiles = [] } = {}) {
  const reasons = [];
  if (!profile || profile.schema !== COMMERCIAL_PACKAGE_SCHEMA) reasons.push("invalid-schema");
  if (!editionConfiguration || !validateProductEditionConfiguration(editionConfiguration).valid) reasons.push("invalid-edition-configuration");

  if (editionConfiguration) {
    if (profile?.productId !== editionConfiguration.productId) reasons.push("product-mismatch");
    if (profile?.edition !== editionConfiguration.edition) reasons.push("edition-mismatch");
    if (profile?.releaseVersion !== editionConfiguration.releaseVersion) reasons.push("release-version-mismatch");
    if (profile?.buildId !== editionConfiguration.buildId) reasons.push("build-id-mismatch");
    if (profile?.distributionChannel !== editionConfiguration.distributionChannel) reasons.push("distribution-channel-mismatch");
  }

  const artifacts = Array.isArray(profile?.artifacts) ? profile.artifacts : [];
  const declaredPaths = new Set(artifacts.map((artifact) => artifact.path));
  const packagedPathSet = new Set(packagedFiles.map((item) => String(item).trim()).filter(Boolean));

  for (const artifact of artifacts) {
    if (!CLASSIFICATIONS.includes(artifact.classification)) reasons.push("invalid-artifact-classification");
    if (artifact.classification === "required" && !packagedPathSet.has(artifact.path)) reasons.push(`missing-required:${artifact.path}`);
    if (artifact.classification === "forbidden" && packagedPathSet.has(artifact.path)) reasons.push(`forbidden-present:${artifact.path}`);
    if (artifact.capability && !profile.capabilities?.includes(artifact.capability)) reasons.push(`unlicensed-capability:${artifact.capability}`);
  }

  for (const packagedPath of packagedPathSet) {
    if (!declaredPaths.has(packagedPath)) reasons.push(`undeclared-file:${packagedPath}`);
  }

  return deepFreeze({ valid: reasons.length === 0, reasons: [...new Set(reasons)].sort(), packageId: profile?.packageId ?? null });
}
