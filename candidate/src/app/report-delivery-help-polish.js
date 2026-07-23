import {
  buildStandaloneReport,
  createDeliveryReceipt,
  deliveryCapabilities
} from "../modules/export/report-delivery-policy.js";
import { FALCON_HELP_TOPICS } from "../modules/help/help-center-content.js";

const RECEIPTS_KEY = "falcon:report:delivery-receipts:v1";
let actionPanelCollapsed = false;

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

function receipts() {
  try {
    const value = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function recordReceipt(artifact, details) {
  const receipt = createDeliveryReceipt(artifact, details);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt, ...receipts()].slice(0, 100)));
  return receipt;
}

function reportArtifact() {
  const report = document.querySelector(".report");
  if (!report) throw new Error("Générez ou affichez le rapport avant sa diffusion.");
  const title = report.querySelector("h1")?.textContent?.trim() || "Rapport Falcon";
  return buildStandaloneReport({
    title,
    reportHtml: report.outerHTML,
    sourceCommit: document.documentElement.dataset.falconSourceCommit || "runtime-local"
  });
}

function artifactFile(artifact) {
  return new File([artifact.bytes], artifact.fileName, { type: `${artifact.mimeType};charset=utf-8` });
}

function downloadArtifact(artifact) {
  const url = URL.createObjectURL(new Blob([artifact.bytes], { type: artifact.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function writeWithPicker(artifact, { connectedSpace = false } = {}) {
  if (typeof window.showSaveFilePicker !== "function") {
    downloadArtifact(artifact);
    return recordReceipt(artifact, {
      action: connectedSpace ? "connected-space" : "save-as",
      status: "completed",
      destination: "téléchargements locaux",
      detail: "Sélecteur système indisponible ; téléchargement local utilisé."
    });
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: artifact.fileName,
      startIn: "documents",
      types: [{ description: "Rapport Falcon HTML", accept: { "text/html": [".html"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(artifact.bytes);
    await writable.close();
    return recordReceipt(artifact, {
      action: connectedSpace ? "connected-space" : "save-as",
      status: "completed",
      destination: handle.name || (connectedSpace ? "espace connecté choisi" : "emplacement choisi"),
      detail: connectedSpace
        ? "Emplacement explicitement choisi par l’utilisateur ; Falcon n’active aucun cloud."
        : "Fichier écrit et fermé par le sélecteur système."
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return recordReceipt(artifact, {
        action: connectedSpace ? "connected-space" : "save-as",
        status: "cancelled",
        destination: "aucune"
      });
    }
    throw error;
  }
}

async function nativeShare(artifact, action, title) {
  const file = artifactFile(artifact);
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ title, text: artifact.title, files: [file] });
      return recordReceipt(artifact, {
        action,
        status: "requested",
        destination: "partage natif",
        detail: "Le système a pris en charge le fichier."
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return recordReceipt(artifact, { action, status: "cancelled", destination: "partage natif" });
      }
      throw error;
    }
  }
  downloadArtifact(artifact);
  return recordReceipt(artifact, {
    action,
    status: "completed",
    destination: "téléchargements locaux",
    detail: "Partage de fichier indisponible ; copie locale préparée."
  });
}

function capabilitySnapshot() {
  return deliveryCapabilities({
    showSaveFilePicker: typeof window.showSaveFilePicker === "function",
    print: typeof window.print === "function",
    share: typeof navigator.share === "function",
    canShareFiles: typeof navigator.canShare !== "function" || navigator.canShare({ files: [new File(["x"], "x.txt", { type: "text/plain" })] }),
    requestFullscreen: Boolean(document.documentElement.requestFullscreen)
  });
}

function renderDeliveryPanel() {
  const capabilities = capabilitySnapshot();
  const latest = receipts()[0];
  return `<section class="panel falcon-report-delivery-shell ${actionPanelCollapsed ? "is-collapsed" : ""}" data-falcon-report-delivery="r5">
    <div class="section-title">
      <div><span class="tag blue">Diffusion maîtrisée</span><h3>Enregistrer, imprimer et partager</h3></div>
      <button class="btn ghost" type="button" onclick="FalconReportDelivery.togglePanel()">${actionPanelCollapsed ? "Déployer" : "Replier"}</button>
    </div>
    <div class="falcon-report-delivery-content">
      <p>Le rapport reste local jusqu’à une action explicite. Vérifiez son statut, son destinataire et son emplacement avant diffusion.</p>
      <div class="falcon-report-actions">
        <button class="btn green" type="button" onclick="FalconReportDelivery.save()">Enregistrer</button>
        <button class="btn ghost" type="button" onclick="FalconReportDelivery.saveAs()">Enregistrer sous</button>
        <button class="btn primary" type="button" onclick="FalconReportDelivery.print()">Imprimer</button>
        <button class="btn primary" type="button" onclick="FalconReportDelivery.share()">Partager</button>
        <button class="btn ghost" type="button" onclick="FalconReportDelivery.email()">Envoyer par mail</button>
        <button class="btn ghost" type="button" onclick="FalconReportDelivery.openWith()">Ouvrir dans une application compatible</button>
        <button class="btn ghost" type="button" onclick="FalconReportDelivery.connectedSpace()">Exporter vers un espace connecté</button>
        <button class="btn ghost" type="button" onclick="FalconReportDelivery.fullscreen()">Lire en plein écran</button>
      </div>
      <p class="small">Partage natif : ${capabilities.nativeShare ? "disponible" : "indisponible, téléchargement local de secours"} · Enregistrer sous : ${capabilities.saveAs ? "sélecteur système disponible" : "téléchargement local"} · Espace connecté : choisissez explicitement un dossier monté par votre organisation.</p>
      ${latest ? `<div class="falcon-delivery-receipt"><span class="tag ${latest.status === "error" ? "red" : latest.status === "cancelled" ? "orange" : "green"}">${escapeHtml(latest.status)}</span><strong>${escapeHtml(latest.action)}</strong><span class="small">${escapeHtml(latest.destination)} · ${escapeHtml(latest.recordedAt)}</span></div>` : ""}
    </div>
  </section>`;
}

function renderHelpCenter() {
  return `<section class="panel falcon-help-center" data-falcon-help-center="r5">
    <div class="section-title"><div><span class="tag purple">Aide locale</span><h3>Centre d’aide ❔</h3></div><span class="tag green">${FALCON_HELP_TOPICS.length} rubriques</span></div>
    <p>Ces repères restent disponibles hors connexion et ne transmettent aucune donnée.</p>
    <div class="falcon-help-topics">${FALCON_HELP_TOPICS.map((topic) => `<details id="falcon-help-${escapeHtml(topic.id)}"><summary>${escapeHtml(topic.title)}</summary><p>${escapeHtml(topic.body)}</p></details>`).join("")}</div>
  </section>`;
}

function rerender() {
  if (typeof window.render === "function") window.render();
}

const originalRenderReport = window.renderReport;
if (typeof originalRenderReport === "function") {
  window.renderReport = function renderReportWithDelivery() {
    const html = String(originalRenderReport());
    if (html.includes('data-falcon-report-delivery="r5"')) return html;
    return html.replace('<section class="view">', `<section class="view">${renderDeliveryPanel()}`);
  };
}

const originalRenderDataControl = window.renderDataControl;
if (typeof originalRenderDataControl === "function") {
  window.renderDataControl = function renderDataControlWithHelp() {
    const html = String(originalRenderDataControl());
    if (html.includes('data-falcon-help-center="r5"')) return html;
    return html.replace(/<\/section>\s*$/, `${renderHelpCenter()}</section>`);
  };
}

const api = Object.freeze({
  renderDeliveryPanel,
  renderHelpCenter,
  receipts,
  capabilities: capabilitySnapshot,
  save() {
    const artifact = reportArtifact();
    downloadArtifact(artifact);
    const receipt = recordReceipt(artifact, { action: "save", status: "completed", destination: "téléchargements locaux" });
    notify("Rapport enregistré localement.", "ok");
    rerender();
    return receipt;
  },
  async saveAs() {
    const receipt = await writeWithPicker(reportArtifact());
    notify(receipt.status === "completed" ? "Rapport enregistré dans l’emplacement choisi." : "Enregistrement annulé.", receipt.status === "completed" ? "ok" : "warn");
    rerender();
    return receipt;
  },
  print() {
    const artifact = reportArtifact();
    window.print();
    const receipt = recordReceipt(artifact, { action: "print", status: "requested", destination: "dialogue d’impression A4" });
    notify("Dialogue d’impression ouvert.", "ok");
    return receipt;
  },
  async share() {
    const receipt = await nativeShare(reportArtifact(), "share", "Partager le rapport Falcon");
    notify("Rapport remis au partage système.", "ok");
    rerender();
    return receipt;
  },
  async email() {
    const artifact = reportArtifact();
    if (navigator.share) {
      const receipt = await nativeShare(artifact, "email", "Envoyer le rapport Falcon par mail");
      notify("Choisissez votre application de messagerie dans le partage système.", "ok");
      rerender();
      return receipt;
    }
    const anchor = document.createElement("a");
    anchor.href = `mailto:?subject=${encodeURIComponent(artifact.title)}&body=${encodeURIComponent("Le rapport Falcon a été enregistré localement. Ajoutez le fichier HTML à ce message après vérification du destinataire.")}`;
    anchor.click();
    const receipt = recordReceipt(artifact, { action: "email", status: "requested", destination: "application de messagerie", detail: "Le fichier reste à joindre manuellement." });
    rerender();
    return receipt;
  },
  async openWith() {
    const receipt = await nativeShare(reportArtifact(), "open-with", "Ouvrir le rapport Falcon");
    notify("Choisissez une application compatible.", "ok");
    rerender();
    return receipt;
  },
  async connectedSpace() {
    const receipt = await writeWithPicker(reportArtifact(), { connectedSpace: true });
    notify(receipt.status === "completed" ? "Rapport écrit dans l’espace explicitement choisi." : "Export annulé.", receipt.status === "completed" ? "ok" : "warn");
    rerender();
    return receipt;
  },
  async fullscreen() {
    const target = document.querySelector(".report");
    if (target?.requestFullscreen) {
      await target.requestFullscreen();
      return true;
    }
    target?.classList.toggle("falcon-report-fullscreen-fallback");
    return Boolean(target);
  },
  togglePanel() {
    actionPanelCollapsed = !actionPanelCollapsed;
    rerender();
    return actionPanelCollapsed;
  }
});

Object.defineProperty(window, "FalconReportDelivery", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api
});

document.documentElement.dataset.falconReportDelivery = "ready";
