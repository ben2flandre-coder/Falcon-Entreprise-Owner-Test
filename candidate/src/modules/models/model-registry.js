export const MODEL_REGISTRY_VERSION = "V48.0.0-dev";

const MODEL_NAME_PATTERN = /^[A-Z][A-Za-z0-9]{1,79}$/;
const VERSION_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;

export class ModelRegistryError extends Error {
  constructor(message, code = "MODEL_REGISTRY_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ModelValidationError extends ModelRegistryError {
  constructor(message) { super(message, "MODEL_VALIDATION_ERROR"); }
}

export class ModelConflictError extends ModelRegistryError {
  constructor(message) { super(message, "MODEL_CONFLICT_ERROR"); }
}

export class ModelCompatibilityError extends ModelRegistryError {
  constructor(message) { super(message, "MODEL_COMPATIBILITY_ERROR"); }
}

function normalizeModelName(value) {
  if (typeof value !== "string") throw new ModelValidationError("Model name must be a string.");
  const normalized = value.trim();
  if (!MODEL_NAME_PATTERN.test(normalized)) throw new ModelValidationError(`Invalid model name: ${value}`);
  return normalized;
}

function normalizeVersion(value) {
  if (typeof value !== "string") throw new ModelValidationError("Model version must be a string.");
  const normalized = value.trim();
  if (!VERSION_PATTERN.test(normalized)) throw new ModelValidationError(`Invalid model version: ${value}`);
  return normalized;
}

function versionParts(value) {
  return normalizeVersion(value).split(".").map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return Math.sign(delta);
  }
  return 0;
}

function clone(value) {
  try { return structuredClone(value); }
  catch (error) {
    throw new ModelValidationError(`Model value is not cloneable: ${error.message || error}`);
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function describeError(error) {
  return Object.freeze({
    name: error?.name || "Error",
    code: error?.code || null,
    message: error?.message || String(error)
  });
}

export function createModelRegistry({ diagnosticsLimit = 160, now = () => new Date().toISOString() } = {}) {
  if (!Number.isInteger(diagnosticsLimit) || diagnosticsLimit < 1) {
    throw new RangeError("Model Registry diagnostics limit must be a positive integer.");
  }
  if (typeof now !== "function") throw new TypeError("Model Registry clock must be a function.");

  const models = new Map();
  const diagnostics = [];

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function trace(status, details = {}) {
    diagnostics.unshift(Object.freeze({
      at: timestamp(),
      status,
      model: details.model || null,
      version: details.version || null,
      targetVersion: details.targetVersion || null,
      operation: details.operation || "model.read",
      error: details.error ? describeError(details.error) : null
    }));
    if (diagnostics.length > diagnosticsLimit) diagnostics.length = diagnosticsLimit;
  }

  function register({ name, version, validate, migrateFrom = {}, metadata = {} } = {}) {
    const modelName = normalizeModelName(name);
    const modelVersion = normalizeVersion(version);
    if (typeof validate !== "function") throw new TypeError("Model validator must be a function.");
    if (!migrateFrom || typeof migrateFrom !== "object" || Array.isArray(migrateFrom)) {
      throw new ModelValidationError("Model migrations must be an object.");
    }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new ModelValidationError("Model metadata must be an object.");
    }

    const versions = models.get(modelName) || new Map();
    if (versions.has(modelVersion)) {
      throw new ModelConflictError(`Model already registered: ${modelName}@${modelVersion}`);
    }

    const migrations = new Map();
    for (const [sourceVersion, migrate] of Object.entries(migrateFrom)) {
      const normalizedSource = normalizeVersion(sourceVersion);
      if (compareVersions(normalizedSource, modelVersion) >= 0) {
        throw new ModelValidationError(`Migration source must be older than ${modelVersion}: ${normalizedSource}`);
      }
      if (typeof migrate !== "function") throw new TypeError(`Migration for ${normalizedSource} must be a function.`);
      migrations.set(normalizedSource, migrate);
    }

    const definition = Object.freeze({
      name: modelName,
      version: modelVersion,
      validate,
      migrations,
      metadata: freezeDeep(clone(metadata))
    });
    versions.set(modelVersion, definition);
    models.set(modelName, versions);
    trace("registered", { model: modelName, version: modelVersion, operation: "model.register" });
    return Object.freeze({ name: modelName, version: modelVersion });
  }

  function getDefinition(name, version = null) {
    const modelName = normalizeModelName(name);
    const versions = models.get(modelName);
    if (!versions || versions.size === 0) throw new ModelValidationError(`Unknown model: ${modelName}`);
    const modelVersion = version == null
      ? [...versions.keys()].sort(compareVersions).at(-1)
      : normalizeVersion(version);
    const definition = versions.get(modelVersion);
    if (!definition) throw new ModelValidationError(`Unknown model version: ${modelName}@${modelVersion}`);
    return definition;
  }

  function validate(name, version, value) {
    const definition = getDefinition(name, version);
    let valid = false;
    try { valid = definition.validate(clone(value)) === true; }
    catch (error) {
      trace("validation-failed", { model: definition.name, version: definition.version, operation: "model.validate", error });
      throw new ModelValidationError(`Validator failed for ${definition.name}@${definition.version}: ${error.message || error}`);
    }
    if (!valid) {
      const error = new ModelValidationError(`Model validation failed: ${definition.name}@${definition.version}`);
      trace("validation-failed", { model: definition.name, version: definition.version, operation: "model.validate", error });
      throw error;
    }
    trace("validated", { model: definition.name, version: definition.version, operation: "model.validate" });
    return freezeDeep(clone(value));
  }

  function migrate(name, fromVersion, toVersion, value) {
    const modelName = normalizeModelName(name);
    const source = normalizeVersion(fromVersion);
    const target = normalizeVersion(toVersion);
    if (compareVersions(source, target) >= 0) {
      throw new ModelCompatibilityError(`Migration target must be newer: ${source} -> ${target}`);
    }
    const targetDefinition = getDefinition(modelName, target);
    const migrateFn = targetDefinition.migrations.get(source);
    if (!migrateFn) throw new ModelCompatibilityError(`No migration path for ${modelName}: ${source} -> ${target}`);

    let migrated;
    try { migrated = clone(migrateFn(clone(value))); }
    catch (error) {
      trace("migration-failed", { model: modelName, version: source, targetVersion: target, operation: "model.migrate", error });
      throw new ModelCompatibilityError(`Migration failed for ${modelName}: ${source} -> ${target}: ${error.message || error}`);
    }
    validate(modelName, target, migrated);
    trace("migrated", { model: modelName, version: source, targetVersion: target, operation: "model.migrate" });
    return freezeDeep(migrated);
  }

  function isCompatible(name, readerVersion, dataVersion) {
    const modelName = normalizeModelName(name);
    const reader = normalizeVersion(readerVersion);
    const data = normalizeVersion(dataVersion);
    getDefinition(modelName, reader);
    const [readerMajor] = versionParts(reader);
    const [dataMajor] = versionParts(data);
    const compatible = readerMajor === dataMajor && compareVersions(data, reader) <= 0;
    trace(compatible ? "compatible" : "incompatible", {
      model: modelName,
      version: data,
      targetVersion: reader,
      operation: "model.compatibility"
    });
    return compatible;
  }

  function list(name = null) {
    if (name == null) {
      return Object.freeze([...models.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([modelName, versions]) => Object.freeze({
          name: modelName,
          versions: Object.freeze([...versions.keys()].sort(compareVersions))
        })));
    }
    const modelName = normalizeModelName(name);
    const versions = models.get(modelName);
    return Object.freeze(versions ? [...versions.keys()].sort(compareVersions) : []);
  }

  function manifest() {
    return freezeDeep({
      schema: "falcon.model.registry.manifest.v1",
      version: MODEL_REGISTRY_VERSION,
      models: list().map((entry) => ({ ...entry }))
    });
  }

  function describe(name, version = null) {
    const definition = getDefinition(name, version);
    return freezeDeep({
      name: definition.name,
      version: definition.version,
      metadata: clone(definition.metadata),
      migrationsFrom: [...definition.migrations.keys()].sort(compareVersions)
    });
  }

  function unregister(name, version) {
    const modelName = normalizeModelName(name);
    const modelVersion = normalizeVersion(version);
    const versions = models.get(modelName);
    if (!versions || !versions.delete(modelVersion)) return false;
    if (versions.size === 0) models.delete(modelName);
    trace("unregistered", { model: modelName, version: modelVersion, operation: "model.unregister" });
    return true;
  }

  function recentDiagnostics() {
    return diagnostics.map((entry) => ({
      ...entry,
      error: entry.error ? { ...entry.error } : null
    }));
  }

  return Object.freeze({
    register,
    unregister,
    validate,
    migrate,
    isCompatible,
    list,
    manifest,
    describe,
    recentDiagnostics
  });
}
