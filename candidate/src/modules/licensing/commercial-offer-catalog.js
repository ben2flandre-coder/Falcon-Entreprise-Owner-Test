import { describeLicenseEdition } from "./license-foundation.js";
import { validateProductEditionConfiguration } from "./product-edition-configuration.js";
import { validateCommercialPackageProfile } from "./commercial-package-profile.js";

export const COMMERCIAL_OFFER_CATALOG_VERSION = "CommercialOfferCatalog@1.0";
export const COMMERCIAL_OFFER_SCHEMA = "falcon.commercial-offer.v1";

const SUPPORT_LEVELS = Object.freeze(["standard", "priority", "enterprise"]);
const AVAILABILITY_STATES = Object.freeze(["planned", "available", "retired"]);

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

export function createCommercialOffer({ offerId, editionConfiguration, packageProfile, supportLevel, availability = "planned" }) {
  const editionValidation = validateProductEditionConfiguration(editionConfiguration);
  if (!editionValidation.valid) throw new RangeError(`Invalid edition configuration: ${editionValidation.reasons.join(", ")}`);
  const packageValidation = validateCommercialPackageProfile(packageProfile, { editionConfiguration, packagedFiles: packageProfile.artifacts.filter((item) => item.classification === "required").map((item) => item.path) });
  if (!packageValidation.valid) throw new RangeError(`Invalid package profile: ${packageValidation.reasons.join(", ")}`);

  const normalizedSupport = normalizeText(supportLevel, "supportLevel");
  if (!SUPPORT_LEVELS.includes(normalizedSupport)) throw new RangeError(`Unsupported support level: ${normalizedSupport}`);
  const normalizedAvailability = normalizeText(availability, "availability");
  if (!AVAILABILITY_STATES.includes(normalizedAvailability)) throw new RangeError(`Unsupported availability: ${normalizedAvailability}`);

  const edition = describeLicenseEdition(editionConfiguration.edition);
  return deepFreeze({
    schema: COMMERCIAL_OFFER_SCHEMA,
    version: COMMERCIAL_OFFER_CATALOG_VERSION,
    offerId: normalizeText(offerId, "offerId"),
    productId: editionConfiguration.productId,
    edition: edition.id,
    releaseVersion: editionConfiguration.releaseVersion,
    distributionChannel: editionConfiguration.distributionChannel,
    packageId: packageProfile.packageId,
    seatModel: edition.seatLimit === null ? "contractual" : `up-to-${edition.seatLimit}`,
    supportLevel: normalizedSupport,
    availability: normalizedAvailability,
    capabilities: [...edition.capabilities]
  });
}

export function validateCommercialOffer(offer, { editionConfiguration, packageProfile } = {}) {
  const reasons = [];
  if (!offer || offer.schema !== COMMERCIAL_OFFER_SCHEMA) reasons.push("invalid-schema");
  if (!editionConfiguration || !validateProductEditionConfiguration(editionConfiguration).valid) reasons.push("invalid-edition-configuration");
  if (!packageProfile) reasons.push("missing-package-profile");
  if (editionConfiguration) {
    if (offer?.productId !== editionConfiguration.productId) reasons.push("product-mismatch");
    if (offer?.edition !== editionConfiguration.edition) reasons.push("edition-mismatch");
    if (offer?.releaseVersion !== editionConfiguration.releaseVersion) reasons.push("release-version-mismatch");
    if (offer?.distributionChannel !== editionConfiguration.distributionChannel) reasons.push("distribution-channel-mismatch");
    const expectedCapabilities = [...editionConfiguration.capabilities].sort();
    const actualCapabilities = [...(offer?.capabilities ?? [])].sort();
    if (JSON.stringify(expectedCapabilities) !== JSON.stringify(actualCapabilities)) reasons.push("capability-drift");
  }
  if (packageProfile && offer?.packageId !== packageProfile.packageId) reasons.push("package-mismatch");
  if (!SUPPORT_LEVELS.includes(offer?.supportLevel)) reasons.push("invalid-support-level");
  if (!AVAILABILITY_STATES.includes(offer?.availability)) reasons.push("invalid-availability");
  return deepFreeze({ valid: reasons.length === 0, reasons: [...new Set(reasons)].sort(), offerId: offer?.offerId ?? null });
}
