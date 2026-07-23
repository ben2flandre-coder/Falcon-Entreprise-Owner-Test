import {
  MISSION_STATUSES,
  createMissionEngine
} from "../../modules/mission/mission-engine.js";

const STATUS_LABELS = Object.freeze({
  [MISSION_STATUSES.DRAFT]: "Brouillon",
  [MISSION_STATUSES.ACTIVE]: "Active",
  [MISSION_STATUSES.PAUSED]: "En pause",
  [MISSION_STATUSES.COMPLETED]: "Terminée",
  [MISSION_STATUSES.ARCHIVED]: "Archivée"
});

export function setupMissionPanel({
  rbac,
  persistence = null,
  status,
  summary,
  nameInput,
  clientInput,
  scopeInput,
  createButton,
  feedback,
  list
}) {
  let engine = null;

  function setFeedback(message, tone = "neutral") {
    feedback.className = `mission-feedback ${tone}`;
    feedback.textContent = message;
  }

  function actionButton(label, action, { disabled = false, tone = "secondary" } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = tone;
    button.disabled = disabled;
    button.addEventListener("click", action);
    return button;
  }

  function readPersistedRegistry() {
    if (!persistence) return { missions: [], activeMissionId: null, restored: false };
    if (typeof persistence.read !== "function" || typeof persistence.write !== "function") {
      throw new TypeError("Mission persistence requires read/write operations.");
    }
    const raw = persistence.read();
    if (raw === null || raw === undefined || raw === "") {
      return { missions: [], activeMissionId: null, restored: false };
    }
    const parsed = JSON.parse(String(raw));
    if (parsed?.schema !== "falcon.mission.registry.v1" || !Array.isArray(parsed.missions)) {
      throw new TypeError("Persisted mission registry is invalid.");
    }
    return {
      missions: parsed.missions,
      activeMissionId: parsed.activeMissionId ?? null,
      restored: true
    };
  }

  function persistRegistry(snapshot) {
    if (!persistence) return;
    const persisted = persistence.write(JSON.stringify(snapshot));
    if (persisted !== true) throw new Error("Mission registry persistence failed.");
  }

  function initializeEngine() {
    const initial = readPersistedRegistry();
    engine = createMissionEngine({
      initialMissions: initial.missions,
      initialActiveMissionId: initial.activeMissionId,
      authorize: (permission) => rbac.can(permission),
      onChange: (_event, snapshot) => persistRegistry(snapshot)
    });
    status.textContent = "Opérationnel";
    status.className = "status-pill ok";
    setFeedback(
      initial.restored
        ? "Registre missions restauré depuis l’espace de données actif."
        : persistence
          ? "Registre missions vierge et persistant dans l’espace de données actif."
          : "Mission Engine prêt. Registre vierge et non persisté."
    );
  }

  function run(action, successMessage) {
    try {
      action();
      setFeedback(successMessage, "success");
    } catch (error) {
      setFeedback(error.message || "Opération mission impossible.", "error");
    }
    render();
  }

  function renderSummary(snapshot) {
    const active = snapshot.activeMissionId
      ? snapshot.missions.find((mission) => mission.id === snapshot.activeMissionId)
      : null;
    const archived = snapshot.missions.filter((mission) => mission.status === MISSION_STATUSES.ARCHIVED).length;
    summary.replaceChildren();
    for (const [value, label] of [
      [String(snapshot.missionCount), "missions enregistrées"],
      [active?.name || "Aucune", "mission active"],
      [String(archived), "missions archivées"]
    ]) {
      const card = document.createElement("article");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      card.className = "mission-card";
      strong.textContent = value;
      span.textContent = label;
      card.append(strong, span);
      summary.append(card);
    }
  }

  function renderActions(actions, mission, activeMissionId) {
    if (mission.status !== MISSION_STATUSES.ARCHIVED && activeMissionId !== mission.id) {
      actions.append(actionButton("Activer", () => run(
        () => engine.activateMission(mission.id, { origin: "v48-mission-panel" }),
        `Mission active : ${mission.name}.`
      ), { disabled: !rbac.can("mission.read") }));
    }

    if (mission.status === MISSION_STATUSES.DRAFT) {
      actions.append(actionButton("Démarrer", () => run(
        () => engine.transitionMission(mission.id, MISSION_STATUSES.ACTIVE, { expectedRevision: mission.revision, origin: "v48-mission-panel" }),
        `Mission démarrée : ${mission.name}.`
      ), { disabled: !rbac.can("mission.update"), tone: "primary" }));
    } else if ([MISSION_STATUSES.ACTIVE, MISSION_STATUSES.PAUSED].includes(mission.status)) {
      actions.append(actionButton("Terminer", () => run(
        () => engine.transitionMission(mission.id, MISSION_STATUSES.COMPLETED, { expectedRevision: mission.revision, origin: "v48-mission-panel" }),
        `Mission terminée : ${mission.name}.`
      ), { disabled: !rbac.can("mission.update"), tone: "primary" }));
    } else if (mission.status === MISSION_STATUSES.COMPLETED) {
      actions.append(actionButton("Rouvrir", () => run(
        () => engine.transitionMission(mission.id, MISSION_STATUSES.ACTIVE, { expectedRevision: mission.revision, origin: "v48-mission-panel" }),
        `Mission rouverte : ${mission.name}.`
      ), { disabled: !rbac.can("mission.update") }));
    }

    if (mission.status === MISSION_STATUSES.ARCHIVED) {
      actions.append(actionButton("Restaurer", () => run(
        () => engine.restoreMission(mission.id, { expectedRevision: mission.revision, origin: "v48-mission-panel" }),
        `Mission restaurée : ${mission.name}.`
      ), { disabled: !rbac.can("mission.restore") }));
    } else {
      actions.append(actionButton("Archiver", () => run(
        () => engine.archiveMission(mission.id, "Archivage depuis la coque V48", { expectedRevision: mission.revision, origin: "v48-mission-panel" }),
        `Mission archivée : ${mission.name}.`
      ), { disabled: !rbac.can("mission.archive"), tone: "danger" }));
    }
  }

  function render() {
    if (!engine) {
      status.textContent = "Indisponible";
      status.className = "status-pill error";
      return;
    }

    let snapshot;
    try {
      snapshot = engine.snapshot({ origin: "v48-mission-panel" });
    } catch (error) {
      status.textContent = "Accès refusé";
      status.className = "status-pill error";
      summary.replaceChildren();
      list.replaceChildren();
      setFeedback(error.message, "error");
      return;
    }

    status.textContent = "Opérationnel";
    status.className = "status-pill ok";
    createButton.disabled = !rbac.can("mission.create");
    renderSummary(snapshot);
    list.replaceChildren();

    if (snapshot.missions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Aucune mission. Le registre démarre volontairement vierge.";
      list.append(empty);
      return;
    }

    for (const mission of snapshot.missions) {
      const row = document.createElement("article");
      const identity = document.createElement("div");
      const title = document.createElement("strong");
      const details = document.createElement("span");
      const state = document.createElement("span");
      const actions = document.createElement("div");
      row.className = `mission-row status-${mission.status}`;
      identity.className = "mission-identity";
      actions.className = "mission-actions";
      state.className = "mission-state";
      title.textContent = mission.name;
      details.textContent = [mission.clientName, mission.scope].filter(Boolean).join(" · ") || mission.id;
      state.textContent = `${STATUS_LABELS[mission.status]} · révision ${mission.revision}`;
      identity.append(title, details, state);
      renderActions(actions, mission, snapshot.activeMissionId);
      row.append(identity, actions);
      list.append(row);
    }
  }

  function reload() {
    try {
      initializeEngine();
    } catch (error) {
      engine = null;
      status.textContent = "Indisponible";
      status.className = "status-pill error";
      createButton.disabled = true;
      setFeedback(`Initialisation impossible : ${error.message}`, "error");
    }
    render();
    return Boolean(engine);
  }

  createButton.addEventListener("click", () => run(() => {
    const created = engine.createMission({
      name: nameInput.value,
      clientName: clientInput.value,
      scope: scopeInput.value
    }, { activate: true, origin: "v48-mission-panel" });
    nameInput.value = "";
    clientInput.value = "";
    scopeInput.value = "";
    return created;
  }, "Mission créée et activée."));

  reload();
  return Object.freeze({
    get engine() { return engine; },
    render,
    reload,
    isReady: () => Boolean(engine)
  });
}
