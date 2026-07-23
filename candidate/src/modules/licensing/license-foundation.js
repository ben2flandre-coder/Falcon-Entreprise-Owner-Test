export const LICENSE_FOUNDATION_VERSION = "LicenseFoundation@1.0";
export const LICENSE_SCHEMA = "falcon.license.v1";

export const LICENSE_EDITIONS = Object.freeze({
  SOLO: Object.freeze({ id: "solo", seatLimit: 1, capabilities: Object.freeze(["core", "reporting", "local-storage"]) }),
  PACK: Object.freeze({ id: "pack", seatLimit: 5, capabilities: Object.freeze(["core", "reporting", "local-storage", "team-profiles"]) }),
  ENTERPRISE: Object.freeze({ id: "enterprise", seatLimit: null, capabilities: Object.freeze(["core", "reporting", "local-storage", "team-profiles", "enterprise-governance", "distribution-readiness"]) })
});

const EDITION_BY_ID = Object.freeze(Object.fromEntries(Object.values(LICENSE_EDITIONS).map((edition) => [edition.id, edition])));

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${field} is required.`);
  return normalized;
}

function normalizeIsoDate(value, field) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid ISO date.`);
  return date.toISOString();
}

export function describeLicenseEdition(editionId) {
  return EDITION_BY_ID[String(editionId ?? "").toLowerCase()] ?? null;
}

export function createLicenseContract({
  licenseId,
  customerId,
  edition,
  issuedAt,
  expiresAt = null,
  seatLimit,
  capabilities,
  metadata = {}
}, { now = () => new Date().toISOString() } = {}) {
  const editionDefinition = describeLicenseEdition(edition);
  if (!editionDefinition) throw new RangeError(`Unsupported license edition: ${edition}`);

  const normalizedIssuedAt = normalizeIsoDate(issuedAt ?? now(), "issuedAt");
  const normalizedExpiresAt = normalizeIsoDate(expiresAt, "expiresAt");
  if (normalizedExpiresAt && normalizedExpiresAt <= normalizedIssuedAt) {
    throw new RangeError("expiresAt must be later than issuedAt.");
  }

  const effectiveSeatLimit = seatLimit ?? editionDefinition.seatLimit;
  if (effectiveSeatLimit !== null && (!Number.isInteger(effectiveSeatLimit) || effectiveSeatLimit < 1)) {
    throw new RangeError("seatLimit must be a positive integer or null.");
  }
  if (editionDefinition.seatLimit !== null && effectiveSeatLimit > editionDefinition.seatLimit) {
    throw new RangeError(`seatLimit exceeds the ${editionDefinition.id} edition limit.`);
  }

  const requestedCapabilities = capabilities ?? editionDefinition.capabilities;
  if (!Array.isArray(requestedCapabilities) || requestedCapabilities.length === 0) {
    throw new TypeError("capabilities must be a non-empty array.");
  }
  const uniqueCapabilities = [...new Set(requestedCapabilities.map((item) => normalizeText(item, "capability")))].sort();
  const forbidden = uniqueCapabilities.filter((capability) => !editionDefinition.capabilities.includes(capability));
  if (forbidden.length) throw new RangeError(`Capabilities not allowed for ${editionDefinition.id}: ${forbidden.join(", ")}`);

  return freezeDeep({
    schema: LICENSE_SCHEMA,
    version: LICENSE_FOUNDATION_VERSION,
    licenseId: normalizeText(licenseId, "licenseId"),
    customerId: normalizeText(customerId, "customerId"),
    edition: editionDefinition.id,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedExpiresAt,
    seatLimit: effectiveSeatLimit,
    capabilities: uniqueCapabilities,
    metadata: structuredClone(metadata)
  });
}

export function evaluateLicense(contract, { at = new Date().toISOString(), activeSeats = 0, requiredCapability = null } = {}) {
  if (!contract || contract.schema !== LICENSE_SCHEMA) return freezeDeep({ valid: false, reasons: ["invalid-schema"] });
  const reasons = [];
  const edition = describeLicenseEdition(contract.edition);
  if (!edition) reasons.push("unknown-edition");
  const evaluatedAt = normalizeIsoDate(at, "at");
  if (contract.expiresAt && evaluatedAt >= contract.expiresAt) reasons.push("expired");
  if (!Number.isInteger(activeSeats) || activeSeats < 0) reasons.push("invalid-active-seats");
  else if (contract.seatLimit !== null && activeSeats > contract.seatLimit) reasons.push("seat-limit-exceeded");
  if (requiredCapability && !contract.capabilities?.includes(requiredCapability)) reasons.push("capability-denied");
  return freezeDeep({ valid: reasons.length === 0, reasons, edition: contract.edition, evaluatedAt });
}

export function hasLicensedCapability(contract, capability, context = {}) {
  return evaluateLicense(contract, { ...context, requiredCapability: capability }).valid;
}
