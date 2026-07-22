const THEME_KEY = "falcon_owner_theme_v1";
const LEGACY_THEME_KEYS = Object.freeze([
  THEME_KEY,
  "falcon_theme_v1",
  "falcon_theme",
  "falconTheme",
  "theme"
]);
const OWNER_TEST_FRESH = typeof location !== "undefined" && new URLSearchParams(location.search).get("ownerTest") === "fresh";

function normalizeTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

function themeFromStoredState() {
  try {
    const raw = localStorage.getItem("falcon_radar_360_v36_state");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeTheme(parsed?.ui?.theme) || normalizeTheme(parsed?.theme);
  } catch (_error) { return null; }
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
  try { localStorage.setItem(THEME_KEY, normalized); } catch (_error) {}
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme) || "dark";
  const root = document?.documentElement;
  if (root?.dataset?.theme !== normalized) root.dataset.theme = normalized;
  if (root?.style?.colorScheme !== normalized) root.style.colorScheme = normalized;
  persistTheme(normalized);
  return normalized;
}

function clearLegacyProductState() {
  if (!OWNER_TEST_FRESH) return;
  try {
    const preservedTheme = readPreferredTheme();
    localStorage.removeItem("falcon_radar_360_v36_state");
    localStorage.removeItem("falcon_demo_mode");
    localStorage.removeItem("falcon_demo_scenario");
    persistTheme(preservedTheme);
    sessionStorage.setItem("falcon_owner_fresh_entry_v1", "pending");
  } catch (_error) {}
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
    if (!/^Charger démo avancée$/i.test(label)) continue;
    if (!button.hidden) button.hidden = true;
    if (button.getAttribute?.("aria-hidden") !== "true") button.setAttribute?.("aria-hidden", "true");
    if (button.tabIndex !== -1) button.tabIndex = -1;
    if (button.dataset?.falconDemoAction !== "isolated") button.dataset.falconDemoAction = "isolated";
  }
}

function openCanonicalHome() {
  if (!OWNER_TEST_FRESH || typeof document?.querySelectorAll !== "function") return;
  const candidates = [...document.querySelectorAll("button,a")];
  const home = candidates.find((element) => /^Accueil$/i.test(element.textContent?.trim() || ""));
  if (home && typeof home.click === "function") home.click();
  try {
    sessionStorage.setItem("falcon_owner_fresh_entry_v1", "done");
    const url = new URL(location.href);
    url.searchParams.delete("ownerTest");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch (_error) {}
}

let applyingIdentity = false;
function applyProductIdentity() {
  if (typeof document === "undefined" || applyingIdentity) return;
  applyingIdentity = true;
  try {
    if (document.title !== "Falcon Enterprise") document.title = "Falcon Enterprise";
    if (document.documentElement?.dataset?.falconProduct !== "enterprise") document.documentElement.dataset.falconProduct = "enterprise";
    replaceVisibleText();
    isolateDemonstrationActions();
  } finally { applyingIdentity = false; }
}

clearLegacyProductState();
const initialTheme = applyTheme(readPreferredTheme());

function observeRuntimeChanges() {
  if (typeof MutationObserver === "function" && document?.body) {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        applyProductIdentity();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (typeof MutationObserver === "function" && document?.documentElement) {
    const themeObserver = new MutationObserver(() => {
      const current = normalizeTheme(document.documentElement.dataset?.theme);
      if (current) persistTheme(current);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  if (typeof document?.addEventListener === "function") {
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".theme-btn")) return;
      queueMicrotask(() => applyTheme(document.documentElement?.dataset?.theme || initialTheme));
    }, true);
  }
}

function initializeOwnerProduct() {
  applyProductIdentity();
  observeRuntimeChanges();
  if (OWNER_TEST_FRESH) {
    requestAnimationFrame(() => requestAnimationFrame(openCanonicalHome));
    setTimeout(openCanonicalHome, 600);
  }
}

if (typeof document !== "undefined" && document.readyState === "loading") {
  document.addEventListener?.("DOMContentLoaded", initializeOwnerProduct, { once: true });
} else {
  initializeOwnerProduct();
}

export const FalconOwnerProductPolish = Object.freeze({
  themeKey: THEME_KEY,
  readPreferredTheme,
  applyTheme,
  applyProductIdentity,
  clearLegacyProductState,
  openCanonicalHome
});
