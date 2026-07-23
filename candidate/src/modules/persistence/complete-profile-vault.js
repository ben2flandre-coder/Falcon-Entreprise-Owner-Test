export const COMPLETE_PROFILE_SCHEMA = "falcon.complete-profile.v1";
export const COMPLETE_PROFILE_VERSION = "1.0.0";

export const COMPLETE_PROFILE_CATEGORIES = Object.freeze([
  "preferences",
  "profilesAndRights",
  "license",
  "contacts",
  "branding",
  "reportModels",
  "workspace",
  "aiAndConnectors",
  "synchronization",
  "mediaAndGallery",
  "exportOptions"
]);

export class CompleteProfileError extends Error {
  constructor(message, code = "COMPLETE_PROFILE_ERROR") {
    super(message);
    this.name = "CompleteProfileError";
    this.code = code;
  }
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function profileFingerprint(value) {
  const source = typeof value === "string" ? value : stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function hasContent(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function categoryCoverage(entries) {
  const state = parseJson(entries.falcon_radar_360_v36_state, {});
  const enterprise = state.enterprise || {};
  const enterpriseAccess = state.enterpriseAccess || {};
  const mediaPreferences = parseJson(entries["falcon:media:preferences:v1"], {});
  const workspaceRegistry = parseJson(entries["falcon:workspace:registry:v1"], []);
  const commercialKeys = Object.keys(entries).filter((key) => key.startsWith("falcon:enterprise:v1:"));
  const data = {
    preferences: [state.ui, state.preferences, entries.falcon_owner_theme_v1, entries.falcon_user_mode_v438],
    profilesAndRights: [enterpriseAccess.users, enterpriseAccess.profileMatrix, enterpriseAccess.activeUserId, commercialKeys],
    license: [enterpriseAccess.license, enterprise.license, commercialKeys.filter((key) => /licen/i.test(key))],
    contacts: [state.auditor, state.organization, state.editorIdentity, state.client],
    branding: [state.clientBrand, state.client?.logoDataUrl],
    reportModels: [state.reportTemplates, state.reportTemplate, state.reportModules, state.reportValidation],
    workspace: [state.enterpriseFoundation, workspaceRegistry, entries["falcon:workspace:draft:v1"], entries.falcon_dossier_index_v43],
    aiAndConnectors: [state.aiConfigV422, entries.falcon_ai_config_v422, enterprise.connectors],
    synchronization: [enterprise.sync, state.syncRules, state.enterpriseFoundation?.syncStatus],
    mediaAndGallery: [mediaPreferences, state.media, state.photos, state.observations],
    exportOptions: [state.exportOptions, state.dataControl, state.reportValidation, mediaPreferences.export]
  };
  return Object.freeze(Object.fromEntries(COMPLETE_PROFILE_CATEGORIES.map((category) => [
    category,
    Object.freeze({
      covered: (data[category] || []).some(hasContent),
      evidenceCount: (data[category] || []).filter(hasContent).length
    })
  ])));
}

function normalizeEntries(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CompleteProfileError("Les données de profil doivent être un objet.", "INVALID_ENTRIES");
  }
  return Object.fromEntries(Object.entries(input)
    .filter(([key, value]) => String(key).startsWith("falcon") && value != null)
    .filter(([key]) => !String(key).startsWith("falcon:complete-profile:"))
    .map(([key, value]) => [String(key), String(value)]));
}

export function captureCompleteProfile({
  entries,
  now = () => new Date().toISOString(),
  appVersion = "unknown",
  deviceId = "local-device"
} = {}) {
  const normalizedEntries = normalizeEntries(entries);
  const capturedAt = String(now());
  const payload = {
    entries: normalizedEntries,
    coverage: categoryCoverage(normalizedEntries)
  };
  const profile = {
    schema: COMPLETE_PROFILE_SCHEMA,
    version: COMPLETE_PROFILE_VERSION,
    appVersion: String(appVersion),
    capturedAt,
    deviceId: String(deviceId),
    entryCount: Object.keys(normalizedEntries).length,
    payload
  };
  return Object.freeze({
    ...profile,
    integrity: Object.freeze({
      algorithm: "fnv1a32",
      digest: profileFingerprint(profile)
    })
  });
}

export function validateCompleteProfile(profile) {
  const issues = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) issues.push("Profil absent ou illisible.");
  if (profile?.schema !== COMPLETE_PROFILE_SCHEMA) issues.push("Schéma de profil non pris en charge.");
  if (profile?.version !== COMPLETE_PROFILE_VERSION) issues.push("Version de profil non prise en charge.");
  let entries = {};
  try { entries = normalizeEntries(profile?.payload?.entries || {}); }
  catch (error) { issues.push(error.message); }
  const expected = profileFingerprint({
    schema: profile?.schema,
    version: profile?.version,
    appVersion: profile?.appVersion,
    capturedAt: profile?.capturedAt,
    deviceId: profile?.deviceId,
    entryCount: profile?.entryCount,
    payload: profile?.payload
  });
  if (profile?.integrity?.algorithm !== "fnv1a32" || profile?.integrity?.digest !== expected) {
    issues.push("L’intégrité du profil complet n’est pas vérifiée.");
  }
  const coverage = profile?.payload?.coverage || {};
  for (const category of COMPLETE_PROFILE_CATEGORIES) {
    if (!coverage[category] || typeof coverage[category].covered !== "boolean") {
      issues.push(`Couverture absente : ${category}.`);
    }
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    entryCount: Object.keys(entries).length,
    coveredCategories: COMPLETE_PROFILE_CATEGORIES.filter((category) => coverage[category]?.covered)
  });
}

export function planCompleteProfileRestore(profile, currentEntries = {}, { mode = "replace" } = {}) {
  const validation = validateCompleteProfile(profile);
  if (!validation.valid) {
    throw new CompleteProfileError(validation.issues.join(" "), "INVALID_PROFILE");
  }
  if (!["replace", "missing-only"].includes(mode)) {
    throw new CompleteProfileError("Mode de restauration invalide.", "INVALID_RESTORE_MODE");
  }
  const current = normalizeEntries(currentEntries);
  const source = normalizeEntries(profile.payload.entries);
  const changes = Object.entries(source).map(([key, value]) => {
    const exists = Object.hasOwn(current, key);
    const same = exists && current[key] === value;
    const action = same ? "unchanged" : (!exists ? "restore" : (mode === "replace" ? "replace" : "preserve"));
    return Object.freeze({
      key,
      action,
      beforeDigest: exists ? profileFingerprint(current[key]) : null,
      afterDigest: profileFingerprint(value)
    });
  });
  return Object.freeze({
    schema: "falcon.complete-profile.restore-plan.v1",
    mode,
    profileDigest: profile.integrity.digest,
    changes: Object.freeze(changes),
    writeCount: changes.filter((change) => change.action === "restore" || change.action === "replace").length,
    preservedCount: changes.filter((change) => change.action === "preserve").length,
    unchangedCount: changes.filter((change) => change.action === "unchanged").length
  });
}

export function applyCompleteProfileRestore({ profile, storage, plan } = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
    throw new CompleteProfileError("Le stockage de restauration est invalide.", "INVALID_STORAGE");
  }
  const expectedPlan = plan || planCompleteProfileRestore(profile, {});
  const source = normalizeEntries(profile.payload.entries);
  const previous = new Map();
  const written = [];
  try {
    for (const change of expectedPlan.changes) {
      if (change.action !== "restore" && change.action !== "replace") continue;
      previous.set(change.key, storage.getItem(change.key));
      storage.setItem(change.key, source[change.key]);
      if (storage.getItem(change.key) !== source[change.key]) {
        throw new CompleteProfileError(`Écriture non vérifiée : ${change.key}.`, "WRITE_NOT_VERIFIED");
      }
      written.push(change.key);
    }
  } catch (error) {
    for (const key of written.reverse()) {
      const value = previous.get(key);
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    throw new CompleteProfileError(`Restauration annulée sans perte : ${error.message || error}`, "RESTORE_ROLLED_BACK");
  }
  return Object.freeze({
    status: "restored",
    profileDigest: profile.integrity.digest,
    writtenKeys: Object.freeze(written),
    verified: written.every((key) => storage.getItem(key) === source[key])
  });
}
