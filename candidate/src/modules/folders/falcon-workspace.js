export const FALCON_WORKSPACE_VERSION = "1.0.0";

export const FALCON_CANONICAL_DIRECTORIES = Object.freeze([
  "Falcon/Clients",
  "Falcon/Missions",
  "Falcon/Rapports/PDF",
  "Falcon/Rapports/HTML",
  "Falcon/Rapports/Autres exports",
  "Falcon/Médias/Photos",
  "Falcon/Médias/Vidéos",
  "Falcon/Médias/Audio",
  "Falcon/Paramètres/Chartes",
  "Falcon/Paramètres/Logos",
  "Falcon/Paramètres/Modèles",
  "Falcon/Paramètres/IA",
  "Falcon/Paramètres/Licences",
  "Falcon/Paramètres/Préférences",
  "Falcon/Sauvegardes",
  "Falcon/Synchronisation"
]);

export class FalconWorkspaceError extends Error {
  constructor(message, code = "FALCON_WORKSPACE_ERROR") {
    super(message);
    this.name = "FalconWorkspaceError";
    this.code = code;
  }
}

function requiredText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new FalconWorkspaceError(`${label} est obligatoire.`, "INVALID_DRAFT");
  return normalized;
}

export function sanitizePathSegment(value, fallback = "Dossier") {
  const normalized = String(value || "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/[.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || fallback).slice(0, 120);
}

export function slugCode(value, fallback = "MISSION") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return normalized || fallback;
}

export function suggestFalconCode({ clientName = "", date = new Date().toISOString().slice(0, 10) } = {}) {
  const stamp = String(date).slice(0, 10).replaceAll("-", "");
  return `FAL-${stamp}-${slugCode(clientName, "MISSION")}`;
}

export function suggestFalconName({
  clientName = "",
  missionName = "",
  date = new Date().toISOString().slice(0, 10)
} = {}) {
  const client = sanitizePathSegment(clientName, "Client");
  const mission = sanitizePathSegment(missionName, "Mission");
  return `${String(date).slice(0, 10)} — ${client} — ${mission}`;
}

export function normalizeWorkspaceDraft(input = {}) {
  const date = String(input.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const clientName = sanitizePathSegment(input.clientName, "Client");
  const missionName = sanitizePathSegment(input.missionName, "Mission");
  const dossierName = sanitizePathSegment(
    input.dossierName || suggestFalconName({ clientName, missionName, date }),
    "Dossier Falcon"
  );
  const code = slugCode(input.code || suggestFalconCode({ clientName, date }));
  return Object.freeze({
    clientName,
    missionName,
    dossierName: requiredText(dossierName, "Le nom du dossier"),
    code: requiredText(code, "Le code Falcon"),
    date,
    destinationName: sanitizePathSegment(input.destinationName, "Emplacement sélectionné")
  });
}

export function workspaceDirectoryName(draft, version = 1) {
  const normalized = normalizeWorkspaceDraft(draft);
  const base = `${normalized.code} — ${normalized.dossierName}`;
  return version > 1 ? `${base} — v${version}` : base;
}

export function buildFalconWorkspacePlan(input = {}, { version = 1 } = {}) {
  const draft = normalizeWorkspaceDraft(input);
  const directoryName = workspaceDirectoryName(draft, version);
  const missionPath = `Falcon/Missions/${directoryName}`;
  const clientPath = `Falcon/Clients/${draft.clientName}`;
  const directories = [
    ...FALCON_CANONICAL_DIRECTORIES,
    clientPath,
    missionPath,
    `${missionPath}/Documents`,
    `${missionPath}/Historique`
  ];
  return Object.freeze({
    schema: "falcon.workspace.plan.v1",
    version,
    draft,
    directoryName,
    missionPath,
    manifestPath: `${missionPath}/Mission.falcon`,
    displayPath: `${draft.destinationName}/${missionPath}`,
    directories: Object.freeze([...new Set(directories)])
  });
}

async function directoryExists(parent, name) {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

async function fileExists(parent, name) {
  try {
    await parent.getFileHandle(name);
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

async function ensureDirectoryPath(root, pathValue) {
  let current = root;
  for (const segment of String(pathValue).split("/").filter(Boolean)) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

export async function resolveWorkspaceVersion(missionsHandle, draft, { maximum = 999 } = {}) {
  for (let version = 1; version <= maximum; version += 1) {
    const candidate = workspaceDirectoryName(draft, version);
    if (!(await directoryExists(missionsHandle, candidate))) {
      return Object.freeze({ version, directoryName: candidate, collisionAvoided: version > 1 });
    }
  }
  throw new FalconWorkspaceError("Aucun numéro de version disponible pour ce dossier.", "VERSION_EXHAUSTED");
}

async function writeJsonFile(directory, fileName, payload) {
  if (await fileExists(directory, fileName)) {
    throw new FalconWorkspaceError(`Le fichier ${fileName} existe déjà.`, "OVERWRITE_BLOCKED");
  }
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(payload, null, 2)}\n`);
  await writable.close();
}

export async function createFalconWorkspace({
  rootHandle,
  draft: draftInput,
  sourceManifest = {},
  now = () => new Date().toISOString()
} = {}) {
  if (!rootHandle || typeof rootHandle.getDirectoryHandle !== "function") {
    throw new FalconWorkspaceError("Sélectionnez un emplacement système accessible en écriture.", "ROOT_REQUIRED");
  }

  const draft = normalizeWorkspaceDraft({
    ...draftInput,
    destinationName: rootHandle.name || draftInput?.destinationName
  });
  const missionsHandle = await ensureDirectoryPath(rootHandle, "Falcon/Missions");
  const resolved = await resolveWorkspaceVersion(missionsHandle, draft);
  const plan = buildFalconWorkspacePlan(draft, { version: resolved.version });

  for (const directory of plan.directories) await ensureDirectoryPath(rootHandle, directory);
  const missionHandle = await ensureDirectoryPath(rootHandle, plan.missionPath);
  const createdAt = String(now());
  const manifest = {
    ...sourceManifest,
    type: "falcon_mission_manifest",
    manifestVersion: "2.0",
    workspace: {
      schema: "falcon.workspace.manifest.v1",
      standardVersion: FALCON_WORKSPACE_VERSION,
      code: draft.code,
      name: draft.dossierName,
      clientName: draft.clientName,
      missionName: draft.missionName,
      version: resolved.version,
      relativePath: plan.missionPath,
      manifestPath: plan.manifestPath,
      createdAt,
      overwriteProtection: "active",
      collisionAvoided: resolved.collisionAvoided,
      canonicalDirectories: FALCON_CANONICAL_DIRECTORIES
    }
  };
  await writeJsonFile(missionHandle, "Mission.falcon", manifest);

  const clientHandle = await ensureDirectoryPath(rootHandle, `Falcon/Clients/${draft.clientName}`);
  const referenceName = `${draft.code}${resolved.version > 1 ? `-v${resolved.version}` : ""}.falcon.json`;
  await writeJsonFile(clientHandle, referenceName, {
    schema: "falcon.client-mission-reference.v1",
    code: draft.code,
    clientName: draft.clientName,
    missionName: draft.missionName,
    version: resolved.version,
    relativePath: plan.missionPath,
    manifestPath: plan.manifestPath,
    createdAt
  });

  return Object.freeze({
    schema: "falcon.workspace.receipt.v1",
    status: "saved",
    savedAt: createdAt,
    code: draft.code,
    name: draft.dossierName,
    version: resolved.version,
    collisionAvoided: resolved.collisionAvoided,
    directoryName: resolved.directoryName,
    relativePath: plan.missionPath,
    displayPath: `${rootHandle.name || "Emplacement sélectionné"}/${plan.missionPath}`,
    manifestPath: plan.manifestPath,
    manifest
  });
}

export function validateFalconManifest(input) {
  if (!input || typeof input !== "object") {
    throw new FalconWorkspaceError("Le manifeste Falcon est illisible.", "INVALID_MANIFEST");
  }
  if (input.type !== "falcon_mission_manifest") {
    throw new FalconWorkspaceError("Le fichier sélectionné n’est pas un manifeste Mission.falcon.", "INVALID_MANIFEST");
  }
  const workspace = input.workspace || {};
  return Object.freeze({
    manifest: input,
    draft: normalizeWorkspaceDraft({
      clientName: workspace.clientName || input.client?.name,
      missionName: workspace.missionName || input.mission?.name,
      dossierName: workspace.name || input.mission?.name,
      code: workspace.code || input.mission?.id,
      date: workspace.createdAt || input.generatedAt
    }),
    version: Number.isInteger(workspace.version) && workspace.version > 0 ? workspace.version : 1,
    relativePath: String(workspace.relativePath || "")
  });
}
