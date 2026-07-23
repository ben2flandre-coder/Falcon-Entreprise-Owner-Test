export const ENVIRONMENT_CONFIGURATION_VERSION = "EnvironmentConfiguration@1.0";

export const ENVIRONMENT_PROFILES = Object.freeze({
  development: Object.freeze({
    logLevel: "debug",
    diagnosticsEnabled: true,
    demoMode: false,
    persistenceNamespace: "falcon-enterprise-dev",
    releaseChannel: "development"
  }),
  demonstration: Object.freeze({
    logLevel: "info",
    diagnosticsEnabled: true,
    demoMode: true,
    persistenceNamespace: "falcon-enterprise-demo",
    releaseChannel: "demonstration"
  }),
  production: Object.freeze({
    logLevel: "warn",
    diagnosticsEnabled: true,
    demoMode: false,
    persistenceNamespace: "falcon-enterprise",
    releaseChannel: "production"
  })
});

const ALLOWED_KEYS = Object.freeze([
  "logLevel",
  "diagnosticsEnabled",
  "demoMode",
  "persistenceNamespace",
  "releaseChannel"
]);

const LOG_LEVELS = Object.freeze(["debug", "info", "warn", "error"]);
const SENSITIVE_KEY_PATTERN = /(secret|token|password|passphrase|api.?key|private.?key|credential)/i;

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function validateValues(values) {
  assertPlainObject(values, "Environment configuration values");

  const unknownKeys = Object.keys(values).filter((key) => !ALLOWED_KEYS.includes(key));
  const sensitiveKeys = Object.keys(values).filter((key) => SENSITIVE_KEY_PATTERN.test(key));

  if (sensitiveKeys.length > 0) {
    throw new TypeError(`Sensitive configuration keys are forbidden: ${sensitiveKeys.join(", ")}.`);
  }
  if (unknownKeys.length > 0) {
    throw new TypeError(`Unknown configuration keys: ${unknownKeys.join(", ")}.`);
  }
  if (!LOG_LEVELS.includes(values.logLevel)) {
    throw new TypeError(`Unsupported log level: ${String(values.logLevel)}.`);
  }
  if (typeof values.diagnosticsEnabled !== "boolean") {
    throw new TypeError("diagnosticsEnabled must be a boolean.");
  }
  if (typeof values.demoMode !== "boolean") {
    throw new TypeError("demoMode must be a boolean.");
  }
  if (typeof values.persistenceNamespace !== "string" || values.persistenceNamespace.trim() === "") {
    throw new TypeError("persistenceNamespace must be a non-empty string.");
  }
  if (typeof values.releaseChannel !== "string" || values.releaseChannel.trim() === "") {
    throw new TypeError("releaseChannel must be a non-empty string.");
  }
  if (values.releaseChannel === "production" && values.demoMode) {
    throw new TypeError("Production configuration cannot enable demonstration mode.");
  }
}

export function createEnvironmentConfiguration({ profile, overrides = {} } = {}) {
  if (!Object.hasOwn(ENVIRONMENT_PROFILES, profile)) {
    throw new TypeError(`Unknown environment profile: ${String(profile)}.`);
  }
  assertPlainObject(overrides, "Environment configuration overrides");

  const values = { ...ENVIRONMENT_PROFILES[profile], ...overrides };
  validateValues(values);

  const snapshot = freezeDeep({
    version: ENVIRONMENT_CONFIGURATION_VERSION,
    profile,
    values,
    source: "explicit",
    valid: true
  });

  return Object.freeze({
    version: ENVIRONMENT_CONFIGURATION_VERSION,
    profile,
    snapshot: () => snapshot,
    get: (key) => {
      if (!ALLOWED_KEYS.includes(key)) throw new TypeError(`Unknown configuration key: ${String(key)}.`);
      return snapshot.values[key];
    }
  });
}
