export const PRODUCT_MODE_CONTROLLER_VERSION = "ProductModeController@1.0";

const MODES = new Set(["production", "demonstration"]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function assertMode(mode) {
  if (!MODES.has(mode)) throw new TypeError(`Unsupported product mode: ${String(mode)}.`);
  return mode;
}

export function createProductModeController({
  initialMode = "production",
  now = () => new Date().toISOString()
} = {}) {
  if (typeof now !== "function") throw new TypeError("Product mode clock must be a function.");
  let mode = assertMode(initialMode);
  let generation = 0;
  const audit = [];

  function trace(operation, actor, reason) {
    audit.unshift(freezeDeep({ at: String(now()), operation, actor: actor || null, reason: reason || null, mode, generation }));
  }

  function snapshot() {
    return freezeDeep({
      version: PRODUCT_MODE_CONTROLLER_VERSION,
      mode,
      generation,
      productionDefault: true,
      demoExplicit: true,
      demoIsolated: true,
      userDataMutation: false
    });
  }

  function activateDemonstration({ actor, reason } = {}) {
    mode = "demonstration";
    generation += 1;
    trace("demonstration.activate", actor, reason);
    return snapshot();
  }

  function resetDemonstration({ actor, reason } = {}) {
    generation += 1;
    trace("demonstration.reset", actor, reason);
    return snapshot();
  }

  function returnToProduction({ actor, reason } = {}) {
    mode = "production";
    generation += 1;
    trace("production.activate", actor, reason);
    return snapshot();
  }

  function recentAudit() {
    return freezeDeep(structuredClone(audit));
  }

  return Object.freeze({ version: PRODUCT_MODE_CONTROLLER_VERSION, snapshot, activateDemonstration, resetDemonstration, returnToProduction, recentAudit });
}
