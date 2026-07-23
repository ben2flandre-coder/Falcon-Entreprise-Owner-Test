import {
  NAVIGATION_ACCESS_MODES,
  createNavigationEngine
} from "../../modules/navigation/navigation-engine.js";

export function setupNavigationShell({
  rbac,
  storage,
  appNavigation,
  feedback,
  status,
  summary,
  log,
  routePanels
}) {
  let engine = null;

  const routes = [
    { id: "overview", label: "Vue d’ensemble", meta: { description: "Capacités et état d’ingénierie V48." } },
    {
      id: "missions",
      label: "Missions",
      accessMode: NAVIGATION_ACCESS_MODES.HARD,
      guard: (context) => ({
        ok: context.canReadMissions,
        message: "Le profil actif ne peut pas consulter les missions."
      }),
      meta: { description: "Registre et cycle de vie des missions." }
    },
    {
      id: "administration",
      label: "Configuration",
      accessMode: NAVIGATION_ACCESS_MODES.HARD,
      guard: (context) => ({
        ok: context.storageReady,
        message: "Le stockage local doit être disponible pour configurer Falcon."
      }),
      meta: { description: "Configuration initiale locale de l’organisation et du support." }
    },
    { id: "security", label: "RBAC", meta: { description: "Profils et permissions extraits." } },
    {
      id: "storage",
      label: "Stockage",
      accessMode: NAVIGATION_ACCESS_MODES.HARD,
      guard: (context) => ({
        ok: context.storageReady,
        message: "Le Storage Engine doit être disponible pour ouvrir cette vue."
      }),
      meta: { description: "Sonde locale isolée du runtime historique." }
    },
    { id: "baseline", label: "Baseline", meta: { description: "Référence fonctionnelle immuable V46.8.0." } }
  ];

  function setFeedback(message, tone = "neutral") {
    feedback.className = `navigation-feedback ${tone}`;
    feedback.textContent = message;
  }

  function renderControls() {
    if (!engine) return;

    const currentRoute = engine.current().id;
    appNavigation.replaceChildren();

    for (const route of engine.listRoutes()) {
      const access = engine.inspect(route.id);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = route.label;
      button.classList.toggle("active", route.id === currentRoute);
      button.classList.toggle("soft-warning", !access.ok && !access.blocking);
      button.disabled = access.blocking;
      button.title = access.message;
      button.setAttribute("aria-current", route.id === currentRoute ? "page" : "false");
      button.addEventListener("click", () => {
        const result = engine.navigate(route.id, { origin: "v48-shell" });
        const tone = result.ok ? (result.warning ? "warning" : "success") : "error";
        setFeedback(
          result.warning || (result.ok
            ? `Vue ouverte : ${route.label}.`
            : result.error?.message || "Navigation impossible."),
          tone
        );
        queueMicrotask(refresh);
      });
      appNavigation.append(button);
    }
  }

  function renderDiagnostics() {
    if (!engine) return;

    const snapshot = engine.snapshot();
    const current = engine.current();
    const transitions = engine.recentTransitions();

    status.textContent = snapshot.navigating ? "Transition" : "Opérationnel";
    status.className = `status-pill ${snapshot.navigating ? "" : "ok"}`;

    summary.replaceChildren();
    for (const [value, label] of [
      [current.label, "vue active"],
      [String(snapshot.routeCount), "routes enregistrées"],
      [String(transitions.length), "transitions journalisées"],
      [snapshot.queuedRoute || "Aucune", "route en attente"]
    ]) {
      const card = document.createElement("article");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      card.className = "navigation-card";
      strong.textContent = value;
      span.textContent = label;
      card.append(strong, span);
      summary.append(card);
    }

    log.replaceChildren();
    if (transitions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Aucune transition enregistrée.";
      log.append(empty);
      return;
    }

    for (const entry of transitions.slice(0, 8)) {
      const row = document.createElement("article");
      const entryStatus = document.createElement("strong");
      const route = document.createElement("span");
      const details = document.createElement("small");
      row.className = `navigation-log-row${entry.error ? " error" : ""}`;
      entryStatus.textContent = entry.status;
      route.textContent = `${entry.from || "—"} → ${entry.to || "—"}`;
      details.textContent = entry.warning || entry.error?.message || entry.origin;
      row.append(entryStatus, route, details);
      log.append(row);
    }
  }

  function refresh() {
    renderControls();
    renderDiagnostics();
  }

  try {
    engine = createNavigationEngine({
      routes,
      initialRoute: "overview",
      fallbackRoute: "overview",
      getContext: () => ({
        storageReady: storage.isReady(),
        canReadMissions: rbac.can("mission.read")
      }),
      beforeTransition: () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
      applyTransition: ({ to }) => {
        let matched = false;
        for (const panel of routePanels) {
          const active = panel.dataset.routePanel === to.id;
          panel.hidden = !active;
          matched = matched || active;
        }
        if (!matched) throw new Error(`Aucun panneau V48 associé à la route ${to.id}.`);
      },
      rollbackTransition: ({ from }) => {
        for (const panel of routePanels) {
          panel.hidden = panel.dataset.routePanel !== from.id;
        }
      },
      afterTransition: () => {
        refresh();
        try {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch {
          // Navigation success does not depend on scroll support.
        }
      },
      onError: (error) => {
        setFeedback(`Navigation interrompue : ${error.message}`, "error");
      }
    });

    const initial = engine.navigate("overview", {
      force: true,
      origin: "v48-shell-boot"
    });
    setFeedback(
      initial.ok
        ? "Navigation Engine prêt. Aucun routeur historique n’a été reconnecté."
        : "Navigation Engine indisponible.",
      initial.ok ? "success" : "error"
    );
    queueMicrotask(refresh);
  } catch (error) {
    status.textContent = "Indisponible";
    status.className = "status-pill error";
    setFeedback(`Initialisation impossible : ${error.message}`, "error");
  }

  return Object.freeze({ engine, refresh });
}
