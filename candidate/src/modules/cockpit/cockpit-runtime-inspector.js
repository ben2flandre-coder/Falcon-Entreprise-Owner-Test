export const COCKPIT_RUNTIME_INSPECTOR_VERSION = "CockpitRuntimeInspector@1.0";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function methodNames(target) {
  if (!target || typeof target !== "object") return [];
  return Object.keys(target)
    .filter((name) => typeof target[name] === "function")
    .sort();
}

function componentDescriptor(name, component) {
  if (!component || typeof component !== "object") {
    return { name, status: "unavailable", version: null, capabilities: [] };
  }
  return {
    name,
    status: "available",
    version: typeof component.version === "string" ? component.version : null,
    capabilities: methodNames(component)
  };
}

export function createCockpitRuntimeInspector({
  runtime,
  runtimeVersion = null,
  now = () => new Date().toISOString()
} = {}) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("Cockpit runtime inspector requires an Enterprise runtime instance.");
  }
  if (runtimeVersion != null && typeof runtimeVersion !== "string") {
    throw new TypeError("Cockpit runtime version must be a string or null.");
  }
  if (typeof now !== "function") throw new TypeError("Cockpit runtime inspector clock must be a function.");

  function snapshot() {
    const manifest = typeof runtime.models?.manifest === "function" ? runtime.models.manifest() : null;
    const components = [
      "missions",
      "sessions",
      "folders",
      "observations",
      "media",
      "criticality",
      "radar",
      "trust",
      "reports",
      "events",
      "models",
      "persistence"
    ].map((name) => componentDescriptor(name, runtime[name]));

    const available = components.filter((component) => component.status === "available").length;
    const unavailable = components.length - available;

    return freezeDeep({
      version: COCKPIT_RUNTIME_INSPECTOR_VERSION,
      generatedAt: String(now()),
      runtime: {
        version: runtimeVersion,
        capabilities: methodNames(runtime)
      },
      registry: {
        schema: manifest?.schema || null,
        version: manifest?.version || null,
        modelCount: Array.isArray(manifest?.models) ? manifest.models.length : 0,
        models: Array.isArray(manifest?.models)
          ? manifest.models.map((model) => ({ name: model.name, versions: [...model.versions] }))
          : []
      },
      components,
      summary: {
        total: components.length,
        available,
        unavailable,
        status: unavailable === 0 ? "healthy" : available === 0 ? "unavailable" : "degraded"
      }
    });
  }

  function inspect(name) {
    const normalized = String(name || "").trim();
    const component = snapshot().components.find((entry) => entry.name === normalized);
    return component || null;
  }

  return Object.freeze({
    version: COCKPIT_RUNTIME_INSPECTOR_VERSION,
    snapshot,
    inspect
  });
}
