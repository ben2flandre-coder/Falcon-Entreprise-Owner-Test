export const FOLDER_ENGINE_VERSION = "V48.0.0-dev";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export class FolderEngineError extends Error {
  constructor(message, code = "FOLDER_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class FolderValidationError extends FolderEngineError {
  constructor(message) { super(message, "FOLDER_VALIDATION_ERROR"); }
}

export class FolderConflictError extends FolderEngineError {
  constructor(message) { super(message, "FOLDER_CONFLICT_ERROR"); }
}

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new FolderValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new FolderValidationError("Folder name is required.");
  if (normalized.length > 160) throw new FolderValidationError("Folder name exceeds 160 characters.");
  return normalized;
}

function cloneFolder(folder) {
  return folder ? { ...folder } : null;
}

function freezeFolder(folder) {
  return Object.freeze(cloneFolder(folder));
}

export function createFolderEngine({
  initialFolders = [],
  now = () => new Date().toISOString(),
  idGenerator = null,
  onChange = () => {}
} = {}) {
  if (!Array.isArray(initialFolders)) throw new FolderValidationError("Initial folders must be an array.");
  if (typeof now !== "function") throw new TypeError("Folder clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Folder id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Folder change hook must be a function.");

  const folders = new Map();
  let sequence = 0;

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function nextId() {
    return idGenerator ? normalizeId(idGenerator(), "Folder id") : `folder-${++sequence}`;
  }

  function requireFolder(id) {
    const normalized = normalizeId(id, "Folder id");
    const folder = folders.get(normalized);
    if (!folder) throw new FolderValidationError(`Folder not found: ${normalized}`);
    return folder;
  }

  function ensureParent(parentId, missionId, sessionId) {
    if (!parentId) return null;
    const parent = requireFolder(parentId);
    if (parent.missionId !== missionId) throw new FolderValidationError("Parent folder belongs to another mission.");
    if ((parent.sessionId || null) !== (sessionId || null)) {
      throw new FolderValidationError("Parent folder belongs to another session scope.");
    }
    return parent;
  }

  function assertNoSiblingDuplicate({ missionId, sessionId, parentId, name, excludeId = null }) {
    const key = name.toLocaleLowerCase("fr");
    for (const folder of folders.values()) {
      if (folder.id === excludeId) continue;
      if (folder.missionId !== missionId) continue;
      if ((folder.sessionId || null) !== (sessionId || null)) continue;
      if ((folder.parentId || null) !== (parentId || null)) continue;
      if (folder.name.toLocaleLowerCase("fr") === key) {
        throw new FolderConflictError(`A folder named "${name}" already exists at this level.`);
      }
    }
  }

  function createFolder(input = {}, options = {}) {
    const missionId = normalizeId(input.missionId, "Mission id");
    const sessionId = input.sessionId ? normalizeId(input.sessionId, "Session id") : null;
    const parentId = input.parentId ? normalizeId(input.parentId, "Parent folder id") : null;
    const name = normalizeName(input.name);
    ensureParent(parentId, missionId, sessionId);
    assertNoSiblingDuplicate({ missionId, sessionId, parentId, name });

    const id = input.id ? normalizeId(input.id, "Folder id") : nextId();
    if (folders.has(id)) throw new FolderConflictError(`Folder already exists: ${id}`);
    const at = timestamp();
    const folder = {
      id,
      missionId,
      sessionId,
      parentId,
      name,
      createdAt: at,
      updatedAt: at,
      revision: 1
    };
    folders.set(id, folder);
    onChange(Object.freeze({ action: "folder.created", folder: freezeFolder(folder), origin: options.origin || "runtime" }));
    return freezeFolder(folder);
  }

  function renameFolder(id, name, options = {}) {
    const folder = requireFolder(id);
    if (options.expectedRevision != null && folder.revision !== options.expectedRevision) {
      throw new FolderConflictError(`Folder revision conflict for ${folder.id}.`);
    }
    const normalizedName = normalizeName(name);
    assertNoSiblingDuplicate({
      missionId: folder.missionId,
      sessionId: folder.sessionId,
      parentId: folder.parentId,
      name: normalizedName,
      excludeId: folder.id
    });
    folder.name = normalizedName;
    folder.updatedAt = timestamp();
    folder.revision += 1;
    onChange(Object.freeze({ action: "folder.renamed", folder: freezeFolder(folder), origin: options.origin || "runtime" }));
    return freezeFolder(folder);
  }

  function deleteFolder(id, options = {}) {
    const folder = requireFolder(id);
    const hasChildren = [...folders.values()].some((candidate) => candidate.parentId === folder.id);
    if (hasChildren) throw new FolderConflictError("A non-empty folder cannot be deleted.");
    folders.delete(folder.id);
    onChange(Object.freeze({ action: "folder.deleted", folder: freezeFolder(folder), origin: options.origin || "runtime" }));
    return true;
  }

  function getFolder(id) {
    return freezeFolder(requireFolder(id));
  }

  function listFolders({ missionId = null, sessionId = undefined, parentId = undefined } = {}) {
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    const session = sessionId === undefined ? undefined : (sessionId ? normalizeId(sessionId, "Session id") : null);
    const parent = parentId === undefined ? undefined : (parentId ? normalizeId(parentId, "Parent folder id") : null);
    return Object.freeze([...folders.values()]
      .filter((folder) => mission == null || folder.missionId === mission)
      .filter((folder) => session === undefined || (folder.sessionId || null) === session)
      .filter((folder) => parent === undefined || (folder.parentId || null) === parent)
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))
      .map(freezeFolder));
  }

  function snapshot() {
    return Object.freeze({
      schema: "falcon.folder.registry.v1",
      folderCount: folders.size,
      folders: Object.freeze([...folders.values()].map(freezeFolder))
    });
  }

  for (const item of initialFolders) {
    const folder = {
      id: normalizeId(item.id, "Folder id"),
      missionId: normalizeId(item.missionId, "Mission id"),
      sessionId: item.sessionId ? normalizeId(item.sessionId, "Session id") : null,
      parentId: item.parentId ? normalizeId(item.parentId, "Parent folder id") : null,
      name: normalizeName(item.name),
      createdAt: String(item.createdAt || timestamp()),
      updatedAt: String(item.updatedAt || item.createdAt || timestamp()),
      revision: Number.isInteger(item.revision) && item.revision > 0 ? item.revision : 1
    };
    if (folders.has(folder.id)) throw new FolderConflictError(`Duplicate initial folder: ${folder.id}`);
    folders.set(folder.id, folder);
  }

  for (const folder of folders.values()) ensureParent(folder.parentId, folder.missionId, folder.sessionId);

  return Object.freeze({
    createFolder,
    renameFolder,
    deleteFolder,
    getFolder,
    listFolders,
    snapshot
  });
}
