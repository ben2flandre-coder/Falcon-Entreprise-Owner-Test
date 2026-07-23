export const PORTABLE_PACKAGE_SCHEMA = "falcon.portable-package.v1";
export const PORTABLE_PACKAGE_VERSION = "1.0.0";
export const PORTABLE_IMPORT_MODES = Object.freeze(["merge", "replace", "copy"]);

export class PortablePackageError extends Error {
  constructor(message, code = "PORTABLE_PACKAGE_ERROR") {
    super(message);
    this.name = "PortablePackageError";
    this.code = code;
  }
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength;
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function sanitizeState(input) {
  const state = clone(input || {});
  if (state?.aiConfigV422) state.aiConfigV422.apiKey = "";
  if (state?.enterprise?.connectors) {
    for (const connector of Object.values(state.enterprise.connectors)) {
      if (connector && typeof connector === "object") {
        delete connector.accessToken;
        delete connector.refreshToken;
        delete connector.secret;
      }
    }
  }
  return state;
}

function sanitizeSettings(input) {
  const entries = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!String(key).startsWith("falcon")) continue;
    if (/api.?key|access.?token|refresh.?token|secret/i.test(String(key))) continue;
    if (String(key) === "falcon_ai_config_v422") {
      try {
        const config = JSON.parse(String(value));
        config.apiKey = "";
        entries[key] = JSON.stringify(config);
      } catch {
        entries[key] = "{}";
      }
    } else {
      entries[key] = String(value);
    }
  }
  return entries;
}

function packageIdentity(state) {
  return String(
    state?.enterpriseFoundation?.activeMissionId
    || state?.mission?.code
    || state?.client?.code
    || state?.client?.name
    || "mission-locale"
  );
}

export async function buildPortablePackage({
  state,
  settings = {},
  media = [],
  reports = [],
  appVersion = "unknown",
  sourceDevice = "appareil-local",
  createdAt = new Date().toISOString()
} = {}) {
  const safeState = sanitizeState(state);
  const safeSettings = sanitizeSettings(settings);
  const logicalFiles = [
    { path: "Dossier/state.json", mediaType: "application/json", content: stableStringify(safeState) },
    { path: "Parametres/settings.json", mediaType: "application/json", content: stableStringify(safeSettings) },
    { path: "Medias/index.json", mediaType: "application/json", content: stableStringify(media || []) },
    { path: "Rapports/index.json", mediaType: "application/json", content: stableStringify(reports || []) }
  ];
  const files = [];
  for (const file of logicalFiles) {
    files.push(Object.freeze({
      ...file,
      size: byteLength(file.content),
      sha256: await sha256Hex(file.content)
    }));
  }
  const manifestCore = {
    schema: PORTABLE_PACKAGE_SCHEMA,
    version: PORTABLE_PACKAGE_VERSION,
    appVersion: String(appVersion),
    createdAt: String(createdAt),
    sourceDevice: String(sourceDevice),
    packageId: packageIdentity(safeState),
    counts: Object.freeze({
      observations: Array.isArray(safeState?.observations) ? safeState.observations.length : 0,
      media: Array.isArray(media) ? media.length : 0,
      reports: Array.isArray(reports) ? reports.length : 0,
      settings: Object.keys(safeSettings).length
    }),
    files: Object.freeze(files.map(({ content: _content, ...metadata }) => Object.freeze(metadata)))
  };
  const rootDigest = await sha256Hex(stableStringify(manifestCore));
  return Object.freeze({
    ...manifestCore,
    integrity: Object.freeze({ algorithm: "SHA-256", digest: rootDigest }),
    files: Object.freeze(files)
  });
}

export async function verifyPortablePackage(portablePackage) {
  const issues = [];
  if (portablePackage?.schema !== PORTABLE_PACKAGE_SCHEMA) issues.push("Schéma de paquet non pris en charge.");
  if (portablePackage?.version !== PORTABLE_PACKAGE_VERSION) issues.push("Version de paquet non prise en charge.");
  if (!Array.isArray(portablePackage?.files) || portablePackage.files.length === 0) issues.push("Liste des fichiers absente.");
  const fileResults = [];
  for (const file of portablePackage?.files || []) {
    const digest = await sha256Hex(String(file.content ?? ""));
    const valid = digest === file.sha256 && byteLength(file.content ?? "") === file.size;
    if (!valid) issues.push(`Intégrité invalide : ${file.path || "fichier sans nom"}.`);
    fileResults.push(Object.freeze({ path: file.path, valid, expected: file.sha256, actual: digest }));
  }
  if (portablePackage?.integrity?.algorithm !== "SHA-256") issues.push("Algorithme d’intégrité absent.");
  const manifestCore = {
    schema: portablePackage?.schema,
    version: portablePackage?.version,
    appVersion: portablePackage?.appVersion,
    createdAt: portablePackage?.createdAt,
    sourceDevice: portablePackage?.sourceDevice,
    packageId: portablePackage?.packageId,
    counts: portablePackage?.counts,
    files: (portablePackage?.files || []).map(({ content: _content, ...metadata }) => metadata)
  };
  const rootDigest = await sha256Hex(stableStringify(manifestCore));
  if (portablePackage?.integrity?.digest !== rootDigest) issues.push("Empreinte racine invalide.");
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    rootDigest,
    files: Object.freeze(fileResults)
  });
}

function stateFile(portablePackage) {
  const file = portablePackage.files.find((entry) => entry.path === "Dossier/state.json");
  try { return JSON.parse(file?.content || "{}"); }
  catch { throw new PortablePackageError("Le dossier du paquet est illisible.", "INVALID_STATE"); }
}

function entityKey(entity, index) {
  return String(entity?.id || entity?.code || entity?.uuid || `index-${index}`);
}

function entityDigest(entity) {
  return stableStringify(entity);
}

function compareCollections(incoming = [], current = []) {
  const currentMap = new Map(current.map((entry, index) => [entityKey(entry, index), entry]));
  const duplicates = [];
  const conflicts = [];
  const additions = [];
  incoming.forEach((entry, index) => {
    const key = entityKey(entry, index);
    const existing = currentMap.get(key);
    if (!existing) additions.push(key);
    else if (entityDigest(existing) === entityDigest(entry)) duplicates.push(key);
    else conflicts.push(key);
  });
  return { additions, duplicates, conflicts };
}

export async function previewPortableImport(portablePackage, currentState = {}) {
  const verification = await verifyPortablePackage(portablePackage);
  if (!verification.valid) {
    throw new PortablePackageError(verification.issues.join(" "), "INTEGRITY_FAILED");
  }
  const incoming = stateFile(portablePackage);
  const domains = ["observations", "analyses", "decisions", "actions", "sources", "reportArchive"];
  const detail = {};
  for (const domain of domains) {
    detail[domain] = compareCollections(
      Array.isArray(incoming?.[domain]) ? incoming[domain] : [],
      Array.isArray(currentState?.[domain]) ? currentState[domain] : []
    );
  }
  const totals = Object.values(detail).reduce((summary, item) => ({
    additions: summary.additions + item.additions.length,
    duplicates: summary.duplicates + item.duplicates.length,
    conflicts: summary.conflicts + item.conflicts.length
  }), { additions: 0, duplicates: 0, conflicts: 0 });
  return Object.freeze({
    schema: "falcon.portable-import-preview.v1",
    packageId: portablePackage.packageId,
    sourceDevice: portablePackage.sourceDevice,
    createdAt: portablePackage.createdAt,
    verification,
    totals: Object.freeze(totals),
    detail: Object.freeze(detail),
    incomingState: incoming
  });
}

export function planPortableImport(preview, mode) {
  if (!PORTABLE_IMPORT_MODES.includes(mode)) throw new PortablePackageError("Stratégie d’import invalide.", "INVALID_IMPORT_MODE");
  if (!preview?.verification?.valid) throw new PortablePackageError("Aperçu vérifié obligatoire.", "PREVIEW_REQUIRED");
  const safeguards = [
    "Créer un point de reprise avant toute écriture.",
    "Conserver le paquet source et son empreinte dans l’historique.",
    "Ne jamais écraser une version concurrente sans stratégie explicite."
  ];
  if (mode === "merge" && preview.totals.conflicts > 0) safeguards.push("Dupliquer les versions en conflit pour arbitrage.");
  return Object.freeze({
    schema: "falcon.portable-import-plan.v1",
    mode,
    packageId: preview.packageId,
    additions: preview.totals.additions,
    duplicates: preview.totals.duplicates,
    conflicts: preview.totals.conflicts,
    requiresBackup: true,
    requiresExplicitConfirmation: true,
    safeguards: Object.freeze(safeguards)
  });
}

function mergeCollection(current = [], incoming = [], copySuffix = "") {
  const result = clone(current);
  const index = new Map(result.map((entry, position) => [entityKey(entry, position), position]));
  incoming.forEach((entry, position) => {
    const key = entityKey(entry, position);
    if (!index.has(key)) {
      result.push(clone(entry));
      return;
    }
    const existing = result[index.get(key)];
    if (entityDigest(existing) === entityDigest(entry)) return;
    const conflictCopy = clone(entry);
    conflictCopy.id = `${key}${copySuffix || `-conflit-${Date.now()}`}`;
    conflictCopy.falconConflict = { originalId: key, resolution: "copie conservée", importedAt: new Date().toISOString() };
    result.push(conflictCopy);
  });
  return result;
}

export function applyPortableImport({ preview, plan, currentState = {} } = {}) {
  if (!plan?.requiresExplicitConfirmation) throw new PortablePackageError("Plan d’import explicite obligatoire.", "PLAN_REQUIRED");
  const incoming = clone(preview.incomingState);
  if (plan.mode === "replace") {
    return Object.freeze({ state: incoming, audit: Object.freeze({ mode: "replace", backupRequired: true, packageId: plan.packageId }) });
  }
  if (plan.mode === "copy") {
    const suffix = `-copie-${Date.now()}`;
    incoming.enterpriseFoundation = { ...(incoming.enterpriseFoundation || {}), activeMissionId: `${preview.packageId}${suffix}` };
    return Object.freeze({ state: incoming, audit: Object.freeze({ mode: "copy", backupRequired: true, packageId: plan.packageId }) });
  }
  const merged = { ...clone(currentState), ...incoming };
  for (const domain of ["observations", "analyses", "decisions", "actions", "sources", "reportArchive"]) {
    merged[domain] = mergeCollection(currentState?.[domain], incoming?.[domain]);
  }
  merged.logs = [
    ...(Array.isArray(currentState?.logs) ? currentState.logs : []),
    { date: new Date().toISOString(), action: "PORTABLE_PACKAGE_IMPORT", packageId: plan.packageId, mode: plan.mode, conflicts: plan.conflicts }
  ];
  return Object.freeze({ state: merged, audit: Object.freeze({ mode: "merge", backupRequired: true, packageId: plan.packageId, conflictsPreserved: plan.conflicts }) });
}
