import { createProductModeController } from "./product-mode-controller.js";
import { createLicenseEntitlementService } from "./license-entitlement-service.js";

export const COMMERCIAL_PRODUCT_INTEGRATION_VERSION = "CommercialProductIntegration@1.0";

const CONTROL_PREFIX = "falcon:control:";
const LICENSE_KEY = `${CONTROL_PREFIX}license`;
const MODE_KEY = `${CONTROL_PREFIX}mode`;
const SPACE_PREFIXES = Object.freeze({
  production: "falcon:production:",
  demonstration: "falcon:demonstration:"
});

const PERMISSION_CAPABILITY = Object.freeze({
  "mission.read": "observe",
  "mission.create": "observe",
  "mission.update": "analyse",
  "document.create": "analyse",
  "report.export": "export",
  "security.configure": "admin",
  "admin.full": "admin"
});

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function parseJson(raw, fallback = null) {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function assertStorage(storage) {
  for (const method of ["get", "set", "remove", "keys", "exportData"]) {
    if (typeof storage?.[method] !== "function") {
      throw new TypeError(`Commercial integration requires storage.${method}().`);
    }
  }
}

export function createCommercialProductIntegration({
  storage,
  now = () => new Date().toISOString(),
  defaultLicense = Object.freeze({
    licenseId: "falcon-local-trial",
    tier: "trial",
    status: "active",
    userProfile: "operator"
  })
} = {}) {
  assertStorage(storage);
  if (typeof now !== "function") throw new TypeError("Commercial integration clock must be a function.");

  const storedMode = storage.get(MODE_KEY, "production", { origin: "commercial-bootstrap" });
  const modeController = createProductModeController({
    initialMode: storedMode === "demonstration" ? "demonstration" : "production",
    now
  });
  const entitlementService = createLicenseEntitlementService({ now });
  const audit = [];

  function trace(operation, detail = {}) {
    audit.unshift(freezeDeep({ at: String(now()), operation, ...detail }));
    if (audit.length > 260) audit.length = 260;
  }

  function currentMode() {
    return modeController.snapshot().mode;
  }

  function prefix(mode = currentMode()) {
    const value = SPACE_PREFIXES[mode];
    if (!value) throw new TypeError(`Unsupported data space: ${String(mode)}.`);
    return value;
  }

  function scopedKey(key, mode = currentMode()) {
    if (key === null || key === undefined || String(key).length === 0) {
      throw new TypeError("Scoped storage key is required.");
    }
    return `${prefix(mode)}${String(key)}`;
  }

  function read(key, fallback = null) {
    return storage.get(scopedKey(key), fallback, { origin: `commercial-${currentMode()}` });
  }

  function write(key, value) {
    const target = scopedKey(key);
    const ok = storage.set(target, value, { origin: `commercial-${currentMode()}` });
    trace("data.write", { mode: currentMode(), key: target, ok });
    return ok;
  }

  function remove(key) {
    const target = scopedKey(key);
    const ok = storage.remove(target, { origin: `commercial-${currentMode()}` });
    trace("data.remove", { mode: currentMode(), key: target, ok });
    return ok;
  }

  function list(mode = currentMode()) {
    return freezeDeep(storage.keys(prefix(mode)));
  }

  function activateDemonstration({ actor = null, reason = null } = {}) {
    const snapshot = modeController.activateDemonstration({ actor, reason });
    storage.set(MODE_KEY, "demonstration", { origin: "commercial-mode" });
    trace("mode.demonstration.activate", { actor, reason });
    return snapshot;
  }

  function returnToProduction({ actor = null, reason = null } = {}) {
    const snapshot = modeController.returnToProduction({ actor, reason });
    storage.set(MODE_KEY, "production", { origin: "commercial-mode" });
    trace("mode.production.activate", { actor, reason });
    return snapshot;
  }

  function resetDemonstration({ actor = null, reason = null } = {}) {
    const keys = [...storage.keys(prefix("demonstration"))];
    const failed = [];
    for (const key of keys) {
      if (!storage.remove(key, { origin: "commercial-demo-reset" })) failed.push(key);
    }
    const controllerSnapshot = modeController.resetDemonstration({ actor, reason });
    const result = freezeDeep({
      ok: failed.length === 0,
      removed: keys.length - failed.length,
      failed,
      productionKeysPreserved: storage.keys(prefix("production")).length,
      controller: controllerSnapshot
    });
    trace("mode.demonstration.reset", { actor, reason, removed: result.removed, failed: failed.length });
    return result;
  }

  function saveLicense(license) {
    const evaluation = entitlementService.evaluate(license);
    const persisted = storage.set(LICENSE_KEY, JSON.stringify(license), { origin: "commercial-license" });
    trace("license.save", { licenseId: evaluation.licenseId, decision: evaluation.decision, persisted });
    return freezeDeep({ evaluation, persisted });
  }

  function evaluateLicense() {
    const stored = parseJson(storage.get(LICENSE_KEY, null, { origin: "commercial-license" }), defaultLicense);
    const evaluation = entitlementService.evaluate(stored || defaultLicense);
    trace("license.evaluate", { licenseId: evaluation.licenseId, decision: evaluation.decision });
    return evaluation;
  }

  function clearLicense() {
    const ok = storage.remove(LICENSE_KEY, { origin: "commercial-license" });
    trace("license.clear", { ok });
    return ok;
  }

  function createAccessController(rbac) {
    if (!rbac || typeof rbac.can !== "function") throw new TypeError("RBAC controller is required.");
    const listeners = new Set();
    const unsubscribe = typeof rbac.subscribe === "function"
      ? rbac.subscribe((profile) => { for (const listener of listeners) listener(profile); })
      : () => {};

    return Object.freeze({
      get value() { return rbac.value; },
      can(permission) {
        if (!rbac.can(permission)) return false;
        const capability = PERMISSION_CAPABILITY[permission];
        if (!capability) return true;
        return evaluateLicense().capabilities.includes(capability);
      },
      render: (...args) => rbac.render?.(...args),
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("Access listener must be a function.");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose: unsubscribe
    });
  }

  function exportCurrentSpace() {
    return freezeDeep(storage.exportData(prefix()));
  }

  function snapshot() {
    const license = evaluateLicense();
    return freezeDeep({
      version: COMMERCIAL_PRODUCT_INTEGRATION_VERSION,
      mode: modeController.snapshot(),
      license,
      spaces: {
        production: storage.keys(prefix("production")).length,
        demonstration: storage.keys(prefix("demonstration")).length
      },
      controls: { licenseKey: LICENSE_KEY, modeKey: MODE_KEY },
      localFirst: true,
      offline: true
    });
  }

  function recentAudit() {
    return freezeDeep(structuredClone(audit));
  }

  return Object.freeze({
    version: COMMERCIAL_PRODUCT_INTEGRATION_VERSION,
    snapshot,
    currentMode,
    read,
    write,
    remove,
    list,
    activateDemonstration,
    returnToProduction,
    resetDemonstration,
    saveLicense,
    evaluateLicense,
    clearLicense,
    createAccessController,
    exportCurrentSpace,
    recentAudit
  });
}
