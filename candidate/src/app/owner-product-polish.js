const THEME_KEY = "falcon_owner_theme_v1";
const LEGACY_THEME_KEYS = Object.freeze([
  THEME_KEY,
  "falcon_theme_v1",
  "falcon_theme",
  "falconTheme",
  "theme"
]);
const OWNER_TEST_FRESH = typeof location !== "undefined" && new URLSearchParams(location.search).get("ownerTest") === "fresh";
const PRODUCT_IDENTITY = Object.freeze({
  name: "Falcon Radar 360",
  edition: "Entreprise",
  title: "Falcon Radar 360 — Entreprise",
  purpose: "Aide à la décision en prévention des risques professionnels"
});

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

function toggleTheme() {
  const current = normalizeTheme(document?.documentElement?.dataset?.theme) || readPreferredTheme();
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
  try {
    const raw = localStorage.getItem("falcon_radar_360_v36_state");
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.ui = { ...(parsed.ui || {}), theme: next };
      parsed.theme = next;
      localStorage.setItem("falcon_radar_360_v36_state", JSON.stringify(parsed));
    }
  } catch (_error) {}
  window.dispatchEvent?.(new CustomEvent("falcon:theme:changed", { detail: { theme: next } }));
  return next;
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
    ["Showcase Edition S1+", "Version Entreprise"],
    ["Showcase Edition S1", "Version Entreprise"],
    ["V46.5.0-SHOWCASE-V1.0", PRODUCT_IDENTITY.title],
    ["Usine Alpha — Audit sécurité opérationnelle", "Aucun dossier actif"],
    ["Charge la démo avancée ou démarre le cadrage mission.", "Créez ou ouvrez un dossier pour démarrer le cadrage de mission."],
    ["Sprint 5 — Scénarios métier immersifs", "Démonstrations métier complètes"],
    ["S5 scénarios", "6 secteurs prêts"],
    ["Charger scénario S5 —", "Charger la démonstration —"],
    ["Scénario S5 chargé", "Démonstration chargée"],
    ["Scénario S5", "Démonstration métier"],
    ["Showcase V1.0", "Version Entreprise"],
    ["Showcase", "Démonstration"],
    ["SHOWCASE", "DÉMONSTRATION"],
    ["V46.5.2 • Sessions & Sync Ready", "Sessions, dossiers et synchronisations"],
    ["V46.8.0 • Security Foundation", "Sécurité et droits d’accès"],
    ["Falcon V46 — Bloc opératoire produit", `${PRODUCT_IDENTITY.title} — environnement local`],
    ["Rapport Prestige S4", "Rapport Prestige"]
  ]);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest?.("script,style,noscript,template")) continue;
    let next = node.nodeValue || "";
    for (const [needle, replacement] of replacements) next = next.replaceAll(needle, replacement);
    next = next
      .replace(/\bFalcon V\d+(?:\.\d+)*\b/g, PRODUCT_IDENTITY.title)
      .replace(/\bV46(?:\.\d+)+(?:-[A-Z0-9-]+)?\b/g, "Version entreprise")
      .replace(/\bS[1-9]\b/g, "");
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

function limitToastStack(root = document) {
  if (typeof root?.querySelectorAll !== "function") return;
  const toasts = [...root.querySelectorAll(".toast-wrap .toast, #toasts .toast")];
  for (const toast of toasts.slice(0, Math.max(0, toasts.length - 3))) toast.remove();
}

const KPI_CONTEXT_REGISTRY = Object.freeze([
  Object.freeze({
    match: /(?:constat|observation|situation)/i,
    source: "observations enregistrées dans le dossier actif",
    perimeter: "situations factuelles actuellement conservées dans la mission",
    method: "comptage des observations non supprimées"
  }),
  Object.freeze({
    match: /(?:analyse|qqoqcp|ishikawa|pourquoi|cause)/i,
    source: "analyses reliées aux observations du dossier actif",
    perimeter: "analyses structurées et sauvegardées pour la mission",
    method: "comptage des analyses réellement renseignées"
  }),
  Object.freeze({
    match: /(?:décision|arbitrage)/i,
    source: "décisions enregistrées dans le dossier actif",
    perimeter: "arbitrages formalisés et reliés à une analyse",
    method: "comptage des décisions non archivées"
  }),
  Object.freeze({
    match: /(?:action|plan d.action)/i,
    source: "actions du plan d’action du dossier actif",
    perimeter: "actions créées, attribuées ou suivies dans la mission",
    method: "comptage des actions enregistrées, sans duplication"
  }),
  Object.freeze({
    match: /(?:preuve|source|média|media|annexe)/i,
    source: "éléments de preuve reliés au dossier actif",
    perimeter: "sources, médias et annexes actuellement référencés",
    method: "comptage des références distinctes et conservées"
  }),
  Object.freeze({
    match: /(?:criticité|risque|score|maîtrise|maitrise|confiance)/i,
    source: "cotations calculées à partir des données renseignées dans le dossier actif",
    perimeter: "éléments disposant des paramètres requis pour le calcul",
    method: "application de la formule métier affichée par le module concerné"
  }),
  Object.freeze({
    match: /(?:préparation rapport|preparation rapport|complétude|completude|couverture|rapport compl)/i,
    source: "contrôles de présence des sections obligatoires du Rapport Prestige",
    perimeter: "rubriques attendues dans la restitution active",
    method: "rapport entre les sections validées et les sections obligatoires"
  }),
  Object.freeze({
    match: /(?:priorités critiques|priorites critiques)/i,
    source: "cotations et décisions associées aux risques du dossier actif",
    perimeter: "risques classés au niveau critique selon les seuils du dossier",
    method: "comptage des priorités critiques distinctes encore actives"
  }),
  Object.freeze({
    match: /(?:écart consolidé|ecart consolide)/i,
    source: "écarts calculés entre les niveaux de risque initial et résiduel du dossier actif",
    perimeter: "éléments disposant d’une cotation initiale et d’une cotation résiduelle",
    method: "agrégation pondérée des écarts de cotation, rapportée au potentiel de réduction"
  }),
  Object.freeze({
    match: /(?:avancement|progression|réalisation|realisation)/i,
    source: "états des actions enregistrées dans le plan d’action",
    perimeter: "actions ouvertes, engagées, réalisées ou vérifiées dans la mission",
    method: "part des actions réalisées ou vérifiées rapportée au nombre total d’actions"
  }),
  Object.freeze({
    match: /(?:robustesse|fiabilité|fiabilite|intégrité|integrite)/i,
    source: "contrôles de cohérence et d’intégrité du dossier actif",
    perimeter: "données, liens, preuves et champs requis actuellement enregistrés",
    method: "score déterministe issu des contrôles de cohérence du dossier"
  }),
  Object.freeze({
    match: /(?:dossier|mission|session)/i,
    source: "registre local des dossiers et sessions Falcon",
    perimeter: "dossiers ou sessions accessibles dans l’espace courant",
    method: "comptage des enregistrements distincts disponibles"
  })
]);

function normalizeKpiLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveKpiContext(label) {
  const normalized = normalizeKpiLabel(label);
  return KPI_CONTEXT_REGISTRY.find((entry) => entry.match.test(normalized)) || null;
}

function extractKpiLabel(card, value) {
  const candidates = [...card.querySelectorAll("span,.small")]
    .map((element) => normalizeKpiLabel(element.textContent))
    .filter((text) => text && text !== value && !/^définition et calcul$/i.test(text));
  return candidates.find((text) => resolveKpiContext(text)) || candidates.join(" ");
}

function contextualizeVisibleKpis(root = document) {
  if (typeof root?.querySelectorAll !== "function") return;
  const selectors = [
    ".s4-kpi",
    ".s4-meta-card",
    ".v1-maturity-card",
    ".intel-s3-kpi",
    ".mc-card"
  ].join(",");
  for (const card of root.querySelectorAll(selectors)) {
    if (card.dataset?.falconKpiContext === "ready") continue;
    const value = normalizeKpiLabel(card.querySelector("strong,.big")?.textContent);
    const label = extractKpiLabel(card, value);
    if (!value || !label || !/[\d%/]/.test(value)) continue;
    const context = resolveKpiContext(label);
    if (!context) {
      card.dataset.falconKpiContext = "unmapped";
      card.dataset.falconKpiLabel = label;
      continue;
    }
    const details = document.createElement("details");
    details.className = "falcon-kpi-context";
    details.innerHTML = `<summary>Définition et calcul</summary><p><b>Indicateur :</b> ${label}. <b>Source :</b> ${context.source}. <b>Période :</b> état courant de la mission. <b>Périmètre :</b> ${context.perimeter}. <b>Méthode :</b> ${context.method}.</p>`;
    card.appendChild(details);
    card.dataset.falconKpiContext = "ready";
    card.dataset.falconKpiLabel = label;
  }
}

function hardenResponsiveControls(root = document) {
  if (typeof root?.querySelectorAll !== "function") return;
  for (const control of root.querySelectorAll("select.dossier-status-v431")) {
    if (!control.getAttribute("aria-label") && !control.labels?.length) control.setAttribute("aria-label", "Statut du dossier");
  }
  for (const control of root.querySelectorAll(".obs-switcher select")) {
    if (!control.getAttribute("aria-label") && !control.labels?.length) control.setAttribute("aria-label", "Observation active");
  }
  for (const control of root.querySelectorAll(".help-btn")) {
    if (control.getAttribute("aria-label")) continue;
    const title = control.getAttribute("title")?.trim();
    control.setAttribute("aria-label", title || "Aide contextuelle");
  }
}

function hardenResponsiveTables(root = document) {
  if (typeof root?.querySelectorAll !== "function") return;
  for (const table of root.querySelectorAll(".report table, table.report-table")) {
    if (table.classList.contains("s4-table") || table.dataset?.falconResponsive === "ready") continue;
    const labels = [...table.querySelectorAll("thead th")].map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim());
    if (!labels.length) continue;
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName !== "TD") return;
        cell.dataset.label = labels[index] || `Colonne ${index + 1}`;
      });
    }
    table.classList.add("falcon-responsive-table");
    table.dataset.falconResponsive = "ready";
  }
}

function installMobileInputMode(root = document) {
  if (!root?.addEventListener || document.documentElement.dataset.falconInputMode === "ready") return;
  document.documentElement.dataset.falconInputMode = "ready";
  const updateViewport = () => {
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height || window.innerHeight || 0);
    document.documentElement.style.setProperty("--falcon-visual-viewport-height", `${height}px`);
    document.body?.classList.toggle("falcon-keyboard-open", Boolean(viewport && window.innerHeight - viewport.height > 120));
  };
  root.addEventListener("focusin", (event) => {
    const field = event.target?.closest?.("input:not([type='checkbox']):not([type='radio']),select,textarea");
    if (!field) return;
    document.body?.classList.add("falcon-input-active");
    requestAnimationFrame(() => field.closest("label,.field,.panel")?.scrollIntoView?.({ block: "start", inline: "nearest", behavior: "smooth" }));
  });
  root.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!document.activeElement?.matches?.("input,select,textarea")) document.body?.classList.remove("falcon-input-active", "falcon-keyboard-open");
    }, 120);
  });
  window.visualViewport?.addEventListener?.("resize", updateViewport);
  updateViewport();
}

function openCanonicalHome() {
  if (typeof document?.querySelectorAll !== "function") return false;
  const navigate = window.falconNavigateV4616 || window.setViewV41 || window.setView;
  if (typeof navigate === "function") {
    try {
      const accepted = navigate("accueil");
      if (accepted !== false) return true;
    } catch (_error) {}
  }
  const candidates = [...document.querySelectorAll("button,a")];
  const home = candidates.find((element) => /^Accueil$/i.test(element.textContent?.trim() || ""));
  if (home && typeof home.click === "function") {
    home.click();
    return true;
  }
  return false;
}

function finalizeCanonicalHome() {
  let attempts = 0;
  const visit = () => {
    attempts += 1;
    if (openCanonicalHome() || attempts >= 12) {
      clearInterval(timer);
      try {
        sessionStorage.setItem("falcon_owner_fresh_entry_v1", "done");
        const url = new URL(location.href);
        url.searchParams.delete("ownerTest");
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      } catch (_error) {}
    }
  };
  const timer = setInterval(visit, 150);
  visit();
}

function applyProfessionalRuntime(root = document) {
  applyProductIdentity();
  hardenResponsiveTables(root);
  contextualizeVisibleKpis(root);
  limitToastStack(root);
  installMobileInputMode(root);
  try { document.documentElement.dataset.falconProfessionalReception = "ready"; } catch (_error) {}
}

let applyingIdentity = false;
function applyProductIdentity() {
  if (typeof document === "undefined" || applyingIdentity) return;
  applyingIdentity = true;
  try {
    if (document.title !== PRODUCT_IDENTITY.title) document.title = PRODUCT_IDENTITY.title;
    if (document.documentElement?.dataset?.falconProduct !== "enterprise") document.documentElement.dataset.falconProduct = "enterprise";
    if (document.documentElement?.dataset?.falconIdentity !== "radar-360-enterprise") document.documentElement.dataset.falconIdentity = "radar-360-enterprise";
    replaceVisibleText();
    isolateDemonstrationActions();
    hardenResponsiveControls();
    hardenResponsiveTables();
    contextualizeVisibleKpis();
    limitToastStack();
  } finally {
    applyingIdentity = false;
  }
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
      const control = event.target?.closest?.(".theme-btn,[data-theme-toggle],[aria-label*='thème' i],[title*='thème' i]");
      if (!control) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleTheme();
    }, true);
  }
}

function initializeOwnerProduct() {
  applyProfessionalRuntime();
  observeRuntimeChanges();
  finalizeCanonicalHome();
}

if (typeof document !== "undefined" && document.readyState === "loading") {
  document.addEventListener?.("DOMContentLoaded", initializeOwnerProduct, { once: true });
} else {
  initializeOwnerProduct();
}

export const FalconOwnerProductPolish = Object.freeze({
  productIdentity: PRODUCT_IDENTITY,
  themeKey: THEME_KEY,
  readPreferredTheme,
  applyTheme,
  toggleTheme,
  applyProductIdentity,
  hardenResponsiveControls,
  hardenResponsiveTables,
  installMobileInputMode,
  clearLegacyProductState,
  openCanonicalHome,
  finalizeCanonicalHome,
  resolveKpiContext
});