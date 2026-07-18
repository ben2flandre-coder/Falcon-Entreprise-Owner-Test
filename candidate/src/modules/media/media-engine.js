export const MEDIA_ENGINE_VERSION = "V48.0.0-dev";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const MEDIA_KINDS = Object.freeze(["image", "video", "audio", "document", "other"]);
const MEDIA_STATUSES = Object.freeze(["active", "archived"]);

export class MediaEngineError extends Error {
  constructor(message, code = "MEDIA_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class MediaValidationError extends MediaEngineError {
  constructor(message) { super(message, "MEDIA_VALIDATION_ERROR"); }
}

export class MediaConflictError extends MediaEngineError {
  constructor(message) { super(message, "MEDIA_CONFLICT_ERROR"); }
}

function normalizeId(value, label, { nullable = false } = {}) {
  if (nullable && (value == null || value === "")) return null;
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new MediaValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeText(value, label, { required = false, max = 500 } = {}) {
  const normalized = value == null ? "" : String(value).trim();
  if (required && !normalized) throw new MediaValidationError(`${label} is required.`);
  if (normalized.length > max) throw new MediaValidationError(`${label} exceeds ${max} characters.`);
  return normalized;
}

function normalizeEnum(value, allowed, label, fallback) {
  const normalized = String(value ?? fallback).trim();
  if (!allowed.includes(normalized)) throw new MediaValidationError(`${label} is invalid.`);
  return normalized;
}

function inferKind(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("document") || mimeType.includes("sheet") || mimeType.includes("presentation")) return "document";
  return "other";
}

function freezeMedia(media) {
  return Object.freeze({ ...media, metadata: Object.freeze({ ...media.metadata }) });
}

export function createMediaEngine({ initialMedia = [], now = () => new Date().toISOString(), idGenerator = null, onChange = () => {} } = {}) {
  if (!Array.isArray(initialMedia)) throw new MediaValidationError("Initial media must be an array.");
  if (typeof now !== "function") throw new TypeError("Media clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Media id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Media change hook must be a function.");

  const media = new Map();
  let sequence = 0;
  const timestamp = () => { try { return String(now()); } catch { return new Date().toISOString(); } };
  const nextId = () => idGenerator ? normalizeId(idGenerator(), "Media id") : `media-${++sequence}`;

  function requireMedia(id) {
    const normalized = normalizeId(id, "Media id");
    const item = media.get(normalized);
    if (!item) throw new MediaValidationError(`Media not found: ${normalized}`);
    return item;
  }

  function registerMedia(input = {}, options = {}) {
    const id = input.id ? normalizeId(input.id, "Media id") : nextId();
    if (media.has(id)) throw new MediaConflictError(`Media already exists: ${id}`);
    const mimeType = normalizeText(input.mimeType, "MIME type", { required: true, max: 120 }).toLowerCase();
    const sizeBytes = Number(input.sizeBytes);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0) throw new MediaValidationError("Media size must be a non-negative integer.");
    const at = timestamp();
    const item = {
      id,
      observationId: normalizeId(input.observationId, "Observation id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: normalizeId(input.sessionId, "Session id", { nullable: true }),
      folderId: normalizeId(input.folderId, "Folder id", { nullable: true }),
      storageKey: normalizeText(input.storageKey, "Storage key", { required: true, max: 500 }),
      fileName: normalizeText(input.fileName, "File name", { required: true, max: 255 }),
      mimeType,
      kind: normalizeEnum(input.kind, MEDIA_KINDS, "Media kind", inferKind(mimeType)),
      sizeBytes,
      checksum: normalizeText(input.checksum, "Checksum", { max: 160 }),
      caption: normalizeText(input.caption, "Caption", { max: 1000 }),
      status: "active",
      metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? { ...input.metadata } : {},
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      revision: 1
    };
    media.set(id, item);
    onChange(Object.freeze({ action: "media.registered", media: freezeMedia(item), origin: options.origin || "runtime" }));
    return freezeMedia(item);
  }

  function updateMedia(id, patch = {}, options = {}) {
    const item = requireMedia(id);
    if (item.status === "archived") throw new MediaConflictError("Archived media cannot be edited.");
    if (options.expectedRevision != null && item.revision !== options.expectedRevision) throw new MediaConflictError(`Media revision conflict for ${item.id}.`);
    if (Object.hasOwn(patch, "caption")) item.caption = normalizeText(patch.caption, "Caption", { max: 1000 });
    if (Object.hasOwn(patch, "fileName")) item.fileName = normalizeText(patch.fileName, "File name", { required: true, max: 255 });
    if (Object.hasOwn(patch, "metadata")) {
      if (!patch.metadata || typeof patch.metadata !== "object" || Array.isArray(patch.metadata)) throw new MediaValidationError("Media metadata must be an object.");
      item.metadata = { ...patch.metadata };
    }
    item.updatedAt = timestamp();
    item.revision += 1;
    onChange(Object.freeze({ action: "media.updated", media: freezeMedia(item), origin: options.origin || "runtime" }));
    return freezeMedia(item);
  }

  function archiveMedia(id, options = {}) {
    const item = requireMedia(id);
    if (item.status === "archived") return freezeMedia(item);
    if (options.expectedRevision != null && item.revision !== options.expectedRevision) throw new MediaConflictError(`Media revision conflict for ${item.id}.`);
    const at = timestamp();
    item.status = "archived";
    item.archivedAt = at;
    item.updatedAt = at;
    item.revision += 1;
    onChange(Object.freeze({ action: "media.archived", media: freezeMedia(item), origin: options.origin || "runtime" }));
    return freezeMedia(item);
  }

  function getMedia(id) { return freezeMedia(requireMedia(id)); }

  function listMedia({ observationId = null, missionId = null, sessionId = undefined, folderId = undefined, status = null, kind = null } = {}) {
    const observation = observationId == null ? null : normalizeId(observationId, "Observation id");
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    const session = sessionId === undefined ? undefined : normalizeId(sessionId, "Session id", { nullable: true });
    const folder = folderId === undefined ? undefined : normalizeId(folderId, "Folder id", { nullable: true });
    const normalizedStatus = status == null ? null : normalizeEnum(status, MEDIA_STATUSES, "Media status", status);
    const normalizedKind = kind == null ? null : normalizeEnum(kind, MEDIA_KINDS, "Media kind", kind);
    return Object.freeze([...media.values()]
      .filter((item) => observation == null || item.observationId === observation)
      .filter((item) => mission == null || item.missionId === mission)
      .filter((item) => session === undefined || item.sessionId === session)
      .filter((item) => folder === undefined || item.folderId === folder)
      .filter((item) => normalizedStatus == null || item.status === normalizedStatus)
      .filter((item) => normalizedKind == null || item.kind === normalizedKind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .map(freezeMedia));
  }

  function snapshot() {
    return Object.freeze({
      schema: "falcon.media.registry.v1",
      mediaCount: media.size,
      media: Object.freeze([...media.values()].map(freezeMedia))
    });
  }

  for (const input of initialMedia) {
    const item = {
      ...input,
      id: normalizeId(input.id, "Media id"),
      observationId: normalizeId(input.observationId, "Observation id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: normalizeId(input.sessionId, "Session id", { nullable: true }),
      folderId: normalizeId(input.folderId, "Folder id", { nullable: true }),
      storageKey: normalizeText(input.storageKey, "Storage key", { required: true, max: 500 }),
      fileName: normalizeText(input.fileName, "File name", { required: true, max: 255 }),
      mimeType: normalizeText(input.mimeType, "MIME type", { required: true, max: 120 }).toLowerCase(),
      kind: normalizeEnum(input.kind, MEDIA_KINDS, "Media kind", inferKind(String(input.mimeType || ""))),
      sizeBytes: Number(input.sizeBytes),
      status: normalizeEnum(input.status, MEDIA_STATUSES, "Media status", "active"),
      metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? { ...input.metadata } : {},
      revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1
    };
    if (!Number.isInteger(item.sizeBytes) || item.sizeBytes < 0) throw new MediaValidationError("Media size must be a non-negative integer.");
    if (media.has(item.id)) throw new MediaConflictError(`Duplicate initial media: ${item.id}`);
    media.set(item.id, item);
  }

  return Object.freeze({ registerMedia, updateMedia, archiveMedia, getMedia, listMedia, snapshot });
}
