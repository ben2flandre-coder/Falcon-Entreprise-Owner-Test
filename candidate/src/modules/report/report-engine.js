export const REPORT_ENGINE_VERSION = "V48.0.0-dev";
export const REPORT_DEFINITION_VERSION = "ReportV2@1.0";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const STATUSES = Object.freeze(["draft", "issued", "archived"]);

export class ReportEngineError extends Error {
  constructor(message, code = "REPORT_ENGINE_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ReportValidationError extends ReportEngineError {
  constructor(message) { super(message, "REPORT_VALIDATION_ERROR"); }
}

export class ReportConflictError extends ReportEngineError {
  constructor(message) { super(message, "REPORT_CONFLICT_ERROR"); }
}

function normalizeId(value, label) {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw new ReportValidationError(`${label} is invalid.`);
  return normalized;
}

function normalizeText(value, label, max = 5000) {
  const normalized = value == null ? "" : String(value).trim();
  if (normalized.length > max) throw new ReportValidationError(`${label} exceeds ${max} characters.`);
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
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeInputs({ mission, radar, trust }) {
  if (!mission || typeof mission !== "object") throw new ReportValidationError("Mission input is required.");
  if (!radar || typeof radar !== "object") throw new ReportValidationError("Radar input is required.");
  if (!trust || typeof trust !== "object") throw new ReportValidationError("Trust input is required.");
  const missionId = normalizeId(mission.id, "Mission id");
  if (normalizeId(radar.missionId, "Radar mission id") !== missionId) throw new ReportValidationError("Radar mission does not match report mission.");
  if (normalizeId(trust.missionId, "Trust mission id") !== missionId) throw new ReportValidationError("Trust mission does not match report mission.");
  if (normalizeId(trust.radarId, "Trust radar id") !== normalizeId(radar.id, "Radar id")) throw new ReportValidationError("Trust assessment does not reference the selected Radar assessment.");
  if (radar.status === "archived") throw new ReportValidationError("Archived Radar assessments cannot generate active reports.");
  if (trust.status === "archived") throw new ReportValidationError("Archived Trust assessments cannot generate active reports.");
  return { mission: clone(mission), radar: clone(radar), trust: clone(trust) };
}

function buildSections(inputs) {
  const { mission, radar, trust } = inputs;
  const dimensions = Array.isArray(radar.result?.dimensions) ? radar.result.dimensions : [];
  const reservations = Array.isArray(radar.result?.reservations) ? radar.result.reservations : [];
  const trustReservations = Array.isArray(trust.result?.reservations) ? trust.result.reservations : [];
  const trustSignals = Array.isArray(trust.result?.signals) ? trust.result.signals : [];
  const priorities = Array.isArray(trust.result?.investigationPriorities) ? trust.result.investigationPriorities : [];

  return deepFreeze([
    {
      id: "executive-summary",
      title: "Synthèse décisionnelle",
      type: "summary",
      content: {
        missionName: normalizeText(mission.name, "Mission name", 300),
        radarScore: radar.result?.score ?? null,
        radarLevel: radar.result?.level || "unknown",
        radarInterpretation: radar.result?.interpretationStatus || "not-evaluable",
        trustIndex: trust.result?.trustIndex ?? 0,
        trustLevel: trust.result?.trustLevel || "low",
        trustInterpretation: trust.result?.interpretationStatus || "not-evaluable"
      }
    },
    {
      id: "radar-analysis",
      title: "Lecture Radar 360",
      type: "analysis",
      content: {
        coverage: radar.result?.coverage ?? 0,
        confidence: radar.result?.confidence ?? 0,
        agreement: radar.result?.agreement ?? 0,
        assessedDimensionCount: radar.result?.assessedDimensionCount ?? 0,
        dimensionCount: radar.result?.dimensionCount ?? dimensions.length,
        dimensions: dimensions.map((item) => ({
          dimensionId: item.dimensionId,
          label: item.label,
          score: item.score,
          level: item.level,
          coverage: item.coverage,
          confidence: item.confidence,
          agreement: item.agreement,
          interpretationStatus: item.interpretationStatus
        }))
      }
    },
    {
      id: "trust-analysis",
      title: "Solidité de l’interprétation",
      type: "trust",
      content: {
        trustIndex: trust.result?.trustIndex ?? 0,
        trustLevel: trust.result?.trustLevel || "low",
        interpretationStatus: trust.result?.interpretationStatus || "not-evaluable",
        axes: clone(trust.result?.axes || {}),
        signals: clone(trustSignals)
      }
    },
    {
      id: "reservations",
      title: "Réserves et limites",
      type: "reservations",
      content: {
        radar: clone(reservations),
        trust: clone(trustReservations)
      }
    },
    {
      id: "investigation-priorities",
      title: "Priorités d’investigation",
      type: "priorities",
      content: { priorities: clone(priorities) }
    },
    {
      id: "traceability",
      title: "Traçabilité du calcul",
      type: "traceability",
      content: {
        radarId: radar.id,
        radarRevision: radar.revision,
        radarCalculationKey: radar.calculationKey,
        trustId: trust.id,
        trustRevision: trust.revision,
        reportDefinitionVersion: REPORT_DEFINITION_VERSION
      }
    }
  ]);
}

function freezeReport(value) { return deepFreeze(clone(value)); }

export function createReportEngine({ initialReports = [], now = () => new Date().toISOString(), idGenerator = null, onChange = () => {} } = {}) {
  if (!Array.isArray(initialReports)) throw new ReportValidationError("Initial reports must be an array.");
  if (typeof now !== "function") throw new TypeError("Report clock must be a function.");
  if (idGenerator != null && typeof idGenerator !== "function") throw new TypeError("Report id generator must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Report change hook must be a function.");

  const reports = new Map();
  let sequence = 0;
  const timestamp = () => String(now());
  const nextId = () => idGenerator ? normalizeId(idGenerator(), "Report id") : `report-${++sequence}`;

  function requireReport(id) {
    const normalized = normalizeId(id, "Report id");
    const item = reports.get(normalized);
    if (!item) throw new ReportValidationError(`Report not found: ${normalized}`);
    return item;
  }

  function emit(action, report, origin) {
    onChange(deepFreeze({ action, report: freezeReport(report), origin: origin || "runtime" }));
  }

  function generate(inputs, options = {}) {
    const normalized = normalizeInputs(inputs);
    const id = options.id ? normalizeId(options.id, "Report id") : nextId();
    if (reports.has(id)) throw new ReportConflictError(`Report already exists: ${id}`);
    const sections = buildSections(normalized);
    const sourceFingerprint = fingerprint({ mission: normalized.mission.id, radar: normalized.radar, trust: normalized.trust });
    const at = timestamp();
    const item = {
      id,
      missionId: normalized.mission.id,
      sessionId: normalized.radar.sessionId ?? null,
      radarId: normalized.radar.id,
      trustId: normalized.trust.id,
      definitionVersion: REPORT_DEFINITION_VERSION,
      title: normalizeText(options.title, "Report title", 300) || `Rapport Falcon — ${normalized.mission.name || normalized.mission.id}`,
      executiveNote: normalizeText(options.executiveNote, "Executive note"),
      sections,
      sourceFingerprint,
      status: "draft",
      createdAt: at,
      updatedAt: at,
      issuedAt: null,
      archivedAt: null,
      revision: 1
    };
    reports.set(id, item);
    emit("report.generated", item, options.origin);
    return freezeReport(item);
  }

  function regenerate(id, inputs, options = {}) {
    const item = requireReport(id);
    if (item.status !== "draft") throw new ReportConflictError("Only draft reports can be regenerated.");
    if (options.expectedRevision != null && options.expectedRevision !== item.revision) throw new ReportConflictError(`Report revision conflict for ${item.id}.`);
    const normalized = normalizeInputs(inputs);
    if (normalized.mission.id !== item.missionId || normalized.radar.id !== item.radarId || normalized.trust.id !== item.trustId) {
      throw new ReportValidationError("A report cannot be reassigned to different source objects.");
    }
    const sections = buildSections(normalized);
    const sourceFingerprint = fingerprint({ mission: normalized.mission.id, radar: normalized.radar, trust: normalized.trust });
    const executiveNote = Object.hasOwn(options, "executiveNote") ? normalizeText(options.executiveNote, "Executive note") : item.executiveNote;
    if (sourceFingerprint === item.sourceFingerprint && executiveNote === item.executiveNote) {
      emit("report.regeneration.skipped", item, options.origin);
      return freezeReport(item);
    }
    item.sections = sections;
    item.sourceFingerprint = sourceFingerprint;
    item.executiveNote = executiveNote;
    item.updatedAt = timestamp();
    item.revision += 1;
    emit("report.regenerated", item, options.origin);
    return freezeReport(item);
  }

  function issue(id, options = {}) {
    const item = requireReport(id);
    if (item.status !== "draft") throw new ReportConflictError("Only draft reports can be issued.");
    if (options.expectedRevision != null && options.expectedRevision !== item.revision) throw new ReportConflictError(`Report revision conflict for ${item.id}.`);
    const at = timestamp();
    item.status = "issued";
    item.issuedAt = at;
    item.updatedAt = at;
    item.revision += 1;
    emit("report.issued", item, options.origin);
    return freezeReport(item);
  }

  function archive(id, options = {}) {
    const item = requireReport(id);
    if (item.status === "archived") return freezeReport(item);
    if (options.expectedRevision != null && options.expectedRevision !== item.revision) throw new ReportConflictError(`Report revision conflict for ${item.id}.`);
    const at = timestamp();
    item.status = "archived";
    item.archivedAt = at;
    item.updatedAt = at;
    item.revision += 1;
    emit("report.archived", item, options.origin);
    return freezeReport(item);
  }

  function getReport(id) { return freezeReport(requireReport(id)); }

  function listReports({ missionId = null, status = null } = {}) {
    const mission = missionId == null ? null : normalizeId(missionId, "Mission id");
    if (status != null && !STATUSES.includes(status)) throw new ReportValidationError("Report status is invalid.");
    return deepFreeze([...reports.values()]
      .filter((item) => mission == null || item.missionId === mission)
      .filter((item) => status == null || item.status === status)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone));
  }

  function snapshot() {
    return deepFreeze({
      schema: "falcon.report.registry.v1",
      definitionVersion: REPORT_DEFINITION_VERSION,
      reportCount: reports.size,
      reports: [...reports.values()].sort((left, right) => left.id.localeCompare(right.id)).map(clone)
    });
  }

  for (const input of initialReports) {
    const item = {
      ...clone(input),
      id: normalizeId(input.id, "Report id"),
      missionId: normalizeId(input.missionId, "Mission id"),
      sessionId: input.sessionId == null ? null : normalizeId(input.sessionId, "Session id"),
      radarId: normalizeId(input.radarId, "Radar id"),
      trustId: normalizeId(input.trustId, "Trust id"),
      status: STATUSES.includes(input.status) ? input.status : "draft",
      revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1
    };
    if (!Array.isArray(item.sections) || !item.sourceFingerprint) throw new ReportValidationError("Stored report is invalid.");
    if (reports.has(item.id)) throw new ReportConflictError(`Duplicate initial report: ${item.id}`);
    reports.set(item.id, item);
  }

  return Object.freeze({ generate, regenerate, issue, archive, getReport, listReports, snapshot });
}
