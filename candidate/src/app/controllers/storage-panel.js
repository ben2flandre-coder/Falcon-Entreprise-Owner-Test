import { createStorageEngine } from "../../modules/storage/storage-engine.js";

const STORAGE_PROBE_KEY = "falcon_v48_storage_probe";

function textElement(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function mutedMessage(text) {
  return textElement("p", text, "muted");
}

function storageCard(title, label, className = "") {
  const card = document.createElement("article");
  card.className = `storage-card${className ? ` ${className}` : ""}`;
  card.append(textElement("strong", title), textElement("span", label));
  return card;
}

export function setupStoragePanel({
  appVersion,
  status,
  summary,
  valueInput,
  writeButton,
  readButton,
  removeButton,
  result,
  log
}) {
  let engine = null;

  function setResult(message, tone = "neutral") {
    result.className = `storage-result ${tone}`;
    result.textContent = message;
  }

  function renderLog() {
    if (!engine) {
      log.replaceChildren(mutedMessage("Moteur indisponible."));
      return;
    }
    const entries = engine.recentAccesses();
    log.replaceChildren();
    if (entries.length === 0) {
      log.replaceChildren(mutedMessage("Aucun accès enregistré."));
      return;
    }
    for (const entry of entries.slice(0, 8)) {
      const row = document.createElement("article");
      row.className = `storage-log-row${entry.ok ? "" : " error"}`;
      row.append(
        textElement("strong", entry.operation),
        textElement("span", entry.key),
        textElement("small", `${entry.ok ? "OK" : "ÉCHEC"} · ${entry.origin} · ${entry.kb ?? 0} Ko`)
      );
      log.append(row);
    }
  }

  function renderSummary() {
    if (!engine) {
      summary.replaceChildren(storageCard("Indisponible", "localStorage inaccessible", "error"));
      return;
    }
    const estimate = engine.estimate("falcon");
    const probeExists = engine.exists(STORAGE_PROBE_KEY);
    summary.replaceChildren(
      storageCard(String(estimate.keys), "clés Falcon locales"),
      storageCard(`${estimate.usedKb} Ko`, "volume Falcon estimé"),
      storageCard(probeExists ? "Présente" : "Absente", "clé d’essai V48", probeExists ? "ok" : "neutral")
    );
  }

  function refresh() {
    renderSummary();
    renderLog();
  }

  try {
    engine = createStorageEngine({ backend: window.localStorage, appVersion });
    status.textContent = "Opérationnel";
    status.classList.add("ok");
    setResult("Moteur prêt. Aucune donnée historique n’a été touchée.");
  } catch (error) {
    status.textContent = "Indisponible";
    status.classList.add("error");
    setResult(`Initialisation impossible : ${error.message}`, "error");
    writeButton.disabled = true;
    readButton.disabled = true;
    removeButton.disabled = true;
  }

  writeButton.addEventListener("click", () => {
    const written = engine?.set(STORAGE_PROBE_KEY, valueInput.value.trim(), { origin: "v48-ui-probe" });
    setResult(written ? "Écriture de test confirmée." : "Écriture impossible.", written ? "success" : "error");
    refresh();
  });

  readButton.addEventListener("click", () => {
    const value = engine?.get(STORAGE_PROBE_KEY, null, { origin: "v48-ui-probe" });
    if (value === null) setResult("Aucune valeur de test enregistrée.", "warning");
    else {
      valueInput.value = value;
      setResult(`Valeur lue : ${value}`, "success");
    }
    refresh();
  });

  removeButton.addEventListener("click", () => {
    const removed = engine?.remove(STORAGE_PROBE_KEY, { origin: "v48-ui-probe" });
    setResult(removed ? "Clé de test supprimée." : "Suppression impossible.", removed ? "success" : "error");
    refresh();
  });

  refresh();
  return Object.freeze({ engine, refresh, isReady: () => Boolean(engine) });
}
