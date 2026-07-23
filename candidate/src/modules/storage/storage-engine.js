export const STORAGE_ENGINE_VERSION = "V48.0.0-dev";
export const DEFAULT_ACCESS_LOG_LIMIT = 260;

function describeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error || "Unknown storage error")
  };
}

function isPlainRecord(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function normalizeKey(key) {
  if (key === null || key === undefined) {
    throw new TypeError("Storage key is required.");
  }

  const normalized = String(key);
  if (normalized.length === 0) {
    throw new TypeError("Storage key must not be empty.");
  }

  return normalized;
}

function normalizePrefix(prefix, { allowEmpty = false } = {}) {
  if (typeof prefix !== "string") {
    throw new TypeError("Storage prefix must be a string.");
  }

  if (!allowEmpty && prefix.length === 0) {
    throw new TypeError("Storage prefix must not be empty.");
  }

  return prefix;
}

function readBackendLength(backend) {
  const length = backend.length;
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError("Storage backend must expose a non-negative integer length.");
  }
  return length;
}

export function requiredKilobytes(value, fallback = 100) {
  try {
    return Math.max(fallback, Math.round(String(value ?? "").length / 1024) + 20);
  } catch {
    return fallback;
  }
}

export function createStorageEngine({
  backend,
  appVersion = STORAGE_ENGINE_VERSION,
  accessLogLimit = DEFAULT_ACCESS_LOG_LIMIT,
  now = () => new Date().toISOString()
} = {}) {
  if (!backend) {
    throw new TypeError("A storage backend is required.");
  }

  for (const method of ["getItem", "setItem", "removeItem", "key"]) {
    if (typeof backend[method] !== "function") {
      throw new TypeError(`Storage backend must implement ${method}().`);
    }
  }

  readBackendLength(backend);

  if (!Number.isInteger(accessLogLimit) || accessLogLimit < 1) {
    throw new RangeError("Access log limit must be a positive integer.");
  }

  if (typeof now !== "function") {
    throw new TypeError("Storage clock must be a function.");
  }

  const accessLog = [];

  function timestamp() {
    try {
      return String(now());
    } catch {
      return new Date().toISOString();
    }
  }

  function trace(operation, key, meta = {}) {
    accessLog.unshift({
      at: timestamp(),
      operation: operation || "op",
      key: String(key ?? ""),
      ok: meta.ok !== false,
      kb: meta.kb ?? null,
      requiredKb: meta.requiredKb ?? null,
      origin: meta.origin || "runtime",
      error: meta.error ? describeError(meta.error) : null
    });

    if (accessLog.length > accessLogLimit) {
      accessLog.length = accessLogLimit;
    }
  }

  function get(key, fallback = null, meta = {}) {
    let normalizedKey = String(key ?? "");

    try {
      normalizedKey = normalizeKey(key);
      const raw = backend.getItem(normalizedKey);
      trace("get", normalizedKey, {
        ...meta,
        kb: raw ? Math.round(String(raw).length / 1024) : 0
      });
      return raw === null ? fallback : raw;
    } catch (error) {
      trace("get", normalizedKey, { ...meta, ok: false, error });
      return fallback;
    }
  }

  function set(key, value, meta = {}) {
    let normalizedKey = String(key ?? "");

    try {
      normalizedKey = normalizeKey(key);
      const serialized = String(value ?? "");
      backend.setItem(normalizedKey, serialized);
      trace("set", normalizedKey, {
        ...meta,
        kb: Math.round(serialized.length / 1024)
      });
      return true;
    } catch (error) {
      trace("set", normalizedKey, { ...meta, ok: false, error });
      return false;
    }
  }

  function remove(key, meta = {}) {
    let normalizedKey = String(key ?? "");

    try {
      normalizedKey = normalizeKey(key);
      backend.removeItem(normalizedKey);
      trace("remove", normalizedKey, meta);
      return true;
    } catch (error) {
      trace("remove", normalizedKey, { ...meta, ok: false, error });
      return false;
    }
  }

  function exists(key, meta = {}) {
    let normalizedKey = String(key ?? "");

    try {
      normalizedKey = normalizeKey(key);
      const present = backend.getItem(normalizedKey) !== null;
      trace("exists", normalizedKey, { ...meta, origin: meta.origin || "exists" });
      return present;
    } catch (error) {
      trace("exists", normalizedKey, {
        ...meta,
        origin: meta.origin || "exists",
        ok: false,
        error
      });
      return false;
    }
  }

  function listKeys(prefix = "") {
    const normalizedPrefix = normalizePrefix(prefix, { allowEmpty: true });
    const output = [];
    const length = readBackendLength(backend);

    for (let index = 0; index < length; index += 1) {
      const key = backend.key(index);
      if (key !== null && (!normalizedPrefix || String(key).startsWith(normalizedPrefix))) {
        output.push(String(key));
      }
    }

    return { normalizedPrefix, output };
  }

  function keys(prefix = "") {
    let normalizedPrefix = "";

    try {
      const inventory = listKeys(prefix);
      normalizedPrefix = inventory.normalizedPrefix;
      trace("keys", normalizedPrefix, { origin: "inventory" });
      return inventory.output;
    } catch (error) {
      trace("keys", normalizedPrefix, { origin: "inventory", ok: false, error });
      return [];
    }
  }

  function estimate(prefix = "") {
    let normalizedPrefix = "";
    let used = 0;
    let count = 0;

    try {
      normalizedPrefix = normalizePrefix(prefix, { allowEmpty: true });
      const length = readBackendLength(backend);

      for (let index = 0; index < length; index += 1) {
        const key = backend.key(index);
        if (key === null || (normalizedPrefix && !String(key).startsWith(normalizedPrefix))) continue;
        const value = backend.getItem(key) ?? "";
        used += String(key).length + String(value).length;
        count += 1;
      }

      trace("estimate", normalizedPrefix, { origin: "inventory", kb: Math.round(used / 1024) });
      return {
        keys: count,
        usedKb: Math.round(used / 1024),
        adapter: "custom",
        version: appVersion,
        prefix: normalizedPrefix,
        complete: true
      };
    } catch (error) {
      trace("estimate", normalizedPrefix, {
        origin: "inventory",
        ok: false,
        error,
        kb: Math.round(used / 1024)
      });
      return {
        keys: count,
        usedKb: Math.round(used / 1024),
        adapter: "custom",
        version: appVersion,
        prefix: normalizedPrefix,
        complete: false
      };
    }
  }

  function exportData(prefix = "falcon") {
    let normalizedPrefix = String(prefix ?? "");
    const payload = {
      exportedAt: timestamp(),
      version: appVersion,
      prefix: normalizedPrefix,
      complete: true,
      items: {}
    };

    try {
      normalizedPrefix = normalizePrefix(prefix);
      payload.prefix = normalizedPrefix;
      const inventory = listKeys(normalizedPrefix);
      trace("keys", normalizedPrefix, { origin: "export" });

      for (const key of inventory.output) {
        try {
          payload.items[key] = backend.getItem(key) ?? "";
          trace("export-read", key, { origin: "export" });
        } catch (error) {
          payload.complete = false;
          trace("export-read", key, { origin: "export", ok: false, error });
        }
      }
    } catch (error) {
      payload.complete = false;
      trace("export", normalizedPrefix, { origin: "export", ok: false, error });
    }

    return payload;
  }

  function importData(payload) {
    if (!isPlainRecord(payload) || !isPlainRecord(payload.items) || payload.complete === false) {
      trace("import", payload?.prefix ?? "", {
        origin: "import",
        ok: false,
        error: new TypeError("Import payload is invalid or incomplete.")
      });
      return false;
    }

    let prefix;
    let entries;

    try {
      prefix = normalizePrefix(payload.prefix);
      entries = Object.entries(payload.items).map(([key, value]) => {
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey.startsWith(prefix)) {
          throw new RangeError(`Import key escapes authorised prefix: ${normalizedKey}`);
        }
        return [normalizedKey, String(value ?? "")];
      });
    } catch (error) {
      trace("import", payload.prefix ?? "", { origin: "import", ok: false, error });
      return false;
    }

    const snapshots = [];

    try {
      for (const [key] of entries) {
        const previousValue = backend.getItem(key);
        snapshots.push({
          key,
          existed: previousValue !== null,
          value: previousValue
        });
      }
    } catch (error) {
      trace("import-preflight", prefix, { origin: "import", ok: false, error });
      return false;
    }

    const applied = [];
    let totalKb = 0;
    let totalRequiredKb = 0;

    try {
      for (const [key, value] of entries) {
        backend.setItem(key, value);
        applied.push(key);
        const kb = Math.round(value.length / 1024);
        const requiredKb = requiredKilobytes(value, 100);
        totalKb += kb;
        totalRequiredKb += requiredKb;
        trace("import-set", key, { origin: "import", kb, requiredKb });
      }
    } catch (error) {
      trace("import-set", applied.length < entries.length ? entries[applied.length][0] : prefix, {
        origin: "import",
        ok: false,
        error
      });

      let rollbackComplete = true;

      for (const key of [...applied].reverse()) {
        const snapshot = snapshots.find((entry) => entry.key === key);
        try {
          if (snapshot.existed) {
            backend.setItem(key, snapshot.value);
          } else {
            backend.removeItem(key);
          }
          trace("import-rollback", key, { origin: "import-rollback" });
        } catch (rollbackError) {
          rollbackComplete = false;
          trace("import-rollback", key, {
            origin: "import-rollback",
            ok: false,
            error: rollbackError
          });
        }
      }

      trace("import", prefix, {
        origin: "import",
        ok: false,
        error: rollbackComplete
          ? error
          : new Error(`Import failed and rollback was incomplete: ${error.message || error}`)
      });
      return false;
    }

    trace("import", prefix, {
      origin: "import",
      kb: totalKb,
      requiredKb: totalRequiredKb
    });
    return true;
  }

  function recentAccesses() {
    return accessLog.map((entry) => ({
      ...entry,
      error: entry.error ? { ...entry.error } : null
    }));
  }

  return Object.freeze({
    get,
    set,
    remove,
    exists,
    keys,
    estimate,
    exportData,
    importData,
    recentAccesses
  });
}
