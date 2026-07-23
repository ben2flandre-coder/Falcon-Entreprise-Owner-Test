import { createCockpitView } from "./cockpit-contracts.js";

const EVIDENCE_LIMIT = 20;

function latest(items = []) {
  return [...items].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")) || String(a.id).localeCompare(String(b.id)))[0] || null;
}

function listFrom(engine, method, filter) {
  if (!engine || typeof engine[method] !== "function") return [];
  const value = engine[method](filter);
  return Array.isArray(value) ? value : [];
}

function projectAlert(item) {
  return Object.freeze({
    id: item.id,
    observationId: item.observationId,
    score: item.calculation?.score ?? null,
    level: item.calculation?.level ?? null,
    confidence: item.confidence ?? null,
    sourceRevision: item.revision ?? null,
    updatedAt: item.updatedAt ?? null
  });
}

function projectMedia(item) {
  return Object.freeze({
    id: item.id,
    fileName: item.fileName,
    mimeType: item.mimeType,
    kind: item.kind,
    sizeBytes: item.sizeBytes,
    caption: item.caption || "",
    status: item.status,
    revision: item.revision,
    updatedAt: item.updatedAt || item.createdAt || null
  });
}

function projectEvidence(runtime, { missionId, sessionId }) {
  const observations = listFrom(runtime.observations, "listObservations", { missionId, sessionId })
    .filter((item) => item.status !== "archived")
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
  const media = listFrom(runtime.media, "listMedia", { missionId, sessionId, status: "active" });
  const mediaByObservation = new Map();
  for (const item of media) {
    const group = mediaByObservation.get(item.observationId) || [];
    group.push(projectMedia(item));
    mediaByObservation.set(item.observationId, group);
  }
  const visible = observations.slice(0, EVIDENCE_LIMIT);
  const items = visible.map((item) => Object.freeze({
    observation: Object.freeze({
      id: item.id,
      folderId: item.folderId,
      title: item.title,
      description: item.description,
      location: item.location,
      kind: item.kind,
      severity: item.severity,
      status: item.status,
      tags: Object.freeze([...(item.tags || [])]),
      revision: item.revision,
      updatedAt: item.updatedAt || item.createdAt || null
    }),
    media: Object.freeze([...(mediaByObservation.get(item.id) || [])])
  }));
  return Object.freeze({
    items: Object.freeze(items),
    observationCount: observations.length,
    mediaCount: media.length,
    truncated: observations.length > EVIDENCE_LIMIT
  });
}

export function createCockpitQueryService({ runtime, now = () => new Date().toISOString(), capabilities = {} } = {}) {
  if (!runtime?.missions || typeof runtime.missions.getMission !== "function") {
    throw new TypeError("Cockpit query service requires an Enterprise runtime.");
  }
  if (typeof now !== "function") throw new TypeError("Cockpit clock must be a function.");

  function getOverview({ missionId, sessionId = null } = {}) {
    const checkedAt = String(now());
    const mission = runtime.missions.getMission(missionId, { origin: "decision-cockpit" });
    const radar = latest(listFrom(runtime.radar, "listAssessments", { missionId, sessionId, status: "active" }));
    const trustItems = listFrom(runtime.trust, "listAssessments", { missionId, status: "active" })
      .filter((item) => item.sessionId === sessionId);
    const trust = radar ? latest(trustItems.filter((item) => item.radarId === radar.id)) : null;
    const reports = listFrom(runtime.reports, "listReports", { missionId })
      .filter((item) => item.sessionId === sessionId && item.status !== "archived");
    const report = trust ? latest(reports.filter((item) => item.trustId === trust.id)) : null;
    const alerts = listFrom(runtime.criticality, "listAssessments", { missionId, sessionId, status: "active" })
      .sort((a, b) => Number(b.calculation?.score || 0) - Number(a.calculation?.score || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 5)
      .map(projectAlert);
    const evidence = projectEvidence(runtime, { missionId, sessionId });

    const reasons = [];
    if (!radar) reasons.push("radar-unavailable");
    if (radar && !trust) reasons.push("trust-unavailable");
    if (trust && trust.radarRevision !== radar?.revision) reasons.push("trust-outdated");
    if (trust && !report) reasons.push("report-unavailable");

    const state = !radar && alerts.length === 0 && evidence.items.length === 0
      ? "empty"
      : (reasons.length ? "degraded" : "ready");

    return createCockpitView({
      generatedAt: checkedAt,
      state,
      scope: { missionId: mission.id, sessionId },
      mission,
      alerts,
      evidence,
      radar,
      trust,
      report,
      capabilities,
      sourceRevisions: {
        mission: mission.revision,
        radar: radar?.revision,
        trust: trust?.revision,
        report: report?.revision
      },
      freshness: { stale: reasons.length > 0, checkedAt, reasons }
    });
  }

  return Object.freeze({ getOverview });
}
