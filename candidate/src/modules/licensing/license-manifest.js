import { createHash } from "node:crypto";
import { evaluateLicense, LICENSE_SCHEMA } from "./license-foundation.js";

export const LICENSE_MANIFEST_SCHEMA = "falcon.license-manifest.v1";
export const LICENSE_MANIFEST_VERSION = "LicenseManifest@1.0";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

export function computeLicenseManifestFingerprint(payload) {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function createLicenseManifest({ license, product = "falcon-enterprise", channel = "local", metadata = {} }) {
  if (!license || license.schema !== LICENSE_SCHEMA) throw new TypeError("A valid Falcon license contract is required.");
  const payload = freezeDeep({
    schema: LICENSE_MANIFEST_SCHEMA,
    version: LICENSE_MANIFEST_VERSION,
    product: String(product).trim(),
    channel: String(channel).trim(),
    license,
    metadata: structuredClone(metadata)
  });
  if (!payload.product || !payload.channel) throw new TypeError("product and channel are required.");
  return freezeDeep({ ...payload, fingerprint: computeLicenseManifestFingerprint(payload) });
}

export function verifyLicenseManifest(manifest, context = {}) {
  const reasons = [];
  if (!manifest || manifest.schema !== LICENSE_MANIFEST_SCHEMA) reasons.push("invalid-manifest-schema");
  if (manifest?.version !== LICENSE_MANIFEST_VERSION) reasons.push("unsupported-manifest-version");
  if (!manifest?.product) reasons.push("missing-product");
  if (!manifest?.channel) reasons.push("missing-channel");
  if (!manifest?.license || manifest.license.schema !== LICENSE_SCHEMA) reasons.push("invalid-license-contract");

  if (reasons.length === 0) {
    const { fingerprint, ...payload } = manifest;
    if (!fingerprint || fingerprint !== computeLicenseManifestFingerprint(payload)) reasons.push("fingerprint-mismatch");
    const licenseResult = evaluateLicense(manifest.license, context);
    if (!licenseResult.valid) reasons.push(...licenseResult.reasons.map((reason) => `license:${reason}`));
  }

  return freezeDeep({ valid: reasons.length === 0, reasons });
}

export function activateLocalLicense(manifest, context = {}) {
  const verification = verifyLicenseManifest(manifest, context);
  return freezeDeep({
    activated: verification.valid,
    status: verification.valid ? "active" : "rejected",
    reasons: verification.reasons,
    licenseId: verification.valid ? manifest.license.licenseId : null,
    edition: verification.valid ? manifest.license.edition : null,
    fingerprint: verification.valid ? manifest.fingerprint : null
  });
}
