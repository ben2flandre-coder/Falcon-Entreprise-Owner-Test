import { createCriticalityEngine } from "../criticality/criticality-engine.js";
import { createEventBus } from "../events/event-bus.js";
import { createFolderEngine } from "../folders/folder-engine.js";
import { createMediaEngine } from "../media/media-engine.js";
import { createMissionEngine } from "../mission/mission-engine.js";
import { createModelRegistry } from "../models/model-registry.js";
import { createObservationEngine } from "../observations/observation-engine.js";
import { createPersistenceCoordinator } from "../persistence/persistence-coordinator.js";
import { createRadarEngine } from "../radar/radar-engine.js";
import { createReportEngine } from "../report/report-engine.js";
import { createSessionEngine } from "../session/session-engine.js";
import { createTrustEngine } from "../trust/trust-engine.js";

export const ENTERPRISE_RUNTIME_VERSION = "V48.0.0-dev";

function assertStorage(storage) {
  if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function" || typeof storage.remove !== "function") {
    throw new TypeError("Enterprise runtime storage must implement get(), set() and remove().");
  }
}

function registrySnapshot(schema, collection, count) {
  return (value) => Boolean(value && value.schema === schema && Array.isArray(value[collection]) && Number.isInteger(value[count]));
}

const isMissionSnapshot = registrySnapshot("falcon.mission.registry.v1", "missions", "missionCount");
const isSessionSnapshot = registrySnapshot("falcon.session.registry.v1", "sessions", "sessionCount");
const isFolderSnapshot = registrySnapshot("falcon.folder.registry.v1", "folders", "folderCount");
const isObservationSnapshot = registrySnapshot("falcon.observation.registry.v1", "observations", "observationCount");
const isMediaSnapshot = registrySnapshot("falcon.media.registry.v1", "media", "mediaCount");
const isCriticalitySnapshot = registrySnapshot("falcon.criticality.registry.v1", "assessments", "assessmentCount");
const isRadarSnapshot = registrySnapshot("falcon.radar.registry.v1", "assessments", "assessmentCount");
const isTrustSnapshot = registrySnapshot("falcon.trust.registry.v1", "assessments", "assessmentCount");
const isReportSnapshot = registrySnapshot("falcon.report.registry.v1", "reports", "reportCount");

export function createEnterpriseRuntime({
  storage,
  authorize = () => true,
  now = () => new Date().toISOString(),
  missionIdGenerator = null,
  sessionIdGenerator = null,
  folderIdGenerator = null,
  observationIdGenerator = null,
  mediaIdGenerator = null,
  criticalityIdGenerator = null,
  radarIdGenerator = null,
  trustIdGenerator = null,
  reportIdGenerator = null,
  radarDefinition = {}
} = {}) {
  assertStorage(storage);
  if (typeof authorize !== "function") throw new TypeError("Enterprise runtime authorizer must be a function.");
  if (typeof now !== "function") throw new TypeError("Enterprise runtime clock must be a function.");

  const events = createEventBus({ now });
  const models = createModelRegistry({ now });
  models.register({ name: "MissionRegistry", version: "1.0", metadata: { owner: "MissionEngine" }, validate: isMissionSnapshot });
  models.register({ name: "SessionRegistry", version: "1.0", metadata: { owner: "SessionEngine" }, validate: isSessionSnapshot });
  models.register({ name: "FolderRegistry", version: "1.0", metadata: { owner: "FolderEngine" }, validate: isFolderSnapshot });
  models.register({ name: "ObservationRegistry", version: "1.0", metadata: { owner: "ObservationEngine" }, validate: isObservationSnapshot });
  models.register({ name: "MediaRegistry", version: "1.0", metadata: { owner: "MediaEngine", payload: "metadata-only" }, validate: isMediaSnapshot });
  models.register({ name: "CriticalityRegistry", version: "1.0", metadata: { owner: "CriticalityEngine", method: "GxPxM@1.0" }, validate: isCriticalitySnapshot });
  models.register({ name: "RadarRegistry", version: "1.0", metadata: { owner: "RadarEngine", derived: true }, validate: isRadarSnapshot });
  models.register({ name: "TrustRegistry", version: "1.0", metadata: { owner: "TrustEngine", derived: true, source: "RadarRegistry" }, validate: isTrustSnapshot });
  models.register({ name: "ReportRegistry", version: "1.0", metadata: { owner: "ReportEngine", derived: true, sources: ["MissionRegistry", "RadarRegistry", "TrustRegistry"] }, validate: isReportSnapshot });

  let missions;
  let sessions;
  let folders;
  let observations;
  let media;
  let criticality;
  let radar;
  let trust;
  let reports;

  const emit = (type, payload, origin) => events.publish(type, payload, { origin });
  const buildMissionEngine = (snapshot = null) => createMissionEngine({ initialMissions: snapshot?.missions || [], initialActiveMissionId: snapshot?.activeMissionId || null, authorize, now, idGenerator: missionIdGenerator, onChange: (event) => emit("Mission.Changed", event, event.origin || "enterprise-runtime") });
  const buildSessionEngine = (snapshot = null) => createSessionEngine({ initialSessions: snapshot?.sessions || [], initialActiveSessionId: snapshot?.activeSessionId || null, authorize, now, idGenerator: sessionIdGenerator, onChange: (event) => emit("Session.Changed", event, event.origin || "enterprise-runtime") });
  const buildFolderEngine = (snapshot = null) => createFolderEngine({ initialFolders: snapshot?.folders || [], now, idGenerator: folderIdGenerator, onChange: (event) => emit("Folder.Changed", event, event.origin || "enterprise-runtime") });
  const buildObservationEngine = (snapshot = null) => createObservationEngine({ initialObservations: snapshot?.observations || [], now, idGenerator: observationIdGenerator, onChange: (event) => emit("Observation.Changed", event, event.origin || "enterprise-runtime") });
  const buildMediaEngine = (snapshot = null) => createMediaEngine({ initialMedia: snapshot?.media || [], now, idGenerator: mediaIdGenerator, onChange: (event) => emit("Media.Changed", event, event.origin || "enterprise-runtime") });
  const buildCriticalityEngine = (snapshot = null) => createCriticalityEngine({ initialAssessments: snapshot?.assessments || [], now, idGenerator: criticalityIdGenerator, onChange: (event) => emit("Criticality.Changed", event, event.origin || "enterprise-runtime") });
  const buildRadarEngine = (snapshot = null) => createRadarEngine({ definition: radarDefinition, initialAssessments: snapshot?.assessments || [], now, idGenerator: radarIdGenerator, onChange: (event) => emit("Radar.Changed", event, event.origin || "enterprise-runtime") });
  const buildTrustEngine = (snapshot = null) => createTrustEngine({ initialAssessments: snapshot?.assessments || [], now, idGenerator: trustIdGenerator, onChange: (event) => emit("Trust.Changed", event, event.origin || "enterprise-runtime") });
  const buildReportEngine = (snapshot = null) => createReportEngine({ initialReports: snapshot?.reports || [], now, idGenerator: reportIdGenerator, onChange: (event) => emit("Report.Changed", event, event.origin || "enterprise-runtime") });

  missions = buildMissionEngine();
  sessions = buildSessionEngine();
  folders = buildFolderEngine();
  observations = buildObservationEngine();
  media = buildMediaEngine();
  criticality = buildCriticalityEngine();
  radar = buildRadarEngine();
  trust = buildTrustEngine();
  reports = buildReportEngine();

  const persistence = createPersistenceCoordinator({ storage, appVersion: ENTERPRISE_RUNTIME_VERSION, now });
  const participant = (id, order, model, validate, capture, restore) => persistence.registerParticipant({ id, version: "1.0", order, capture: () => models.validate(model, "1.0", capture()), validate, restore: (snapshot) => restore(models.validate(model, "1.0", snapshot)) });
  participant("mission-registry", 10, "MissionRegistry", isMissionSnapshot, () => missions.snapshot({ origin: "enterprise-persistence" }), (snapshot) => { missions = buildMissionEngine(snapshot); });
  participant("session-registry", 20, "SessionRegistry", isSessionSnapshot, () => sessions.snapshot({ origin: "enterprise-persistence" }), (snapshot) => { sessions = buildSessionEngine(snapshot); });
  participant("folder-registry", 30, "FolderRegistry", isFolderSnapshot, () => folders.snapshot(), (snapshot) => { folders = buildFolderEngine(snapshot); });
  participant("observation-registry", 40, "ObservationRegistry", isObservationSnapshot, () => observations.snapshot(), (snapshot) => { observations = buildObservationEngine(snapshot); });
  participant("media-registry", 50, "MediaRegistry", isMediaSnapshot, () => media.snapshot(), (snapshot) => { media = buildMediaEngine(snapshot); });
  participant("criticality-registry", 60, "CriticalityRegistry", isCriticalitySnapshot, () => criticality.snapshot(), (snapshot) => { criticality = buildCriticalityEngine(snapshot); });
  participant("radar-registry", 70, "RadarRegistry", isRadarSnapshot, () => radar.snapshot(), (snapshot) => { radar = buildRadarEngine(snapshot); });
  participant("trust-registry", 80, "TrustRegistry", isTrustSnapshot, () => trust.snapshot(), (snapshot) => { trust = buildTrustEngine(snapshot); });
  participant("report-registry", 90, "ReportRegistry", isReportSnapshot, () => reports.snapshot(), (snapshot) => { reports = buildReportEngine(snapshot); });

  function createMission(input, options = {}) { return missions.createMission(input, options); }

  function createSessionForMission(missionId, input = {}, options = {}) {
    const mission = missions.getMission(missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot create a session for an archived mission.");
    return sessions.createSession({ ...input, missionId: mission.id, name: input.name || `Session — ${mission.name}` }, options);
  }

  function createFolderForMission(missionId, input = {}, options = {}) {
    const mission = missions.getMission(missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot create a folder for an archived mission.");
    return folders.createFolder({ ...input, missionId: mission.id, sessionId: null }, options);
  }

  function createFolderForSession(sessionId, input = {}, options = {}) {
    const session = sessions.getSession(sessionId, { origin: options.origin || "enterprise-runtime" });
    const mission = missions.getMission(session.missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot create a folder for a session of an archived mission.");
    return folders.createFolder({ ...input, missionId: mission.id, sessionId: session.id }, options);
  }

  function createObservationForMission(missionId, input = {}, options = {}) {
    const mission = missions.getMission(missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot create an observation for an archived mission.");
    if (input.folderId) {
      const folder = folders.getFolder(input.folderId);
      if (folder.missionId !== mission.id || folder.sessionId !== null) throw new Error("Observation folder does not belong to the mission scope.");
    }
    return observations.createObservation({ ...input, missionId: mission.id, sessionId: null }, options);
  }

  function createObservationForSession(sessionId, input = {}, options = {}) {
    const session = sessions.getSession(sessionId, { origin: options.origin || "enterprise-runtime" });
    const mission = missions.getMission(session.missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot create an observation for a session of an archived mission.");
    if (input.folderId) {
      const folder = folders.getFolder(input.folderId);
      if (folder.missionId !== mission.id || folder.sessionId !== session.id) throw new Error("Observation folder does not belong to the session scope.");
    }
    return observations.createObservation({ ...input, missionId: mission.id, sessionId: session.id }, options);
  }

  function attachMediaToObservation(observationId, input = {}, options = {}) {
    const observation = observations.getObservation(observationId);
    if (observation.status === "archived") throw new Error("Cannot attach media to an archived observation.");
    if (input.folderId && input.folderId !== observation.folderId) throw new Error("Media folder must match the observation folder.");
    return media.registerMedia({ ...input, observationId: observation.id, missionId: observation.missionId, sessionId: observation.sessionId, folderId: observation.folderId }, options);
  }

  function assessObservationCriticality(observationId, input = {}, options = {}) {
    const observation = observations.getObservation(observationId);
    if (observation.status === "archived") throw new Error("Cannot assess an archived observation.");
    return criticality.assessObservation({ ...input, observationId: observation.id, missionId: observation.missionId, sessionId: observation.sessionId }, options);
  }

  function validateRadarContributions(contributions, missionId, sessionId) {
    for (const contribution of contributions || []) {
      if (contribution.sourceType === "observation") {
        const observation = observations.getObservation(contribution.sourceId);
        if (observation.missionId !== missionId || observation.sessionId !== sessionId) throw new Error("Radar observation contribution is outside the requested scope.");
        if (observation.status === "archived") throw new Error("Archived observations cannot contribute to an active Radar assessment.");
      }
      if (contribution.sourceType === "criticality") {
        const assessment = criticality.getAssessment(contribution.sourceId);
        if (assessment.missionId !== missionId || assessment.sessionId !== sessionId) throw new Error("Radar criticality contribution is outside the requested scope.");
        if (assessment.status === "archived") throw new Error("Archived criticality assessments cannot contribute to an active Radar assessment.");
      }
    }
  }

  function assessMissionRadar(missionId, input = {}, options = {}) {
    const mission = missions.getMission(missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot assess Radar for an archived mission.");
    validateRadarContributions(input.contributions, mission.id, null);
    return radar.assess({ ...input, missionId: mission.id, sessionId: null, scopeType: "mission" }, options);
  }

  function assessSessionRadar(sessionId, input = {}, options = {}) {
    const session = sessions.getSession(sessionId, { origin: options.origin || "enterprise-runtime" });
    const mission = missions.getMission(session.missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot assess Radar for a session of an archived mission.");
    validateRadarContributions(input.contributions, mission.id, session.id);
    return radar.assess({ ...input, missionId: mission.id, sessionId: session.id, scopeType: "session" }, options);
  }

  function recomputeRadar(radarId, input = {}, options = {}) {
    const current = radar.getAssessment(radarId);
    validateRadarContributions(input.contributions || current.contributions, current.missionId, current.sessionId);
    return radar.recompute(radarId, input, options);
  }

  function assessRadarTrust(radarId, options = {}) {
    const radarAssessment = radar.getAssessment(radarId);
    if (radarAssessment.status === "archived") throw new Error("Cannot assess trust for an archived Radar assessment.");
    return trust.assessRadar(radarAssessment, options);
  }

  function reassessRadarTrust(trustId, options = {}) {
    const current = trust.getAssessment(trustId);
    const radarAssessment = radar.getAssessment(current.radarId);
    if (radarAssessment.status === "archived") throw new Error("Cannot reassess trust from an archived Radar assessment.");
    return trust.reassess(trustId, radarAssessment, options);
  }

  function generateReportFromTrust(trustId, options = {}) {
    const trustAssessment = trust.getAssessment(trustId);
    if (trustAssessment.status === "archived") throw new Error("Cannot generate a report from an archived Trust assessment.");
    const radarAssessment = radar.getAssessment(trustAssessment.radarId);
    const mission = missions.getMission(trustAssessment.missionId, { origin: options.origin || "enterprise-runtime" });
    if (mission.status === "archived") throw new Error("Cannot generate a report for an archived mission.");
    return reports.generate({ mission, radar: radarAssessment, trust: trustAssessment }, options);
  }

  function regenerateReport(reportId, options = {}) {
    const current = reports.getReport(reportId);
    const trustAssessment = trust.getAssessment(current.trustId);
    const radarAssessment = radar.getAssessment(current.radarId);
    const mission = missions.getMission(current.missionId, { origin: options.origin || "enterprise-runtime" });
    return reports.regenerate(reportId, { mission, radar: radarAssessment, trust: trustAssessment }, options);
  }

  function issueReport(reportId, options = {}) { return reports.issue(reportId, options); }
  function archiveReport(reportId, options = {}) { return reports.archive(reportId, options); }

  function save(options = {}) {
    const envelope = persistence.save(options);
    emit("Persistence.Saved", { commitId: envelope.commitId, participantCount: Object.keys(envelope.participants).length }, options.origin || "enterprise-runtime");
    return envelope;
  }

  function load(options = {}) {
    const envelope = persistence.load(options);
    emit("Persistence.Loaded", { commitId: envelope.commitId, participantCount: Object.keys(envelope.participants).length }, options.origin || "enterprise-runtime");
    return envelope;
  }

  function snapshot() {
    return Object.freeze({
      schema: "falcon.enterprise.runtime.v1",
      version: ENTERPRISE_RUNTIME_VERSION,
      missions: missions.snapshot({ origin: "enterprise-runtime" }),
      sessions: sessions.snapshot({ origin: "enterprise-runtime" }),
      folders: folders.snapshot(),
      observations: observations.snapshot(),
      media: media.snapshot(),
      criticality: criticality.snapshot(),
      radar: radar.snapshot(),
      trust: trust.snapshot(),
      reports: reports.snapshot(),
      models: models.manifest()
    });
  }

  return Object.freeze({
    get missions() { return missions; },
    get sessions() { return sessions; },
    get folders() { return folders; },
    get observations() { return observations; },
    get media() { return media; },
    get criticality() { return criticality; },
    get radar() { return radar; },
    get trust() { return trust; },
    get reports() { return reports; },
    events,
    models,
    persistence,
    createMission,
    createSessionForMission,
    createFolderForMission,
    createFolderForSession,
    createObservationForMission,
    createObservationForSession,
    attachMediaToObservation,
    assessObservationCriticality,
    assessMissionRadar,
    assessSessionRadar,
    recomputeRadar,
    assessRadarTrust,
    reassessRadarTrust,
    generateReportFromTrust,
    regenerateReport,
    issueReport,
    archiveReport,
    save,
    load,
    snapshot
  });
}
