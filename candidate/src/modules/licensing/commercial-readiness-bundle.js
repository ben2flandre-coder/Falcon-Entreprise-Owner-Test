import { verifyLicenseManifest, activateLocalLicense } from "./license-manifest.js";
import { validateProductEditionConfiguration } from "./product-edition-configuration.js";
import { validateCommercialPackageProfile } from "./commercial-package-profile.js";
import { validateCommercialOffer } from "./commercial-offer-catalog.js";

export const COMMERCIAL_READINESS_BUNDLE_VERSION = "CommercialReadinessBundle@1.0";
export const COMMERCIAL_READINESS_BUNDLE_SCHEMA = "falcon.commercial-readiness-bundle.v1";

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

export function createCommercialReadinessBundle({ bundleId, offer, editionConfiguration, licenseManifest, packageProfile }) {
  return deepFreeze({
    schema: COMMERCIAL_READINESS_BUNDLE_SCHEMA,
    version: COMMERCIAL_READINESS_BUNDLE_VERSION,
    bundleId: normalizeText(bundleId, "bundleId"),
    offer,
    editionConfiguration,
    licenseManifest,
    packageProfile
  });
}

export function validateCommercialReadinessBundle(bundle, { packagedFiles = [], licenseContext = {} } = {}) {
  const reasons = [];
  if (!bundle || bundle.schema !== COMMERCIAL_READINESS_BUNDLE_SCHEMA) reasons.push("invalid-schema");
  if (bundle?.version !== COMMERCIAL_READINESS_BUNDLE_VERSION) reasons.push("unsupported-version");

  const editionValidation = validateProductEditionConfiguration(bundle?.editionConfiguration, bundle?.licenseManifest?.license);
  if (!editionValidation.valid) reasons.push(...editionValidation.reasons.map((reason) => `edition:${reason}`));

  const manifestValidation = verifyLicenseManifest(bundle?.licenseManifest, licenseContext);
  if (!manifestValidation.valid) reasons.push(...manifestValidation.reasons.map((reason) => `license:${reason}`));

  const activation = activateLocalLicense(bundle?.licenseManifest, licenseContext);
  if (!activation.activated) reasons.push(...activation.reasons.map((reason) => `activation:${reason}`));

  const packageValidation = validateCommercialPackageProfile(bundle?.packageProfile, {
    editionConfiguration: bundle?.editionConfiguration,
    packagedFiles
  });
  if (!packageValidation.valid) reasons.push(...packageValidation.reasons.map((reason) => `package:${reason}`));

  const offerValidation = validateCommercialOffer(bundle?.offer, {
    editionConfiguration: bundle?.editionConfiguration,
    packageProfile: bundle?.packageProfile
  });
  if (!offerValidation.valid) reasons.push(...offerValidation.reasons.map((reason) => `offer:${reason}`));

  if (bundle?.licenseManifest?.product !== bundle?.editionConfiguration?.productId) reasons.push("product-mismatch");
  if (bundle?.licenseManifest?.license?.edition !== bundle?.editionConfiguration?.edition) reasons.push("license-edition-mismatch");
  if (bundle?.offer?.packageId !== bundle?.packageProfile?.packageId) reasons.push("offer-package-mismatch");
  if (bundle?.offer?.distributionChannel !== bundle?.editionConfiguration?.distributionChannel) reasons.push("offer-channel-mismatch");

  const uniqueReasons = [...new Set(reasons)].sort();
  return deepFreeze({
    valid: uniqueReasons.length === 0,
    status: uniqueReasons.length === 0 ? "ready" : "rejected",
    reasons: uniqueReasons,
    bundleId: bundle?.bundleId ?? null,
    offerId: bundle?.offer?.offerId ?? null,
    licenseId: activation.licenseId,
    edition: bundle?.editionConfiguration?.edition ?? null,
    packageId: bundle?.packageProfile?.packageId ?? null
  });
}