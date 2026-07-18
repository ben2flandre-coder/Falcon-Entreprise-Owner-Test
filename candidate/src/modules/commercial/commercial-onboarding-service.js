export const COMMERCIAL_ONBOARDING_SERVICE_VERSION = "CommercialOnboardingService@1.0";

const ONBOARDING_KEY = "falcon:control:onboarding";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

export function createCommercialOnboardingService({ storage, now = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
    throw new TypeError("Onboarding service requires storage get/set operations.");
  }
  if (typeof now !== "function") throw new TypeError("Onboarding clock must be a function.");

  function readRaw() {
    const raw = storage.get(ONBOARDING_KEY, null, { origin: "commercial-onboarding" });
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function configure({ organisation, administrator, client, supportContact = null } = {}) {
    const record = freezeDeep({
      version: COMMERCIAL_ONBOARDING_SERVICE_VERSION,
      organisation: text(organisation, "Organisation"),
      administrator: text(administrator, "Administrator"),
      client: text(client, "Client"),
      supportContact: supportContact ? text(supportContact, "Support contact") : null,
      configuredAt: String(now()),
      complete: true
    });
    const persisted = storage.set(ONBOARDING_KEY, JSON.stringify(record), { origin: "commercial-onboarding" });
    return freezeDeep({ persisted, record });
  }

  function snapshot() {
    const record = readRaw();
    return freezeDeep({
      version: COMMERCIAL_ONBOARDING_SERVICE_VERSION,
      configured: Boolean(record?.complete),
      record
    });
  }

  return Object.freeze({ configure, snapshot });
}
