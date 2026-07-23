import {
  COMPLETE_PROFILE_CATEGORIES,
  applyCompleteProfileRestore,
  captureCompleteProfile,
  planCompleteProfileRestore,
  validateCompleteProfile
} from "../modules/persistence/complete-profile-vault.js";
import {
  MEDIA_DESTINATIONS,
  createMediaEnvelope,
  updateMediaTransfer,
  verifyMediaIntegrity
} from "../modules/media/media-destination-policy.js";

const DB_NAME = "FalconEnterpriseR4";
const DB_VERSION = 1;
const PROFILE_STORE = "profiles";
const MEDIA_STORE = "media";
const PROFILE_ID = "latest";
const MEDIA_PREFERENCES_KEY = "falcon:media:preferences:v1";
const MEDIA_REGISTRY_KEY = "falcon:media:registry:v1";
const DEVICE_KEY = "falcon:complete-profile:device:v1";
const CATEGORY_LABELS = Object.freeze({
  preferences: "Préférences",
  profilesAndRights: "Profils et droits",
  license: "Licence",
  contacts: "Coordonnées",
  branding: "Chartes, logos et signatures",
  reportModels: "Modèles de rapport",
  workspace: "Chemins et dossiers récents",
  aiAndConnectors: "IA et connecteurs",
  synchronization: "Règles de synchronisation",
  mediaAndGallery: "Médias et galerie",
  exportOptions: "Options d’export"
});

let latestProfile = null;
let captureTimer = null;
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

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function localEntries() {
  const entries = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("falcon")) entries[key] = localStorage.getItem(key);
  }
  return entries;
}

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = `device-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILE_STORE)) db.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB indisponible"));
  });
  return databasePromise;
}

async function databaseGet(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Lecture locale impossible"));
  });
}

async function databasePut(storeName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Écriture locale impossible"));
  });
}

async function captureNow({ announce = true } = {}) {
  const profile = captureCompleteProfile({
    entries: localEntries(),
    appVersion: document.documentElement.dataset.falconEnterpriseRuntime || "48.0.0-rc.1",
    deviceId: deviceId()
  });
  await databasePut(PROFILE_STORE, { id: PROFILE_ID, profile });
  latestProfile = profile;
  document.documentElement.dataset.falconCompleteProfile = "saved";
  if (announce) notify("Point de reprise complet enregistré localement.", "ok");
  return profile;
}

async function restoreLatest({ reload = true } = {}) {
  const stored = await databaseGet(PROFILE_STORE, PROFILE_ID);
  if (!stored?.profile) {
    notify("Aucun point de reprise complet n’est disponible.", "warn");
    return null;
  }
  const validation = validateCompleteProfile(stored.profile);
  if (!validation.valid) {
    notify("Le point de reprise est invalide. Aucune donnée n’a été remplacée.", "error");
    return null;
  }
  const plan = planCompleteProfileRestore(stored.profile, localEntries(), { mode: "replace" });
  const result = applyCompleteProfileRestore({ profile: stored.profile, storage: localStorage, plan });
  sessionStorage.setItem("falcon:complete-profile:last-restore", JSON.stringify({
    at: new Date().toISOString(),
    digest: result.profileDigest,
    written: result.writtenKeys.length
  }));
  notify("Profil complet restauré et vérifié.", "ok");
  if (reload) setTimeout(() => location.reload(), 250);
  return result;
}

function scheduleCapture() {
  clearTimeout(captureTimer);
  captureTimer = setTimeout(() => {
    captureNow({ announce: false }).catch((error) => {
      console.error(error);
      document.documentElement.dataset.falconCompleteProfile = "error";
    });
  }, 1200);
}

function mediaPreferences() {
  const stored = readJson(MEDIA_PREFERENCES_KEY, {});
  return {
    destination: Object.values(MEDIA_DESTINATIONS).includes(stored.destination)
      ? stored.destination
      : MEDIA_DESTINATIONS.FALCON_ONLY,
    nativeShare: stored.nativeShare !== false,
    export: stored.export || { format: "original" }
  };
}

function mediaRegistry() {
  const stored = readJson(MEDIA_REGISTRY_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function storeMediaEnvelope(envelope) {
  writeJson(MEDIA_REGISTRY_KEY, [envelope, ...mediaRegistry().filter((entry) => entry.id !== envelope.id)].slice(0, 200));
}

function sourceContext() {
  let manifest = {};
  try { manifest = window.buildMissionManifestV466?.() || {}; } catch (_error) {}
  let observation = null;
  try { observation = window.activeObs?.() || null; } catch (_error) {}
  return {
    missionId: manifest.mission?.id || "mission-locale",
    observationId: observation?.id || "dossier-media",
    context: observation?.title || observation?.location || observation?.constat || manifest.mission?.name || "Dossier Falcon"
  };
}

async function saveMediaFile(file) {
  if (!file) return null;
  const preferences = mediaPreferences();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let envelope = await createMediaEnvelope({
    bytes,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    destination: preferences.destination,
    ...sourceContext()
  });
  const integrity = await verifyMediaIntegrity(envelope, bytes);
  if (!integrity.valid) throw new Error("L’intégrité du média n’est pas vérifiée.");

  if (envelope.destination !== MEDIA_DESTINATIONS.GALLERY_ONLY) {
    await databasePut(MEDIA_STORE, {
      id: envelope.id,
      fileName: envelope.fileName,
      mimeType: envelope.mimeType,
      bytes,
      digest: envelope.integrity.digest,
      storedAt: new Date().toISOString()
    });
    envelope = updateMediaTransfer(envelope, { local: "stored" });
  }

  if (envelope.destination !== MEDIA_DESTINATIONS.FALCON_ONLY) {
    const shareFile = new File([bytes], envelope.fileName, { type: envelope.mimeType });
    if (preferences.nativeShare && navigator.share && (!navigator.canShare || navigator.canShare({ files: [shareFile] }))) {
      try {
        await navigator.share({ files: [shareFile], title: "Média Falcon", text: envelope.context });
        envelope = updateMediaTransfer(envelope, { gallery: "share-requested" });
      } catch (error) {
        if (error?.name !== "AbortError") envelope = updateMediaTransfer(envelope, { gallery: "error" });
      }
    } else {
      envelope = updateMediaTransfer(envelope, { gallery: "pending" });
    }
  }

  envelope = Object.freeze({ ...envelope, integrityVerifiedAt: new Date().toISOString() });
  storeMediaEnvelope(envelope);
  scheduleCapture();
  notify(
    envelope.transfer.gallery === "share-requested"
      ? "Média vérifié. Confirmez sa présence dans la galerie après le partage natif."
      : "Média vérifié et enregistré selon la destination choisie.",
    "ok"
  );
  rerender();
  return envelope;
}

async function verifyStoredMedia(id) {
  const envelope = mediaRegistry().find((entry) => entry.id === id);
  if (!envelope) return false;
  const record = await databaseGet(MEDIA_STORE, id);
  if (!record?.bytes) {
    notify("Le mode Galerie uniquement ne conserve pas de copie binaire dans Falcon.", "warn");
    return false;
  }
  const verification = await verifyMediaIntegrity(envelope, record.bytes);
  notify(verification.valid ? "Intégrité du média local vérifiée." : "Intégrité du média invalide.", verification.valid ? "ok" : "error");
  return verification.valid;
}

function confirmGallery(id) {
  const records = mediaRegistry();
  const target = records.find((entry) => entry.id === id);
  if (!target) return false;
  const updated = updateMediaTransfer(target, { gallery: "confirmed" });
  writeJson(MEDIA_REGISTRY_KEY, records.map((entry) => entry.id === id ? updated : entry));
  scheduleCapture();
  notify("Présence dans la galerie confirmée par l’utilisateur.", "ok");
  rerender();
  return true;
}

function destinationLabel(value) {
  return ({
    [MEDIA_DESTINATIONS.FALCON_ONLY]: "Falcon uniquement",
    [MEDIA_DESTINATIONS.GALLERY_ONLY]: "Galerie uniquement",
    [MEDIA_DESTINATIONS.FALCON_AND_GALLERY]: "Falcon et galerie"
  })[value] || value;
}

function transferLabel(envelope) {
  if (envelope.transfer.gallery === "confirmed") return "Galerie confirmée";
  if (envelope.transfer.gallery === "share-requested") return "Partage galerie à confirmer";
  if (envelope.transfer.gallery === "error") return "Erreur de partage";
  if (envelope.transfer.local === "stored") return "Stocké dans Falcon";
  return "Local · en attente";
}

function renderCoverage() {
  const coverage = latestProfile?.payload?.coverage || {};
  return `<div class="falcon-profile-coverage">${COMPLETE_PROFILE_CATEGORIES.map((category) => {
    const covered = coverage[category]?.covered;
    return `<div class="card"><span class="tag ${covered ? "green" : "orange"}">${covered ? "Restaurable" : "À renseigner"}</span><strong>${escapeHtml(CATEGORY_LABELS[category])}</strong></div>`;
  }).join("")}</div>`;
}

function renderMediaRecords() {
  const records = mediaRegistry();
  if (!records.length) return '<p class="small">Aucun média géré par la politique R4.</p>';
  return `<div class="falcon-media-records">${records.slice(0, 12).map((entry) => `
    <article class="card">
      <strong>${escapeHtml(entry.fileName)}</strong>
      <span class="tag neutral">${escapeHtml(destinationLabel(entry.destination))}</span>
      <div class="small">${escapeHtml(entry.missionId)} · ${escapeHtml(entry.observationId)} · ${escapeHtml(entry.createdAt)}</div>
      <code>${escapeHtml(entry.relativePath)}</code>
      <div class="small">SHA-256 · ${escapeHtml(entry.integrity.digest.slice(0, 18))}…</div>
      <span class="tag ${entry.transfer.gallery === "error" ? "red" : entry.transfer.gallery === "confirmed" || entry.transfer.local === "stored" ? "green" : "orange"}">${escapeHtml(transferLabel(entry))}</span>
      <div class="row">
        ${entry.localReference ? `<button class="btn ghost" type="button" onclick="FalconPersistenceMedia.verifyMedia('${escapeHtml(entry.id)}')">Vérifier l’intégrité</button>` : ""}
        ${entry.transfer.gallery === "share-requested" ? `<button class="btn green" type="button" onclick="FalconPersistenceMedia.confirmGallery('${escapeHtml(entry.id)}')">Confirmer dans la galerie</button>` : ""}
      </div>
    </article>`).join("")}</div>`;
}

function renderPanel() {
  const preferences = mediaPreferences();
  const restored = readJson("falcon:complete-profile:last-restore", null)
    || (() => { try { return JSON.parse(sessionStorage.getItem("falcon:complete-profile:last-restore") || "null"); } catch { return null; } })();
  return `<section class="panel falcon-persistence-media-panel" data-falcon-persistence-media="r4">
    <div class="section-title">
      <div><span class="tag purple">R4 · reprise complète</span><h3>Persistance complète et médias</h3></div>
      <span class="tag ${latestProfile ? "green" : "orange"}">${latestProfile ? "Point de reprise actif" : "Initialisation locale"}</span>
    </div>
    <p>Falcon conserve localement les réglages, identités, droits, licence, modèles, chemins, IA, synchronisation, médias et options d’export. Aucun cloud n’est requis.</p>
    ${renderCoverage()}
    <div class="row">
      <button class="btn green" type="button" onclick="FalconPersistenceMedia.capture()">Créer un point de reprise</button>
      <button class="btn ghost" type="button" onclick="FalconPersistenceMedia.restore()">Restaurer le dernier point</button>
    </div>
    <div class="small">${latestProfile ? `Dernière capture : ${escapeHtml(latestProfile.capturedAt)} · ${latestProfile.entryCount} clés · ${escapeHtml(latestProfile.integrity.digest)}` : "Le premier point de reprise est créé automatiquement."}${restored ? ` · Dernière restauration vérifiée : ${escapeHtml(restored.at || "")}` : ""}</div>
    <hr>
    <div class="falcon-media-heading"><div><h4>Destination des photos, vidéos et sons</h4><p class="small">Chaque média reçoit un identifiant, une date, un contexte, une référence locale et une empreinte SHA-256.</p></div></div>
    <div class="grid3 falcon-media-destinations">
      ${[
        [MEDIA_DESTINATIONS.FALCON_ONLY, "Falcon uniquement", "Conserve une copie locale dans Falcon."],
        [MEDIA_DESTINATIONS.GALLERY_ONLY, "Galerie uniquement", "Passe par le partage natif sans copie binaire Falcon."],
        [MEDIA_DESTINATIONS.FALCON_AND_GALLERY, "Falcon et galerie", "Conserve la copie Falcon puis ouvre le partage natif."]
      ].map(([value, label, detail]) => `<label class="card"><input type="radio" name="falcon_media_destination" value="${value}" ${preferences.destination === value ? "checked" : ""} onchange="FalconPersistenceMedia.setDestination(this.value)"><strong>${label}</strong><span class="small">${detail}</span></label>`).join("")}
    </div>
    <div class="row">
      <label class="btn green falcon-file-button">Ajouter un média<input type="file" accept="image/*,video/*,audio/*" onchange="FalconPersistenceMedia.addMedia(this.files?.[0]);this.value=''"></label>
    </div>
    <p class="small">Android : Falcon ouvre le partage natif lorsqu’une destination Galerie est choisie. Après le retour dans Falcon, le bouton « Confirmer dans la galerie » consigne la vérification humaine ; aucune présence n’est déclarée silencieusement.</p>
    ${renderMediaRecords()}
  </section>`;
}

function rerender() {
  if (typeof window.render === "function") window.render();
}

const originalRenderDataControl = window.renderDataControl;
if (typeof originalRenderDataControl === "function") {
  window.renderDataControl = function renderDataControlWithPersistenceMedia() {
    const html = originalRenderDataControl();
    if (String(html).includes('data-falcon-persistence-media="r4"')) return html;
    const folderPanelEnd = /(<section class="panel falcon-workspace-panel"[\s\S]*?<\/section>)/;
    if (folderPanelEnd.test(html)) return String(html).replace(folderPanelEnd, `$1${renderPanel()}`);
    return String(html).replace(/(<div class="context-bar">[\s\S]*?<\/div>)/, `$1${renderPanel()}`);
  };
}

const api = Object.freeze({
  renderPanel,
  async capture() {
    const profile = await captureNow();
    rerender();
    return profile;
  },
  async restore() {
    if (typeof window.falconConfirmV434 === "function") {
      window.falconConfirmV434(
        "Restaurer le profil complet",
        "Les réglages actuels seront remplacés par le dernier point local vérifié. Le dossier sera rechargé après restauration.",
        () => restoreLatest()
      );
      return null;
    }
    return restoreLatest();
  },
  async restoreDirect(options = {}) { return restoreLatest(options); },
  setDestination(value) {
    const preferences = { ...mediaPreferences(), destination: value };
    writeJson(MEDIA_PREFERENCES_KEY, preferences);
    scheduleCapture();
    notify(`Destination média : ${destinationLabel(value)}.`, "ok");
    return preferences;
  },
  async addMedia(file) {
    try { return await saveMediaFile(file); }
    catch (error) {
      console.error(error);
      notify(error?.message || "Le média n’a pas pu être enregistré.", "error");
      return null;
    }
  },
  async verifyMedia(id) { return verifyStoredMedia(id); },
  confirmGallery,
  mediaRegistry,
  latestProfile: () => latestProfile
});

Object.defineProperty(window, "FalconPersistenceMedia", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api
});

async function initialize() {
  try {
    const stored = await databaseGet(PROFILE_STORE, PROFILE_ID);
    latestProfile = stored?.profile && validateCompleteProfile(stored.profile).valid ? stored.profile : null;
    await captureNow({ announce: false });
    document.documentElement.dataset.falconPersistenceMedia = "ready";
    window.dispatchEvent(new CustomEvent("falcon:persistence-media:ready"));
    if (document.querySelector('[data-falcon-persistence-media="r4"]')) rerender();
  } catch (error) {
    console.error(error);
    document.documentElement.dataset.falconPersistenceMedia = "degraded";
  }
}

window.addEventListener?.("storage", scheduleCapture);
document.addEventListener?.("change", scheduleCapture, true);
document.addEventListener?.("input", scheduleCapture, true);
if (typeof indexedDB !== "undefined") {
  initialize();
} else {
  document.documentElement.dataset.falconPersistenceMedia = "unavailable";
}
