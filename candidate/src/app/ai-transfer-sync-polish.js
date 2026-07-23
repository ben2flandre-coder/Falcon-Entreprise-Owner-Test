import {
  AI_CONNECTION_SCHEMA,
  AI_PROMPT_EXAMPLES,
  AI_PROVIDERS,
  AI_TROUBLESHOOTING,
  aiDataDisclosure,
  createAIConnectionTest,
  describeAIAvailability,
  normalizeAIConfiguration
} from "../modules/ai/ai-connection-policy.js";
import {
  PORTABLE_IMPORT_MODES,
  applyPortableImport,
  buildPortablePackage,
  planPortableImport,
  previewPortableImport,
  verifyPortablePackage
} from "../modules/transfer/portable-falcon-package.js";
import {
  CLOUD_CONNECTORS,
  OFFLINE_OPERATION_STATES,
  OFFLINE_STATE_LABELS,
  createOfflineOperationQueue
} from "../modules/sync/offline-operation-queue.js";

const STATE_KEY = "falcon_radar_360_v45_1_premium_consolidated";
const AI_KEY = "falcon_ai_config_v422";
const AI_SESSION_KEY = "falcon:r6:ai-punctual:v1";
const QUEUE_KEY = "falcon:r6:offline-queue:v1";
const CONNECTOR_KEY = "falcon:r6:connector:v1";
const DEVICE_KEY = "falcon:complete-profile:device:v1";
const DB_NAME = "FalconEnterpriseR6";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const PACKAGE_STORE = "packages";
let pendingPreview = null;
let activePackage = null;
let activeDirectoryHandle = null;
let lastAIResult = null;
let databasePromise = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notify(message, type = "info") {
  if (typeof window.toast === "function") window.toast(message, type);
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function currentState() {
  return readJson(STATE_KEY, {});
}

function localSettings() {
  const entries = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("falcon")) entries[key] = localStorage.getItem(key);
  }
  return entries;
}

function currentAIConfiguration() {
  const permanent = readJson(AI_KEY, {});
  let punctual = {};
  try { punctual = JSON.parse(sessionStorage.getItem(AI_SESSION_KEY) || "{}"); } catch {}
  return normalizeAIConfiguration(Object.keys(punctual).length ? punctual : permanent);
}

function deviceId() {
  return localStorage.getItem(DEVICE_KEY) || "appareil-local";
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE)) database.createObjectStore(HANDLE_STORE);
      if (!database.objectStoreNames.contains(PACKAGE_STORE)) database.createObjectStore(PACKAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Stockage R6 indisponible."));
  });
  return databasePromise;
}

async function dbGet(storeName, key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error("Lecture R6 impossible."));
  });
}

async function dbPut(storeName, key, value) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Écriture R6 impossible."));
  });
}

function queueStorage() {
  return Object.freeze({
    load: () => readJson(QUEUE_KEY, []),
    save: (value) => {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(value));
      return true;
    }
  });
}

async function writePackageToConnectedFolder(operation) {
  const connector = readJson(CONNECTOR_KEY, null);
  const handle = activeDirectoryHandle || await dbGet(HANDLE_STORE, "active");
  const portablePackage = await dbGet(PACKAGE_STORE, operation.digest);
  if (!connector || !handle) return { status: "recovery_required", detail: "Reconnectez le dossier de destination." };
  if (!portablePackage) return { status: "recovery_required", detail: "Le paquet source local doit être restauré avant la reprise." };
  if (typeof handle.queryPermission === "function") {
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") return { status: "recovery_required", detail: "Autorisation d’écriture à renouveler par l’utilisateur." };
  }
  const fileHandle = await handle.getFileHandle(operation.payloadReference, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(portablePackage, null, 2)}\n`);
  await writable.close();
  return { status: "synced", remoteReference: `${connector.label}/${operation.payloadReference}`, detail: "Paquet vérifié écrit dans le dossier choisi." };
}

const operationQueue = createOfflineOperationQueue({
  storage: queueStorage(),
  isOnline: () => navigator.onLine !== false,
  executor: writePackageToConnectedFolder
});

function rerender() {
  const root = document.querySelector('div[data-falcon-r6="ready"]');
  if (root) {
    root.outerHTML = renderR6Panels();
    return;
  }
  if (typeof window.render === "function") window.render();
}

function packageFileName(portablePackage) {
  const safe = String(portablePackage.packageId || "mission")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "mission";
  return `${safe}-${portablePackage.createdAt.slice(0, 10)}.falcon-package`;
}

function downloadPackage(portablePackage) {
  const blob = new Blob([`${JSON.stringify(portablePackage, null, 2)}\n`], { type: "application/vnd.falcon.package+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = packageFileName(portablePackage);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function createPackage({ download = true } = {}) {
  const state = currentState();
  const portablePackage = await buildPortablePackage({
    state,
    settings: localSettings(),
    media: readJson("falcon:media:registry:v1", state.media || []),
    reports: state.reportArchive || [],
    appVersion: document.documentElement.dataset.falconSourceCommit || "48.0.0-rc.1",
    sourceDevice: deviceId()
  });
  const verification = await verifyPortablePackage(portablePackage);
  if (!verification.valid) throw new Error(verification.issues.join(" "));
  activePackage = portablePackage;
  await dbPut(PACKAGE_STORE, portablePackage.integrity.digest, portablePackage);
  if (download) downloadPackage(portablePackage);
  notify("Paquet Falcon portable créé et vérifié.", "ok");
  rerender();
  return portablePackage;
}

async function previewFile(file) {
  if (!file) return null;
  const portablePackage = JSON.parse(await file.text());
  pendingPreview = Object.freeze({
    ...await previewPortableImport(portablePackage, currentState()),
    portablePackage
  });
  notify(`Paquet vérifié : ${pendingPreview.totals.conflicts} conflit(s), ${pendingPreview.totals.duplicates} doublon(s).`, pendingPreview.totals.conflicts ? "warn" : "ok");
  rerender();
  return pendingPreview;
}

function settingsFromPackage(portablePackage) {
  const settingsFile = portablePackage.files.find((file) => file.path === "Parametres/settings.json");
  try { return JSON.parse(settingsFile?.content || "{}"); } catch { return {}; }
}

async function importPending(mode) {
  if (!pendingPreview?.portablePackage) throw new Error("Sélectionnez et vérifiez un paquet avant l’import.");
  const plan = planPortableImport(pendingPreview, mode);
  const result = applyPortableImport({ preview: pendingPreview, plan, currentState: currentState() });
  const backupKey = `falcon:r6:before-import:${Date.now()}`;
  localStorage.setItem(backupKey, localStorage.getItem(STATE_KEY) || "{}");
  if (mode === "replace") {
    const currentFalconKeys = Object.keys(localSettings());
    const importedSettings = settingsFromPackage(pendingPreview.portablePackage);
    for (const key of currentFalconKeys) {
      if (key !== backupKey && key !== DEVICE_KEY && !Object.hasOwn(importedSettings, key)) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(importedSettings)) localStorage.setItem(key, value);
  } else if (mode === "merge") {
    for (const [key, value] of Object.entries(settingsFromPackage(pendingPreview.portablePackage))) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
  }
  localStorage.setItem(STATE_KEY, JSON.stringify(result.state));
  sessionStorage.setItem("falcon:r6:last-import:v1", JSON.stringify({
    at: new Date().toISOString(),
    mode,
    packageId: plan.packageId,
    digest: pendingPreview.verification.rootDigest,
    backupKey,
    conflictsPreserved: result.audit.conflictsPreserved || 0
  }));
  notify("Import appliqué avec point de reprise et trace d’audit. Rechargement du dossier…", "ok");
  setTimeout(() => location.reload(), 250);
  return result;
}

async function saveAISettings() {
  const provider = document.getElementById("r6_ai_provider")?.value || "disabled";
  const base = AI_PROVIDERS[provider] || AI_PROVIDERS.disabled;
  const config = {
    enabled: document.getElementById("r6_ai_enabled")?.checked || false,
    provider,
    endpoint: document.getElementById("r6_ai_endpoint")?.value.trim() || base.defaultEndpoint,
    model: document.getElementById("r6_ai_model")?.value.trim() || "",
    apiKey: document.getElementById("r6_ai_key")?.value.trim() || "",
    connectionMode: document.getElementById("r6_ai_mode")?.value === "permanent" ? "permanent" : "punctual"
  };
  const normalized = normalizeAIConfiguration(config);
  if (normalized.connectionMode === "permanent") {
    localStorage.setItem(AI_KEY, JSON.stringify(normalized));
    sessionStorage.removeItem(AI_SESSION_KEY);
  } else {
    sessionStorage.setItem(AI_SESSION_KEY, JSON.stringify(normalized));
    const withoutKey = { ...normalized, apiKey: "", enabled: false };
    localStorage.setItem(AI_KEY, JSON.stringify(withoutKey));
  }
  notify(normalized.connectionMode === "permanent" ? "Configuration IA conservée sur cet appareil." : "Configuration IA ponctuelle conservée pour cette session.", "ok");
  rerender();
  return normalized;
}

async function testAIConnection() {
  const config = await saveAISettings();
  const request = createAIConnectionTest(config);
  try {
    const response = await fetch(request.url, { ...request.options, signal: AbortSignal.timeout(20000) });
    lastAIResult = {
      ok: response.ok,
      at: new Date().toISOString(),
      status: response.status,
      detail: response.ok ? "Connexion minimale réussie, sans donnée de dossier." : `Réponse HTTP ${response.status}.`
    };
  } catch (error) {
    lastAIResult = { ok: false, at: new Date().toISOString(), status: 0, detail: error?.message || String(error) };
  }
  notify(lastAIResult.ok ? "Connexion IA vérifiée." : `Test IA en échec : ${lastAIResult.detail}`, lastAIResult.ok ? "ok" : "error");
  rerender();
  return lastAIResult;
}

function disableAI() {
  localStorage.setItem(AI_KEY, JSON.stringify({ enabled: false, provider: "disabled", endpoint: "", model: "", apiKey: "", connectionMode: "punctual" }));
  sessionStorage.removeItem(AI_SESSION_KEY);
  lastAIResult = { ok: true, at: new Date().toISOString(), status: 0, detail: "IA désactivée et clé effacée." };
  notify("IA désactivée ; la clé locale a été effacée.", "ok");
  rerender();
  return true;
}

async function connectDirectory(connectorId, { permanent = true } = {}) {
  const definition = CLOUD_CONNECTORS[connectorId];
  if (!definition) throw new Error("Connecteur inconnu.");
  if (typeof window.showDirectoryPicker !== "function") throw new Error("Le sélecteur de dossier n’est pas disponible dans ce navigateur.");
  const handle = await window.showDirectoryPicker({ mode: "readwrite", id: `falcon-${connectorId}` });
  activeDirectoryHandle = handle;
  try {
    await dbPut(HANDLE_STORE, "active", handle);
  } catch (error) {
    console.warn("Le handle de dossier reste actif pour la session mais n’a pas pu être retenu.", error);
  }
  const connector = {
    id: connectorId,
    label: definition.label,
    directoryName: handle.name || "dossier choisi",
    permanent: Boolean(permanent),
    connectedAt: new Date().toISOString(),
    mode: definition.v1Mode
  };
  localStorage.setItem(CONNECTOR_KEY, JSON.stringify(connector));
  notify(`${definition.label} relié au dossier « ${connector.directoryName} ».`, "ok");
  rerender();
  return connector;
}

async function queuePackage(connectorId = readJson(CONNECTOR_KEY, {})?.id || "local_folder", { runNow = true } = {}) {
  const portablePackage = activePackage || await createPackage({ download: false });
  await dbPut(PACKAGE_STORE, portablePackage.integrity.digest, portablePackage);
  const operation = operationQueue.enqueue({
    connectorId,
    payloadReference: packageFileName(portablePackage),
    digest: portablePackage.integrity.digest,
    metadata: { packageId: portablePackage.packageId, createdAt: portablePackage.createdAt }
  });
  if (runNow && navigator.onLine !== false) await operationQueue.retry(operation.id);
  notify(navigator.onLine === false ? "Push conservé dans la file locale jusqu’au retour réseau." : "Push exécuté ou conservé avec son état explicite.", "ok");
  rerender();
  return operationQueue.snapshot();
}

async function resumeQueue() {
  const results = await operationQueue.resume();
  notify(results.every((entry) => entry.state === "synced") ? "File synchronisée." : "La file contient des éléments nécessitant une action.", results.every((entry) => entry.state === "synced") ? "ok" : "warn");
  rerender();
  return results;
}

function renderAIProviderOptions(active) {
  return Object.values(AI_PROVIDERS).map((provider) =>
    `<option value="${escapeHtml(provider.id)}" ${provider.id === active ? "selected" : ""}>${escapeHtml(provider.label)}</option>`
  ).join("");
}

function renderAIPanel() {
  const config = currentAIConfiguration();
  const provider = AI_PROVIDERS[config.provider];
  const availability = describeAIAvailability(config, navigator.onLine !== false);
  const disclosure = aiDataDisclosure();
  return `<section class="panel falcon-r6-panel falcon-r6-ai" data-falcon-r6-ai="ready">
    <div class="section-title"><div><span class="tag purple">IA optionnelle</span><h3>Branchement IA maîtrisé</h3></div><span class="tag ${availability.usable ? "green" : "orange"}">${escapeHtml(availability.status)}</span></div>
    <p>Un fournisseur IA exécute un modèle, localement ou à distance. Une clé API est le secret personnel délivré par ce fournisseur pour autoriser les appels : créez-la dans sa console, saisissez-la ci-dessous et remplacez-la au même endroit.</p>
    <div class="falcon-r6-form-grid">
      <label>Fournisseur<select id="r6_ai_provider">${renderAIProviderOptions(config.provider)}</select></label>
      <label>Endpoint<input id="r6_ai_endpoint" value="${escapeHtml(config.endpoint || provider.defaultEndpoint)}" autocomplete="off"></label>
      <label>Modèle<input id="r6_ai_model" value="${escapeHtml(config.model)}" autocomplete="off"></label>
      <label>Clé API / jeton<input id="r6_ai_key" type="password" value="${escapeHtml(config.apiKey)}" autocomplete="off"></label>
      <label>Connexion<select id="r6_ai_mode"><option value="punctual" ${config.connectionMode === "punctual" ? "selected" : ""}>Ponctuelle · session courante</option><option value="permanent" ${config.connectionMode === "permanent" ? "selected" : ""}>Permanente · cet appareil</option></select></label>
      <label class="falcon-r6-check"><input id="r6_ai_enabled" type="checkbox" ${config.enabled ? "checked" : ""}> Activer l’IA</label>
    </div>
    <div class="row">
      <button class="btn green" type="button" onclick="FalconR6.saveAI()">Enregistrer</button>
      <button class="btn primary" type="button" onclick="FalconR6.testAI()">Tester la connexion</button>
      <button class="btn danger" type="button" onclick="FalconR6.disableAI()">Désactiver et effacer la clé</button>
      ${provider.keyUrl ? `<a class="btn ghost" href="${escapeHtml(provider.keyUrl)}" target="_blank" rel="noreferrer">Obtenir une clé ↗</a>` : ""}
    </div>
    <p class="small">${escapeHtml(availability.detail)} Changer de fournisseur remplace l’endpoint, le modèle et la clé après enregistrement. Hors réseau, seul un fournisseur local reste joignable.</p>
    ${lastAIResult ? `<div class="falcon-r6-result"><span class="tag ${lastAIResult.ok ? "green" : "red"}">${lastAIResult.ok ? "PASS" : "ÉCHEC"}</span> ${escapeHtml(lastAIResult.detail)} · ${escapeHtml(lastAIResult.at)}</div>` : ""}
    <div class="falcon-r6-info-grid">
      <details open><summary>Données envoyées et non envoyées</summary><p><strong>Envoyé :</strong> ${disclosure.sent.map(escapeHtml).join(", ")}.</p><p><strong>Non envoyé :</strong> ${disclosure.notSent.map(escapeHtml).join(", ")}.</p><p class="small">${disclosure.limits.map(escapeHtml).join(" ")}</p></details>
      <details><summary>Exemples de prompts sûrs</summary><ul>${AI_PROMPT_EXAMPLES.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>
      <details><summary>Erreurs fréquentes et dépannage</summary><ul>${AI_TROUBLESHOOTING.map((item) => `<li><strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.cause)} ${escapeHtml(item.action)}</li>`).join("")}</ul></details>
    </div>
  </section>`;
}

function renderTransferMatrix() {
  const devices = ["Téléphone", "Tablette", "PC"];
  return `<div class="table-scroll"><table><thead><tr><th>Source</th>${devices.map((device) => `<th>${device}</th>`).join("")}</tr></thead><tbody>${devices.map((source) => `<tr><th>${source}</th>${devices.map((target) => `<td>${source === target ? "—" : "Paquet Falcon vérifié"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderPreview() {
  if (!pendingPreview) return '<p class="small">Aucun paquet sélectionné. L’aperçu précède obligatoirement toute écriture.</p>';
  return `<div class="falcon-r6-preview">
    <span class="tag green">Intégrité vérifiée</span>
    <strong>${escapeHtml(pendingPreview.packageId)}</strong>
    <div class="grid3">
      <div class="card"><strong>${pendingPreview.totals.additions}</strong><span>ajouts</span></div>
      <div class="card"><strong>${pendingPreview.totals.duplicates}</strong><span>doublons</span></div>
      <div class="card"><strong>${pendingPreview.totals.conflicts}</strong><span>conflits conservés</span></div>
    </div>
    <div class="row">${PORTABLE_IMPORT_MODES.map((mode) => `<button class="btn ${mode === "merge" ? "green" : mode === "replace" ? "danger" : "ghost"}" type="button" onclick="FalconR6.importPackage('${mode}')">${mode === "merge" ? "Fusionner" : mode === "replace" ? "Remplacer avec sauvegarde" : "Importer comme copie"}</button>`).join("")}</div>
  </div>`;
}

function renderPortablePanel() {
  return `<section class="panel falcon-r6-panel" data-falcon-r6-portable="ready">
    <div class="section-title"><div><span class="tag blue">Transfert portable</span><h3>Téléphone, tablette et PC</h3></div><span class="tag green">6 directions</span></div>
    <p>Le paquet <strong>.falcon-package</strong> conserve dossier, observations, médias indexés, rapports, chartes, logos, paramètres, modèles, métadonnées, codification et historique utile. Les clés API et jetons ne sont jamais exportés.</p>
    ${renderTransferMatrix()}
    <div class="row">
      <button class="btn green" type="button" onclick="FalconR6.createPackage()">Créer et vérifier le paquet</button>
      <label class="btn ghost falcon-file-button">Choisir un paquet à importer<input type="file" accept=".falcon-package,application/json" onchange="FalconR6.previewPackage(this.files?.[0]);this.value=''"></label>
    </div>
    ${activePackage ? `<p class="small"><strong>Dernier paquet :</strong> ${escapeHtml(packageFileName(activePackage))} · SHA-256 ${escapeHtml(activePackage.integrity.digest)} · ${activePackage.files.length} fichiers manifestés.</p>` : ""}
    ${renderPreview()}
    <p class="small">Chaque import crée d’abord un point de reprise. Les doublons sont ignorés, les versions concurrentes sont conservées comme copies à arbitrer, et remplacement/copie exigent une action explicite.</p>
  </section>`;
}

function connectorSnapshot() {
  return readJson(CONNECTOR_KEY, null);
}

function renderConnectors() {
  const active = connectorSnapshot();
  return `<div class="falcon-r6-connectors">${Object.values(CLOUD_CONNECTORS).map((connector) => `
    <article class="card">
      <div><strong>${escapeHtml(connector.label)}</strong> ${active?.id === connector.id ? '<span class="tag green">relié</span>' : ""}</div>
      <p class="small">V1 : ${escapeHtml(connector.v1Mode)}. Push manuel et synchronisation permanente optionnelle.</p>
      <button class="btn ghost" type="button" onclick="FalconR6.connect('${escapeHtml(connector.id)}')">Choisir le dossier</button>
      <details><summary>API directe</summary><p class="small">${escapeHtml(connector.directApi)} — ${escapeHtml(connector.reportReason)}</p></details>
    </article>`).join("")}</div>`;
}

function stateClass(state) {
  return state === "synced" ? "green" : state === "error" || state === "recovery_required" ? "red" : state === "conflict" ? "orange" : "blue";
}

function renderQueue() {
  const snapshot = operationQueue.snapshot();
  if (!snapshot.operations.length) return '<p class="small">File vide. Une opération de push crée une entrée locale avant toute tentative distante.</p>';
  return `<div class="falcon-r6-queue">${snapshot.operations.slice().reverse().map((operation) => `
    <article class="card">
      <span class="tag ${stateClass(operation.state)}">${escapeHtml(OFFLINE_STATE_LABELS[operation.state])}</span>
      <strong>${escapeHtml(operation.payloadReference)}</strong>
      <span class="small">${escapeHtml(CLOUD_CONNECTORS[operation.connectorId]?.label || operation.connectorId)} · ${escapeHtml(operation.updatedAt)} · tentative ${operation.attempts}</span>
      ${operation.lastError ? `<span class="small danger">${escapeHtml(operation.lastError)}</span>` : ""}
      ${operation.state !== "synced" ? `<button class="btn ghost" type="button" onclick="FalconR6.retry('${escapeHtml(operation.id)}')">Relancer</button>` : ""}
    </article>`).join("")}</div>`;
}

function renderCloudPanel() {
  const active = connectorSnapshot();
  const queue = operationQueue.snapshot();
  return `<section class="panel falcon-r6-panel" data-falcon-r6-cloud="ready">
    <div class="section-title"><div><span class="tag purple">Local-first</span><h3>Cloud choisi et file hors connexion</h3></div><span class="tag ${navigator.onLine === false ? "orange" : "green"}">${navigator.onLine === false ? "hors connexion" : "réseau disponible"}</span></div>
    <p>Falcon n’exige aucun cloud. En V1, Google Drive, OneDrive et Dropbox fonctionnent via leur dossier synchronisé monté sur l’appareil : Falcon écrit uniquement après sélection explicite. Les API OAuth directes sont reportées et justifiées ci-dessous.</p>
    ${renderConnectors()}
    <div class="row">
      <button class="btn primary" type="button" onclick="FalconR6.queuePackage()">Push manuel${active ? ` vers ${escapeHtml(active.label)}` : ""}</button>
      <button class="btn green" type="button" onclick="FalconR6.resume()">Reprendre la file</button>
    </div>
    <p class="small">Synchronisation permanente optionnelle : le dossier autorisé est mémorisé localement ; au retour du réseau, Falcon reprend les opérations conservées. Une autorisation expirée passe en « reprise nécessaire » sans perte.</p>
    <div class="falcon-r6-state-legend">${OFFLINE_OPERATION_STATES.map((state) => `<span class="tag ${stateClass(state)}">${escapeHtml(OFFLINE_STATE_LABELS[state])} · ${queue.counts[state]}</span>`).join("")}</div>
    ${renderQueue()}
  </section>`;
}

function renderR6Panels() {
  return `<div data-falcon-r6="ready">${renderAIPanel()}${renderPortablePanel()}${renderCloudPanel()}</div>`;
}

const originalRenderDataControl = window.renderDataControl;
if (typeof originalRenderDataControl === "function") {
  window.renderDataControl = function renderDataControlWithR6() {
    const html = String(originalRenderDataControl());
    if (html.includes('data-falcon-r6="ready"')) return html;
    return html.replace(/<\/section>\s*$/, `${renderR6Panels()}</section>`);
  };
}

const api = Object.freeze({
  schema: "falcon.r6.ai-transfer-sync.v1",
  renderR6Panels,
  currentAIConfiguration,
  saveAI: saveAISettings,
  testAI: testAIConnection,
  disableAI,
  createPackage,
  previewPackage: previewFile,
  importPackage: importPending,
  connect: connectDirectory,
  queuePackage,
  resume: resumeQueue,
  async retry(operationId) {
    const result = await operationQueue.retry(operationId);
    rerender();
    return result;
  },
  queueSnapshot: () => operationQueue.snapshot(),
  activePackage: () => activePackage,
  pendingPreview: () => pendingPreview
});

Object.defineProperty(window, "FalconR6", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api
});

window.addEventListener?.("online", () => {
  operationQueue.resume().then(rerender).catch((error) => console.error(error));
});
window.addEventListener?.("offline", rerender);
document.documentElement.dataset.falconR6 = "ready";
window.dispatchEvent(new CustomEvent("falcon:r6:ready"));
