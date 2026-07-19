import "./owner-product-polish.js";
import { can as profileCan } from "../modules/security/rbac.js";
import { createCommercialOnboardingService } from "../modules/commercial/commercial-onboarding-service.js";
import { createCommercialProductIntegration } from "../modules/commercial/commercial-product-integration.js";
import { createEnterpriseRuntime, ENTERPRISE_RUNTIME_VERSION } from "../modules/enterprise/enterprise-runtime.js";

const STORAGE_PREFIX = "falcon:enterprise:v1:";

function createBrowserStorage(storage = window.localStorage) {
  const keyFor = (key) => `${STORAGE_PREFIX}${String(key)}`;
  return Object.freeze({
    get(key, fallback = null) {
      const raw = storage.getItem(keyFor(key));
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    set(key, value) {
      try {
        storage.setItem(keyFor(key), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        storage.removeItem(keyFor(key));
        return true;
      } catch {
        return false;
      }
    },
    keys(prefix = "") {
      const expected = keyFor(prefix);
      const result = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(expected)) result.push(key.slice(STORAGE_PREFIX.length));
      }
      return result.sort();
    },
    exportData(prefix = "") {
      return Object.freeze(Object.fromEntries(this.keys(prefix).map((key) => [key, this.get(key)])));
    }
  });
}

function currentProfile() {
  try {
    return window.FalconSecurityManager?.ensure?.().currentProfile || "Consultant Senior";
  } catch {
    return "Consultant Senior";
  }
}

function boot() {
  if (window.FalconEnterprise?.runtime) return window.FalconEnterprise;

  const storage = createBrowserStorage();
  const commercial = createCommercialProductIntegration({ storage });
  const onboarding = createCommercialOnboardingService({ storage });
  const authorize = (permission) => profileCan(currentProfile(), permission);
  const runtimeStorage = Object.freeze({
    get: (key, fallback = null) => commercial.read(key, fallback),
    set: (key, value) => commercial.write(key, value),
    remove: (key) => commercial.remove(key)
  });
  const runtime = createEnterpriseRuntime({ storage: runtimeStorage, authorize });

  const api = Object.freeze({
    schema: "falcon.enterprise.canonical-entrypoint.v1",
    version: ENTERPRISE_RUNTIME_VERSION,
    bootedAt: new Date().toISOString(),
    entrypoint: "index.html",
    ux: "showcase",
    runtime,
    storage,
    commercial,
    onboarding,
    snapshot() {
      return Object.freeze({
        schema: this.schema,
        version: this.version,
        entrypoint: this.entrypoint,
        ux: this.ux,
        profile: currentProfile(),
        mode: commercial.snapshot().mode.mode,
        license: commercial.snapshot().license,
        onboarding: onboarding.snapshot(),
        runtime: runtime.snapshot()
      });
    }
  });

  Object.defineProperty(window, "FalconEnterprise", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: api
  });
  document.documentElement.dataset.falconEnterpriseRuntime = "ready";
  window.dispatchEvent(new CustomEvent("falcon:enterprise:ready", { detail: api.snapshot() }));
  return api;
}

try {
  boot();
} catch (error) {
  document.documentElement.dataset.falconEnterpriseRuntime = "failed";
  console.error("Falcon Enterprise canonical boot failed.", error);
  window.dispatchEvent(new CustomEvent("falcon:enterprise:failed", {
    detail: { message: error instanceof Error ? error.message : String(error) }
  }));
}
