import {
  FALCON_CANONICAL_DIRECTORIES,
  buildFalconWorkspacePlan,
  createFalconWorkspace,
  normalizeWorkspaceDraft,
  suggestFalconCode,
  suggestFalconName,
  validateFalconManifest
} from "../modules/folders/falcon-workspace.js";

const REGISTRY_KEY = "falcon:workspace:registry:v1";
const DRAFT_KEY = "falcon:workspace:draft:v1";
const runtimeHandles = new Map();
let selectedRootHandle = null;
let activeReceipt = null;
let activeRecordId = null;

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
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sourceManifest() {
  try {
    if (typeof window.buildMissionManifestV466 === "function") return window.buildMissionManifestV466();
  } catch (_error) {}
  return {
    type: "falcon_mission_manifest",
    manifestVersion: "2.0",
    generatedAt: new Date().toISOString(),
    mission: {},
    client: {}
  };
}

function defaultDraft() {
  const manifest = sourceManifest();
  const clientName = manifest.client?.name || "Client";
  const missionName = manifest.mission?.name || "Mission";
  const date = new Date().toISOString().slice(0, 10);
  return normalizeWorkspaceDraft({
    clientName,
    missionName,
    dossierName: suggestFalconName({ clientName, missionName, date }),
    code: suggestFalconCode({ clientName, date }),
    date,
    destinationName: selectedRootHandle?.name
  });
}

function currentDraftFromDom() {
  const fallback = readJson(DRAFT_KEY, defaultDraft());
  return normalizeWorkspaceDraft({
    clientName: document.querySelector("#falcon_workspace_client")?.value || fallback.clientName,
    missionName: document.querySelector("#falcon_workspace_mission")?.value || fallback.missionName,
    dossierName: document.querySelector("#falcon_workspace_name")?.value || fallback.dossierName,
    code: document.querySelector("#falcon_workspace_code")?.value || fallback.code,
    date: fallback.date,
    destinationName: selectedRootHandle?.name || fallback.destinationName
  });
}

function registry() {
  const records = readJson(REGISTRY_KEY, []);
  return Array.isArray(records) ? records : [];
}

function storeReceipt(receipt, origin = "created") {
  const record = {
    id: `${receipt.code}:${receipt.version}:${receipt.savedAt}`,
    code: receipt.code,
    name: receipt.name,
    version: receipt.version,
    displayPath: receipt.displayPath,
    relativePath: receipt.relativePath,
    manifestPath: receipt.manifestPath,
    savedAt: receipt.savedAt,
    status: origin === "restored" ? "restauré" : "enregistré",
    collisionAvoided: Boolean(receipt.collisionAvoided),
    manifest: receipt.manifest
  };
  writeJson(REGISTRY_KEY, [record, ...registry().filter((entry) => entry.id !== record.id)].slice(0, 80));
  activeRecordId = record.id;
  return record;
}

function renderReceipt() {
  const record = activeReceipt || registry().find((entry) => entry.id === activeRecordId);
  if (!record) return "";
  const pathValue = record.displayPath || record.relativePath || "Chemin non communiqué par la plateforme";
  return `<div class="falcon-workspace-receipt" role="status" aria-live="polite">
    <strong>${record.status === "restauré" ? "Dossier restauré" : "Enregistrement confirmé"}</strong>
    <span>${escapeHtml(record.code)} · version ${Number(record.version || 1)}</span>
    <code>${escapeHtml(pathValue)}</code>
    ${record.collisionAvoided ? '<span class="tag orange">Doublon évité · nouvelle version créée</span>' : ""}
  </div>`;
}

function renderRecords() {
  const records = registry();
  if (!records.length) return '<p class="small">Aucun dossier Falcon enregistré sur cet appareil.</p>';
  return `<div class="falcon-workspace-records">${records.slice(0, 8).map((record) => `
    <article class="card">
      <strong>${escapeHtml(record.code)} · ${escapeHtml(record.name)}</strong>
      <div class="small">Version ${Number(record.version || 1)} · ${escapeHtml(record.status || "enregistré")}</div>
      <code>${escapeHtml(record.displayPath || record.relativePath || "Chemin indisponible")}</code>
      <div class="row">
        <button class="btn ghost" type="button" onclick="FalconFolderWorkspace.consult('${escapeHtml(record.id)}')">Consulter</button>
        <button class="btn ghost" type="button" onclick="FalconFolderWorkspace.exportRecord('${escapeHtml(record.id)}')">Exporter le manifeste</button>
        ${runtimeHandles.has(record.id) ? `<button class="btn ghost" type="button" onclick="FalconFolderWorkspace.verifyAccess('${escapeHtml(record.id)}')">Vérifier l’accès</button>` : ""}
      </div>
    </article>`).join("")}</div>`;
}

function renderPanel() {
  const draft = normalizeWorkspaceDraft(readJson(DRAFT_KEY, defaultDraft()));
  const plan = buildFalconWorkspacePlan({
    ...draft,
    destinationName: selectedRootHandle?.name || draft.destinationName
  });
  const fileSystemSupported = typeof window.showDirectoryPicker === "function";
  return `<section class="panel falcon-workspace-panel" data-falcon-workspace="r3">
    <div class="falcon-workspace-heading">
      <div><span class="tag blue">R3 · local et souverain</span><h3>Enregistrer le dossier et créer l’arborescence Falcon</h3></div>
      <span class="tag ${fileSystemSupported ? "green" : "orange"}">${fileSystemSupported ? "Accès système disponible" : "Export manuel disponible"}</span>
    </div>
    <p>Falcon prépare un nom et un code compréhensibles. Vous gardez la main sur leur modification et sur l’emplacement système.</p>
    <div class="grid2 falcon-workspace-fields">
      <label>Client<input id="falcon_workspace_client" value="${escapeHtml(draft.clientName)}" oninput="FalconFolderWorkspace.updateDraft()"></label>
      <label>Mission<input id="falcon_workspace_mission" value="${escapeHtml(draft.missionName)}" oninput="FalconFolderWorkspace.updateDraft()"></label>
      <label>Nom du dossier<input id="falcon_workspace_name" value="${escapeHtml(draft.dossierName)}" oninput="FalconFolderWorkspace.updateDraft()"></label>
      <label>Code Falcon<input id="falcon_workspace_code" value="${escapeHtml(draft.code)}" oninput="FalconFolderWorkspace.updateDraft()"></label>
    </div>
    <div class="falcon-workspace-path">
      <span>Chemin prévu</span>
      <code id="falcon_workspace_path">${escapeHtml(plan.displayPath)}</code>
      <small>Le navigateur masque le chemin système absolu. Le chemin Falcon complet reste affiché et inscrit dans Mission.falcon.</small>
    </div>
    <div class="row">
      <button class="btn ghost" type="button" onclick="FalconFolderWorkspace.selectDestination()">Choisir l’emplacement</button>
      <button class="btn green" type="button" onclick="FalconFolderWorkspace.create()">Créer et enregistrer</button>
      <button class="btn ghost" type="button" onclick="FalconFolderWorkspace.exportCurrent()">Exporter Mission.falcon</button>
      <label class="btn ghost falcon-file-button">Restaurer Mission.falcon<input type="file" accept=".falcon,application/json" onchange="FalconFolderWorkspace.restore(this.files?.[0]);this.value=''"></label>
    </div>
    <p class="small">Protection active : aucun dossier ni manifeste existant n’est écrasé. En cas de doublon, Falcon crée explicitement une version v2, v3…</p>
    ${renderReceipt()}
    <details class="falcon-workspace-tree">
      <summary>Voir l’arborescence normalisée</summary>
      <ul>${FALCON_CANONICAL_DIRECTORIES.map((entry) => `<li><code>${escapeHtml(entry)}</code></li>`).join("")}</ul>
    </details>
    <div class="falcon-workspace-manage">
      <h4>Dossiers retrouvables sur cet appareil</h4>
      ${renderRecords()}
      <p class="small">Le renommage ou le déplacement physique dépend du système. Quand l’API du navigateur ne l’autorise pas, choisissez une nouvelle destination et créez une version : l’original reste intact.</p>
    </div>
  </section>`;
}

function rerender() {
  if (typeof window.render === "function") window.render();
}

function downloadManifest(manifest, fileName = "Mission.falcon") {
  const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}

async function selectDestination() {
  if (typeof window.showDirectoryPicker !== "function") {
    notify("Ce navigateur ne permet pas de choisir un dossier système. Utilisez l’export Mission.falcon.", "warn");
    return null;
  }
  try {
    selectedRootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const draft = currentDraftFromDom();
    writeJson(DRAFT_KEY, { ...draft, destinationName: selectedRootHandle.name });
    notify(`Emplacement sélectionné : ${selectedRootHandle.name}.`, "ok");
    rerender();
    return selectedRootHandle;
  } catch (error) {
    if (error?.name !== "AbortError") notify("L’emplacement n’a pas pu être ouvert en écriture.", "warn");
    return null;
  }
}

async function create() {
  try {
    const draft = currentDraftFromDom();
    writeJson(DRAFT_KEY, draft);
    if (!selectedRootHandle && !(await selectDestination())) return null;
    const receipt = await createFalconWorkspace({
      rootHandle: selectedRootHandle,
      draft,
      sourceManifest: sourceManifest()
    });
    const record = storeReceipt(receipt);
    runtimeHandles.set(record.id, selectedRootHandle);
    activeReceipt = { ...receipt, status: "enregistré" };
    notify(
      receipt.collisionAvoided
        ? `Doublon détecté : la version ${receipt.version} a été créée sans écraser l’original.`
        : "Dossier Falcon enregistré et arborescence créée.",
      "ok"
    );
    rerender();
    return receipt;
  } catch (error) {
    console.error(error);
    notify(error?.message || "L’enregistrement du dossier Falcon a échoué.", "error");
    return null;
  }
}

async function restore(file) {
  if (!file) return null;
  try {
    const validated = validateFalconManifest(JSON.parse(await file.text()));
    const savedAt = new Date().toISOString();
    const receipt = {
      schema: "falcon.workspace.receipt.v1",
      status: "restauré",
      savedAt,
      code: validated.draft.code,
      name: validated.draft.dossierName,
      version: validated.version,
      collisionAvoided: false,
      relativePath: validated.relativePath,
      displayPath: validated.relativePath || "Manifeste restauré · emplacement à sélectionner",
      manifestPath: validated.relativePath ? `${validated.relativePath}/Mission.falcon` : "Mission.falcon",
      manifest: validated.manifest
    };
    storeReceipt(receipt, "restored");
    writeJson(DRAFT_KEY, validated.draft);
    activeReceipt = receipt;
    notify("Mission.falcon restauré et ajouté au registre local.", "ok");
    rerender();
    return receipt;
  } catch (error) {
    notify(error?.message || "Le manifeste sélectionné est invalide.", "error");
    return null;
  }
}

const originalRenderDataControl = window.renderDataControl;
if (typeof originalRenderDataControl === "function") {
  window.renderDataControl = function renderDataControlWithWorkspace() {
    const html = originalRenderDataControl();
    if (String(html).includes('data-falcon-workspace="r3"')) return html;
    return String(html).replace(
      /(<div class="context-bar">[\s\S]*?<\/div>)/,
      `$1${renderPanel()}`
    );
  };
}

const api = Object.freeze({
  renderPanel,
  async selectDestination() { return selectDestination(); },
  async create() { return create(); },
  updateDraft() {
    const draft = currentDraftFromDom();
    writeJson(DRAFT_KEY, draft);
    const pathElement = document.querySelector("#falcon_workspace_path");
    if (pathElement) pathElement.textContent = buildFalconWorkspacePlan(draft).displayPath;
    return draft;
  },
  consult(id) {
    activeRecordId = id;
    activeReceipt = null;
    rerender();
  },
  exportCurrent() {
    const manifest = sourceManifest();
    const draft = currentDraftFromDom();
    const plan = buildFalconWorkspacePlan(draft);
    downloadManifest({
      ...manifest,
      manifestVersion: "2.0",
      workspace: {
        schema: "falcon.workspace.manifest.v1",
        code: draft.code,
        name: draft.dossierName,
        clientName: draft.clientName,
        missionName: draft.missionName,
        version: 1,
        relativePath: plan.missionPath,
        manifestPath: plan.manifestPath,
        canonicalDirectories: FALCON_CANONICAL_DIRECTORIES
      }
    });
    notify("Mission.falcon exporté.", "ok");
  },
  exportRecord(id) {
    const record = registry().find((entry) => entry.id === id);
    if (!record?.manifest) return;
    downloadManifest(record.manifest, `${record.code}-v${record.version}.falcon`);
    notify("Manifeste du dossier exporté.", "ok");
  },
  async verifyAccess(id) {
    const handle = runtimeHandles.get(id);
    if (!handle) {
      notify("Resélectionnez l’emplacement système pour retrouver l’accès physique.", "warn");
      return false;
    }
    const permission = typeof handle.queryPermission === "function"
      ? await handle.queryPermission({ mode: "readwrite" })
      : "granted";
    notify(permission === "granted" ? "Accès physique au dossier vérifié." : "L’accès physique doit être réautorisé.", permission === "granted" ? "ok" : "warn");
    return permission === "granted";
  },
  async restore(file) { return restore(file); },
  registry
});

Object.defineProperty(window, "FalconFolderWorkspace", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api
});

document.documentElement.dataset.falconFolderWorkspace = "ready";
window.dispatchEvent(new CustomEvent("falcon:folder-workspace:ready"));
