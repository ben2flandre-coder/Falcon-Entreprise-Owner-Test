export const EXPORT_ENGINE_VERSION = "V48.0.0-dev";
export const EXPORT_DEFINITION_VERSION = "Export@1.0";

const FORMATS = Object.freeze(["html", "json", "pdf", "docx", "zip"]);
const STATUSES = Object.freeze(["prepared", "completed", "failed", "archived"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export class ExportEngineError extends Error {
  constructor(message, code = "EXPORT_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
export class ExportValidationError extends ExportEngineError {
  constructor(message) { super(message, "EXPORT_VALIDATION_ERROR"); }
}
export class ExportConflictError extends ExportEngineError {
  constructor(message) { super(message, "EXPORT_CONFLICT_ERROR"); }
}

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new ExportValidationError(`${label} is invalid.`);
  return normalized;
}
function clone(value) { return value == null ? value : structuredClone(value); }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
function fingerprint(value) {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function normalizeArtifact(input = {}) {
  const format = String(input.format || "").trim().toLowerCase();
  if (!FORMATS.includes(format)) throw new ExportValidationError(`Unsupported export format: ${format || "empty"}`);
  const mimeType = String(input.mimeType || "").trim();
  const extension = String(input.extension || format).trim().toLowerCase();
  if (!mimeType) throw new ExportValidationError("Artifact mime type is required.");
  const content = input.content;
  if (!(typeof content === "string" || content instanceof Uint8Array)) throw new ExportValidationError("Artifact content must be a string or Uint8Array.");
  return deepFreeze({
    format,
    mimeType,
    extension,
    fileName: String(input.fileName || `falcon-export.${extension}`).trim(),
    content,
    sizeBytes: typeof content === "string" ? new TextEncoder().encode(content).byteLength : content.byteLength,
    checksum: fingerprint(typeof content === "string" ? content : Array.from(content))
  });
}

export function createExportEngine({ now = () => new Date().toISOString(), idGenerator = null, onChange = () => {} } = {}) {
  if (typeof now !== "function") throw new TypeError("Export clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Export id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Export change hook must be a function.");
  const jobs = new Map();
  let sequence = 0;
  const nextId = () => idGenerator ? normalizeId(idGenerator(), "Export job id") : `export-${++sequence}`;
  const emit = (action, job, origin) => onChange(deepFreeze({ action, job: deepFreeze(clone(job)), origin: origin || "runtime" }));

  function prepare({ reportId, renderedArtifact, requestedFormats = null, metadata = {} } = {}, options = {}) {
    const id = options.id ? normalizeId(options.id, "Export job id") : nextId();
    if (jobs.has(id)) throw new ExportConflictError(`Export job already exists: ${id}`);
    const report = normalizeId(reportId, "Report id");
    const artifact = normalizeArtifact(renderedArtifact);
    const formats = requestedFormats == null ? [artifact.format] : [...new Set(requestedFormats.map((item) => String(item).toLowerCase()))].sort();
    if (!formats.length || formats.some((format) => !FORMATS.includes(format))) throw new ExportValidationError("Requested export formats are invalid.");
    const at = String(now());
    const job = {
      id,
      reportId: report,
      definitionVersion: EXPORT_DEFINITION_VERSION,
      requestedFormats: formats,
      sourceArtifact: artifact,
      artifacts: [],
      manifest: {
        sourceChecksum: artifact.checksum,
        requestedFormats: formats,
        metadata: clone(metadata)
      },
      status: "prepared",
      error: null,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
      archivedAt: null,
      revision: 1
    };
    jobs.set(id, job);
    emit("export.prepared", job, options.origin);
    return deepFreeze(clone(job));
  }

  function complete(id, artifacts, options = {}) {
    const job = requireJob(id);
    if (job.status !== "prepared") throw new ExportConflictError("Only prepared export jobs can be completed.");
    if (options.expectedRevision != null && options.expectedRevision !== job.revision) throw new ExportConflictError(`Export job revision conflict for ${job.id}.`);
    if (!Array.isArray(artifacts) || !artifacts.length) throw new ExportValidationError("Completed export jobs require at least one artifact.");
    const normalized = artifacts.map(normalizeArtifact).sort((a, b) => a.format.localeCompare(b.format));
    const produced = new Set(normalized.map((item) => item.format));
    for (const format of job.requestedFormats) if (!produced.has(format)) throw new ExportValidationError(`Missing requested artifact: ${format}`);
    const at = String(now());
    job.artifacts = normalized;
    job.manifest = { ...job.manifest, artifactCount: normalized.length, artifacts: normalized.map(({ format, mimeType, extension, fileName, sizeBytes, checksum }) => ({ format, mimeType, extension, fileName, sizeBytes, checksum })) };
    job.status = "completed";
    job.completedAt = at;
    job.updatedAt = at;
    job.revision += 1;
    emit("export.completed", job, options.origin);
    return deepFreeze(clone(job));
  }

  function fail(id, error, options = {}) {
    const job = requireJob(id);
    if (job.status !== "prepared") throw new ExportConflictError("Only prepared export jobs can fail.");
    if (options.expectedRevision != null && options.expectedRevision !== job.revision) throw new ExportConflictError(`Export job revision conflict for ${job.id}.`);
    job.status = "failed";
    job.error = { code: String(error?.code || "EXPORT_FAILED"), message: String(error?.message || error || "Export failed") };
    job.updatedAt = String(now());
    job.revision += 1;
    emit("export.failed", job, options.origin);
    return deepFreeze(clone(job));
  }

  function archive(id, options = {}) {
    const job = requireJob(id);
    if (job.status === "archived") return deepFreeze(clone(job));
    if (options.expectedRevision != null && options.expectedRevision !== job.revision) throw new ExportConflictError(`Export job revision conflict for ${job.id}.`);
    job.status = "archived";
    job.archivedAt = String(now());
    job.updatedAt = job.archivedAt;
    job.revision += 1;
    emit("export.archived", job, options.origin);
    return deepFreeze(clone(job));
  }

  function requireJob(id) {
    const normalized = normalizeId(id, "Export job id");
    const job = jobs.get(normalized);
    if (!job) throw new ExportValidationError(`Export job not found: ${normalized}`);
    return job;
  }
  function getJob(id) { return deepFreeze(clone(requireJob(id))); }
  function listJobs({ reportId = null, status = null } = {}) {
    const report = reportId == null ? null : normalizeId(reportId, "Report id");
    if (status != null && !STATUSES.includes(status)) throw new ExportValidationError("Export status is invalid.");
    return deepFreeze([...jobs.values()].filter((job) => report == null || job.reportId === report).filter((job) => status == null || job.status === status).sort((a,b) => a.id.localeCompare(b.id)).map(clone));
  }
  return Object.freeze({ prepare, complete, fail, archive, getJob, listJobs, supportedFormats: FORMATS });
}
