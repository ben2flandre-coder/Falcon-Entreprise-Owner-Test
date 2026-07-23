export const OFFLINE_QUEUE_SCHEMA = "falcon.offline-operation-queue.v1";
export const OFFLINE_OPERATION_STATES = Object.freeze([
  "local",
  "pending",
  "syncing",
  "synced",
  "conflict",
  "error",
  "recovery_required"
]);

export const OFFLINE_STATE_LABELS = Object.freeze({
  local: "local",
  pending: "en attente",
  syncing: "synchronisation en cours",
  synced: "synchronisé",
  conflict: "conflit",
  error: "erreur",
  recovery_required: "reprise nécessaire"
});

export const CLOUD_CONNECTORS = Object.freeze({
  google_drive: Object.freeze({
    id: "google_drive",
    label: "Google Drive",
    v1Mode: "dossier local monté",
    manualPush: true,
    permanentSync: true,
    directApi: "reportée",
    reportReason: "OAuth direct exige une application enregistrée, des secrets administrés et une politique de données ; Falcon V1 reste sans serveur obligatoire."
  }),
  onedrive: Object.freeze({
    id: "onedrive",
    label: "OneDrive",
    v1Mode: "dossier local monté",
    manualPush: true,
    permanentSync: true,
    directApi: "reportée",
    reportReason: "Microsoft Graph direct exige un tenant et un consentement OAuth administré ; le dossier synchronisé par le système est pris en charge en V1."
  }),
  dropbox: Object.freeze({
    id: "dropbox",
    label: "Dropbox",
    v1Mode: "dossier local monté",
    manualPush: true,
    permanentSync: true,
    directApi: "reportée",
    reportReason: "L’API directe exige une application OAuth et une gouvernance des jetons ; le dossier Dropbox monté reste utilisable sans dépendance Falcon."
  }),
  local_folder: Object.freeze({
    id: "local_folder",
    label: "Dossier local ou réseau",
    v1Mode: "dossier choisi",
    manualPush: true,
    permanentSync: true,
    directApi: "sans objet",
    reportReason: "Aucun service distant imposé."
  })
});

export class OfflineQueueError extends Error {
  constructor(message, code = "OFFLINE_QUEUE_ERROR") {
    super(message);
    this.name = "OfflineQueueError";
    this.code = code;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function freezeOperation(operation) {
  return Object.freeze({ ...operation, history: Object.freeze((operation.history || []).map((entry) => Object.freeze({ ...entry }))) });
}

export function createMemoryQueueStorage(initial = []) {
  let value = clone(initial);
  return Object.freeze({
    load: () => clone(value),
    save: (next) => { value = clone(next); return true; }
  });
}

export function createOfflineOperationQueue({
  storage = createMemoryQueueStorage(),
  now = () => new Date().toISOString(),
  id = () => globalThis.crypto?.randomUUID?.() || `operation-${Date.now()}`,
  isOnline = () => true,
  executor = async () => ({ status: "synced" })
} = {}) {
  let operations = Array.isArray(storage.load?.()) ? storage.load() : [];

  function persist() {
    storage.save(operations);
  }

  function transition(operation, state, detail = "") {
    if (!OFFLINE_OPERATION_STATES.includes(state)) throw new OfflineQueueError("État de file invalide.", "INVALID_STATE");
    operation.state = state;
    operation.updatedAt = now();
    operation.lastError = state === "error" || state === "recovery_required" ? String(detail || operation.lastError || "") : "";
    operation.history = [...(operation.history || []), { at: operation.updatedAt, state, detail: String(detail || "") }];
  }

  async function run(operation) {
    if (!isOnline()) {
      transition(operation, "pending", "Réseau indisponible ; opération conservée localement.");
      persist();
      return freezeOperation(operation);
    }
    transition(operation, "syncing", "Tentative de synchronisation.");
    operation.attempts = Number(operation.attempts || 0) + 1;
    persist();
    try {
      const result = await executor(freezeOperation(operation));
      const state = result?.status === "conflict"
        ? "conflict"
        : result?.status === "recovery_required"
          ? "recovery_required"
          : "synced";
      transition(operation, state, result?.detail || "");
      operation.remoteReference = result?.remoteReference || operation.remoteReference || "";
    } catch (error) {
      transition(operation, "error", error?.message || String(error));
    }
    persist();
    return freezeOperation(operation);
  }

  return Object.freeze({
    schema: OFFLINE_QUEUE_SCHEMA,
    enqueue({ connectorId = "local_folder", kind = "portable-package-push", payloadReference, digest, metadata = {} } = {}) {
      if (!CLOUD_CONNECTORS[connectorId]) throw new OfflineQueueError("Connecteur inconnu.", "UNKNOWN_CONNECTOR");
      if (!payloadReference || !digest) throw new OfflineQueueError("Référence et empreinte obligatoires.", "INVALID_OPERATION");
      const createdAt = now();
      const operation = {
        id: String(id()),
        connectorId,
        kind: String(kind),
        payloadReference: String(payloadReference),
        digest: String(digest),
        metadata: clone(metadata),
        state: "local",
        attempts: 0,
        createdAt,
        updatedAt: createdAt,
        lastError: "",
        history: [{ at: createdAt, state: "local", detail: "Opération enregistrée sans perte dans la file locale." }]
      };
      if (!isOnline()) transition(operation, "pending", "En attente du retour réseau.");
      operations.push(operation);
      persist();
      return freezeOperation(operation);
    },
    snapshot() {
      const counts = Object.fromEntries(OFFLINE_OPERATION_STATES.map((state) => [state, operations.filter((operation) => operation.state === state).length]));
      return Object.freeze({
        schema: OFFLINE_QUEUE_SCHEMA,
        online: Boolean(isOnline()),
        count: operations.length,
        counts: Object.freeze(counts),
        operations: Object.freeze(operations.map(freezeOperation))
      });
    },
    async retry(operationId) {
      const operation = operations.find((entry) => entry.id === operationId);
      if (!operation) throw new OfflineQueueError("Opération introuvable.", "OPERATION_NOT_FOUND");
      if (operation.state === "synced") return freezeOperation(operation);
      return run(operation);
    },
    async resume() {
      const eligible = operations.filter((operation) => ["local", "pending", "error", "recovery_required"].includes(operation.state));
      const results = [];
      for (const operation of eligible) results.push(await run(operation));
      return Object.freeze(results);
    },
    markConflict(operationId, detail = "Version distante concurrente.") {
      const operation = operations.find((entry) => entry.id === operationId);
      if (!operation) throw new OfflineQueueError("Opération introuvable.", "OPERATION_NOT_FOUND");
      transition(operation, "conflict", detail);
      persist();
      return freezeOperation(operation);
    },
    requireRecovery(operationId, detail = "Intervention requise avant une nouvelle tentative.") {
      const operation = operations.find((entry) => entry.id === operationId);
      if (!operation) throw new OfflineQueueError("Opération introuvable.", "OPERATION_NOT_FOUND");
      transition(operation, "recovery_required", detail);
      persist();
      return freezeOperation(operation);
    }
  });
}
