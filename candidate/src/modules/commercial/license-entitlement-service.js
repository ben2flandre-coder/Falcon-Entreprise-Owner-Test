export const LICENSE_ENTITLEMENT_SERVICE_VERSION = "LicenseEntitlementService@1.0";

const TIERS = Object.freeze({
  trial: Object.freeze(["observe", "analyse", "report"]),
  professional: Object.freeze(["observe", "analyse", "arbitrate", "report", "export"]),
  enterprise: Object.freeze(["observe", "analyse", "arbitrate", "report", "export", "admin", "audit"])
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

export function createLicenseEntitlementService({ now = () => new Date().toISOString() } = {}) {
  if (typeof now !== "function") throw new TypeError("License clock must be a function.");
  const audit = [];

  function evaluate({ licenseId, tier, status = "active", expiresAt = null, userProfile = "operator" } = {}) {
    const normalizedId = text(licenseId, "License id");
    const capabilities = TIERS[tier];
    const issues = [];
    if (!capabilities) issues.push("TIER_UNSUPPORTED");
    if (!new Set(["active", "suspended", "revoked"]).has(status)) issues.push("STATUS_UNSUPPORTED");
    if (expiresAt && Number.isNaN(Date.parse(expiresAt))) issues.push("EXPIRY_INVALID");
    if (expiresAt && Date.parse(expiresAt) <= Date.parse(now())) issues.push("LICENSE_EXPIRED");
    if (status !== "active") issues.push(`LICENSE_${status.toUpperCase()}`);

    const result = freezeDeep({
      version: LICENSE_ENTITLEMENT_SERVICE_VERSION,
      licenseId: normalizedId,
      tier: capabilities ? tier : null,
      userProfile,
      allowed: issues.length === 0,
      decision: issues.length === 0 ? "granted" : "denied",
      capabilities: issues.length === 0 ? [...capabilities] : [],
      dataAccessRevoked: false,
      offlineEvaluation: true,
      evaluatedAt: String(now()),
      issues
    });
    audit.unshift(result);
    return result;
  }

  function recentAudit() {
    return freezeDeep(structuredClone(audit));
  }

  return Object.freeze({ version: LICENSE_ENTITLEMENT_SERVICE_VERSION, evaluate, recentAudit });
}
