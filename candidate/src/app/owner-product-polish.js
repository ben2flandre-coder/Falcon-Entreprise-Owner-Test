const THEME_KEY = "falcon_owner_theme_v1";
const LEGACY_THEME_KEYS = Object.freeze([
  THEME_KEY,
  "falcon_theme_v1",
  "falcon_theme",
  "falconTheme",
  "theme"
]);

function normalizeTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

function themeFromStoredState() {
  try {
    const raw = localStorage.getItem("falcon_radar_360_v36_state");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeTheme(parsed?.ui?.theme) || normalizeTheme(parsed?.theme);
  } catch (_error) {
    return null;
  }
}

function readPreferredTheme() {
  try {
    for (const key of LEGACY_THEME_KEYS) {
      const value = normalizeTheme(localStorage.getItem(key));
      if (value) return value;
    }
  } catch (_error) {}
  return themeFromStoredState() || "dark";
}

function persistTheme(theme) {
  const normalized = normalizeTheme(theme);
  if (!normalized) return;
  try {
    localStorage.setItem(THEME_KEY, normalized);
  } catch (_error) {}
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme) || "dark";
  const root = document?.documentElement;
  if (root?.dataset) root.dataset.theme = normalized;
  if (root?.style) root.style.colorScheme = normalized;
  persistTheme(normalized);
  return normalized;
}

function replaceVisibleText(root = document?.body) {
  if (!root || typeof document?.createTreeWalker !== "function" || typeof NodeFilter === "undefined") return;
  const replacements = new Map([
    ["Showcase Edition S1+", "Enterprise"],
    ["V46.5.0-SHOWCASE-V1.0", "Falcon Enterprise"],
    ["Usine Alpha — Audit sécurité opérationnelle", "Aucun dossier actif"],
    ["Charge la démo avancée ou démarre le cadrage mission.", "Créez ou ouvrez un dossier pour démarrer le cadrage de mission."],
    ["SHOWCASE", "ENTERPRISE"]
  ]);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let next = node.nodeValue || "";
    for (const [needle, replacement] of replacements) next = next.replaceAll(needle, replacement);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
}

function isolateDemonstrationActions(root = document) {
  if (typeof root?.querySelectorAll !== "function") return;
  for (const button of root.querySelectorAll("button")) {
    const label = button.textContent?.trim() || "";
    if (/^Charger démo avancée$/i.test(label)) {
      button.hidden = true;
      button.setAttribute?.("aria-hidden", "true");
      button.tabIndex = -1;
      if (button.dataset) button.dataset.falconDemoAction = "isolated";
    }
  }
}

function applyProductIdentity() {
  if (typeof document === "undefined") return;
  document.title = "Falcon Enterprise";
  if (document.documentElement?.dataset) document.documentElement.dataset.falconProduct = "enterprise";
  replaceVisibleText();
  isolateDemonstrationActions();
}

const initialTheme = applyTheme(readPreferredTheme());

function observeRuntimeChanges() {
  if (typeof MutationObserver === "function" && document?.documentElement) {
    const observer = new MutationObserver(() => {
      const current = normalizeTheme(document.documentElement.dataset?.theme);
      if (current) persistTheme(current);
      applyProductIdentity();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
      childList: true,
      subtree: true
    });
  }

  if (typeof document?.addEventListener === "function") {
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".theme-btn")) return;
      queueMicrotask(() => applyTheme(document.documentElement?.dataset?.theme || initialTheme));
    }, true);
  }
}

if (typeof document !== "undefined" && document.readyState === "loading") {
  document.addEventListener?.("DOMContentLoaded", () => {
    applyProductIdentity();
    observeRuntimeChanges();
  }, { once: true });
} else {
  applyProductIdentity();
  observeRuntimeChanges();
}

export const FalconOwnerProductPolish = Object.freeze({
  themeKey: THEME_KEY,
  readPreferredTheme,
  applyTheme,
  applyProductIdentity
});
