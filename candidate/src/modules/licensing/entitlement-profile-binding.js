import { can, getProfile } from "../security/rbac.js";
import { describeLicenseEdition, evaluateLicense } from "./license-foundation.js";

export const ENTITLEMENT_BINDING_VERSION = "EntitlementBinding@1.0";

export const EDITION_PROFILE_BINDINGS = Object.freeze({
  solo: Object.freeze([
    "Super Administrateur",
    "Consultant Senior",
    "Auditeur",
    "Préventeur",
    "Lecteur",
    "Démonstration"
  ]),
  pack: Object.freeze([
    "Super Administrateur",
    "Administrateur",
    "Responsable",
    "Consultant Senior",
    "Auditeur",
    "Préventeur",
    "Client",
    "Lecteur",
    "Démonstration"
  ]),
  enterprise: Object.freeze([
    "Super Administrateur",
    "Administrateur",
    "Responsable",
    "Consultant Senior",
    "Auditeur",
    "Préventeur",
    "Client",
    "Lecteur",
    "Démonstration"
  ])
});

function freezeResult(value) {
  return Object.freeze({
    ...value,
    reasons: Object.freeze([...(value.reasons ?? [])])
  });
}

export function listLicensedProfiles(editionId) {
  const edition = describeLicenseEdition(editionId);
  if (!edition) return Object.freeze([]);
  return EDITION_PROFILE_BINDINGS[edition.id] ?? Object.freeze([]);
}

export function isProfileLicensed(contract, profileName, context = {}) {
  const licenseResult = evaluateLicense(contract, context);
  if (!licenseResult.valid) {
    return freezeResult({ allowed: false, reasons: licenseResult.reasons, profileName, edition: contract?.edition ?? null });
  }
  if (!getProfile(profileName)) {
    return freezeResult({ allowed: false, reasons: ["unknown-profile"], profileName, edition: contract.edition });
  }
  if (!listLicensedProfiles(contract.edition).includes(profileName)) {
    return freezeResult({ allowed: false, reasons: ["profile-not-licensed"], profileName, edition: contract.edition });
  }
  return freezeResult({ allowed: true, reasons: [], profileName, edition: contract.edition });
}

export function authorizeLicensedAction({
  contract,
  profileName,
  permission,
  capability,
  context = {}
}) {
  const profileResult = isProfileLicensed(contract, profileName, {
    ...context,
    requiredCapability: capability ?? null
  });
  const reasons = [...profileResult.reasons];

  if (!permission || typeof permission !== "string") reasons.push("permission-required");
  else if (!can(profileName, permission)) reasons.push("rbac-permission-denied");

  return freezeResult({
    allowed: reasons.length === 0,
    reasons,
    profileName,
    permission: permission ?? null,
    capability: capability ?? null,
    edition: contract?.edition ?? null,
    contractVersion: contract?.version ?? null,
    bindingVersion: ENTITLEMENT_BINDING_VERSION
  });
}
