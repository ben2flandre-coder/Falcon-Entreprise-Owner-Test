import { describeLicenseEdition } from "./license-foundation.js";

export const PRODUCT_EDITION_CONFIGURATION_VERSION = "ProductEditionConfiguration@1.0";
export const PRODUCT_ID = "falcon-enterprise";

export const DISTRIBUTION_CHANNELS = Object.freeze({
  SOLO: Object.freeze(["direct-download"]),
  PACK: Object.freeze(["direct-download", "managed-delivery"]),
  ENTERPRISE: Object.freeze(["managed-delivery", "enterprise-distribution"])
});

const EDITION_LABELS = Object.freeze({
  solo: "Falcon Enterprise Solo",
  pack: "Falcon Enterprise Pack",
  enterprise: "Falcon Enterprise"
});

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

export function createProductEditionConfiguration({ edition, version, channel, buildId, productId = PRODUCT_ID }) {
  const editionDefinition = describeLicenseEdition(edition);
  if (!editionDefinition) throw new RangeError(`Unsupported product edition: ${edition}`);

  const normalizedEdition = editionDefinition.id;
  const allowedChannels = DISTRIBUTION_CHANNELS[normalizedEdition.toUpperCase()];
  const normalizedChannel = normalizeText(channel, "channel");
  if (!allowedChannels.includes(normalizedChannel)) {
    throw new RangeError(`Distribution channel ${normalizedChannel} is not allowed for ${normalizedEdition}.`);
  }

  return deepFreeze({
    schema: "falcon.product-edition.v1",
    version: PRODUCT_EDITION_CONFIGURATION_VERSION,
    productId: normalizeText(productId, "productId"),
    productName: EDITION_LABELS[normalizedEdition],
    edition: normalizedEdition,
    releaseVersion: normalizeText(version, "version"),
    buildId: normalizeText(buildId, "buildId"),
    distributionChannel: normalizedChannel,
    capabilities: [...editionDefinition.capabilities]
  });
}

export function validateProductEditionConfiguration(configuration, licenseContract = null) {
  const reasons = [];
  if (!configuration || configuration.schema !== "falcon.product-edition.v1") reasons.push("invalid-schema");
  const editionDefinition = describeLicenseEdition(configuration?.edition);
  if (!editionDefinition) reasons.push("unknown-edition");
  if (configuration?.productId !== PRODUCT_ID) reasons.push("invalid-product-id");
  const channels = editionDefinition ? DISTRIBUTION_CHANNELS[editionDefinition.id.toUpperCase()] : [];
  if (!channels.includes(configuration?.distributionChannel)) reasons.push("distribution-channel-denied");
  if (editionDefinition) {
    const expectedCapabilities = [...editionDefinition.capabilities].sort();
    const actualCapabilities = [...(configuration.capabilities ?? [])].sort();
    if (JSON.stringify(expectedCapabilities) !== JSON.stringify(actualCapabilities)) reasons.push("capability-drift");
  }
  if (licenseContract && licenseContract.edition !== configuration?.edition) reasons.push("license-edition-mismatch");
  return deepFreeze({ valid: reasons.length === 0, reasons, edition: configuration?.edition ?? null });
}
