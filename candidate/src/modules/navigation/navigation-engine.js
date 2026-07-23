export const NAVIGATION_ENGINE_VERSION = "V48.0.0-dev";
export const NAVIGATION_ACCESS_MODES = Object.freeze({
  SOFT: "soft",
  HARD: "hard"
});

const ROUTE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function isPlainRecord(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function normalizeRouteId(value, fieldName = "route id") {
  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized || !ROUTE_ID_PATTERN.test(normalized)) {
    throw new TypeError(`${fieldName} is invalid: ${value}`);
  }

  return normalized;
}

function normalizeAccessMode(value = NAVIGATION_ACCESS_MODES.SOFT) {
  if (!Object.values(NAVIGATION_ACCESS_MODES).includes(value)) {
    throw new TypeError(`Unknown navigation access mode: ${value}`);
  }
  return value;
}

function cloneOptions(options) {
  return isPlainRecord(options) ? { ...options } : {};
}

function cloneError(error) {
  if (!error) return null;
  return {
    name: error.name || "Error",
    message: error.message || String(error)
  };
}

function normalizeGuardResult(result) {
  if (typeof result === "boolean") {
    return {
      ok: result,
      message: result ? "Route accessible." : "Route indisponible."
    };
  }

  if (!isPlainRecord(result)) {
    return {
      ok: true,
      message: "Route accessible."
    };
  }

  return {
    ok: result.ok !== false,
    message: typeof result.message === "string" && result.message.trim()
      ? result.message.trim()
      : result.ok === false
        ? "Route indisponible."
        : "Route accessible."
  };
}

export function defineRoutes(routeDefinitions) {
  if (!Array.isArray(routeDefinitions) || routeDefinitions.length === 0) {
    throw new TypeError("At least one route definition is required.");
  }

  const seen = new Set();
  const routes = routeDefinitions.map((definition, index) => {
    if (!isPlainRecord(definition)) {
      throw new TypeError(`Route definition at index ${index} must be an object.`);
    }

    const id = normalizeRouteId(definition.id, `route id at index ${index}`);
    if (seen.has(id)) {
      throw new TypeError(`Duplicate navigation route: ${id}`);
    }
    seen.add(id);

    if (definition.guard != null && typeof definition.guard !== "function") {
      throw new TypeError(`Route guard must be a function for route: ${id}`);
    }

    const label = typeof definition.label === "string" && definition.label.trim()
      ? definition.label.trim()
      : id;

    const route = {
      id,
      label,
      accessMode: normalizeAccessMode(definition.accessMode),
      guard: definition.guard || null,
      meta: Object.freeze(isPlainRecord(definition.meta) ? { ...definition.meta } : {})
    };

    return Object.freeze(route);
  });

  return Object.freeze(routes);
}

export function createNavigationEngine({
  routes,
  initialRoute,
  fallbackRoute = initialRoute,
  getContext = () => ({}),
  beforeTransition = () => {},
  applyTransition,
  rollbackTransition = () => {},
  afterTransition = () => {},
  onError = () => {},
  schedule = (task) => queueMicrotask(task),
  transitionLogLimit = 120,
  now = () => new Date().toISOString()
} = {}) {
  const routeList = defineRoutes(routes);
  const routeMap = new Map(routeList.map((route) => [route.id, route]));
  const normalizedInitialRoute = normalizeRouteId(initialRoute, "initial route");
  const normalizedFallbackRoute = normalizeRouteId(fallbackRoute, "fallback route");

  if (!routeMap.has(normalizedInitialRoute)) {
    throw new RangeError(`Initial route is not registered: ${normalizedInitialRoute}`);
  }
  if (!routeMap.has(normalizedFallbackRoute)) {
    throw new RangeError(`Fallback route is not registered: ${normalizedFallbackRoute}`);
  }
  if (typeof getContext !== "function") {
    throw new TypeError("Navigation context provider must be a function.");
  }
  if (typeof beforeTransition !== "function") {
    throw new TypeError("beforeTransition must be a function.");
  }
  if (typeof applyTransition !== "function") {
    throw new TypeError("applyTransition must be a function.");
  }
  if (typeof rollbackTransition !== "function") {
    throw new TypeError("rollbackTransition must be a function.");
  }
  if (typeof afterTransition !== "function") {
    throw new TypeError("afterTransition must be a function.");
  }
  if (typeof onError !== "function") {
    throw new TypeError("onError must be a function.");
  }
  if (typeof schedule !== "function") {
    throw new TypeError("Navigation scheduler must be a function.");
  }
  if (!Number.isInteger(transitionLogLimit) || transitionLogLimit < 1) {
    throw new RangeError("Transition log limit must be a positive integer.");
  }
  if (typeof now !== "function") {
    throw new TypeError("Navigation clock must be a function.");
  }

  let currentRouteId = normalizedInitialRoute;
  let navigating = false;
  let queuedRequest = null;
  let drainScheduled = false;
  const transitionLog = [];

  function timestamp() {
    try {
      return String(now());
    } catch {
      return new Date().toISOString();
    }
  }

  function trace(status, details = {}) {
    transitionLog.unshift(Object.freeze({
      at: timestamp(),
      status,
      from: details.from || null,
      to: details.to || null,
      accessMode: details.accessMode || null,
      warning: details.warning || null,
      origin: details.origin || "runtime",
      error: cloneError(details.error)
    }));

    if (transitionLog.length > transitionLogLimit) {
      transitionLog.length = transitionLogLimit;
    }
  }

  function resolveRoute(routeId) {
    const candidate = routeId === null || routeId === undefined || routeId === ""
      ? normalizedFallbackRoute
      : routeId;

    let normalized;
    try {
      normalized = normalizeRouteId(candidate);
    } catch (error) {
      return { route: null, error };
    }

    return {
      route: routeMap.get(normalized) || null,
      error: routeMap.has(normalized)
        ? null
        : new RangeError(`Unknown navigation route: ${normalized}`)
    };
  }

  function inspect(routeId, options = {}) {
    const resolved = resolveRoute(routeId);
    if (!resolved.route) {
      return Object.freeze({
        ok: false,
        blocking: true,
        route: null,
        message: resolved.error?.message || "Unknown navigation route.",
        error: cloneError(resolved.error)
      });
    }

    const route = resolved.route;
    if (!route.guard) {
      return Object.freeze({
        ok: true,
        blocking: false,
        route,
        message: "Route accessible.",
        error: null
      });
    }

    try {
      const context = Object.hasOwn(options, "context")
        ? options.context
        : getContext();
      const guard = normalizeGuardResult(route.guard(context, route, cloneOptions(options)));
      return Object.freeze({
        ok: guard.ok,
        blocking: !guard.ok && route.accessMode === NAVIGATION_ACCESS_MODES.HARD,
        route,
        message: guard.message,
        error: null
      });
    } catch (error) {
      return Object.freeze({
        ok: false,
        blocking: true,
        route,
        message: "Navigation guard failed.",
        error: cloneError(error)
      });
    }
  }

  function releaseAndDrain() {
    drainScheduled = false;
    navigating = false;

    const next = queuedRequest;
    queuedRequest = null;
    if (!next) return;

    if (next.routeId === currentRouteId && next.options.force !== true) {
      trace("queue-discarded", {
        from: currentRouteId,
        to: next.routeId,
        origin: next.options.origin || "runtime"
      });
      return;
    }

    navigate(next.routeId, next.options);
  }

  function scheduleRelease() {
    if (drainScheduled) return;
    drainScheduled = true;

    try {
      schedule(releaseAndDrain);
    } catch (error) {
      trace("scheduler-failed", {
        from: currentRouteId,
        to: queuedRequest?.routeId || currentRouteId,
        error
      });
      releaseAndDrain();
    }
  }

  function navigate(routeId, options = {}) {
    const safeOptions = cloneOptions(options);
    const resolved = resolveRoute(routeId);
    const targetId = resolved.route?.id || String(routeId ?? normalizedFallbackRoute);

    if (navigating) {
      queuedRequest = { routeId: targetId, options: safeOptions };
      trace("queued", {
        from: currentRouteId,
        to: targetId,
        origin: safeOptions.origin || "runtime"
      });
      return Object.freeze({
        ok: true,
        status: "queued",
        from: currentRouteId,
        to: targetId,
        warning: null,
        error: null
      });
    }

    const access = inspect(routeId, safeOptions);
    if (!access.route) {
      trace("rejected", {
        from: currentRouteId,
        to: targetId,
        origin: safeOptions.origin || "runtime",
        error: resolved.error
      });
      return Object.freeze({
        ok: false,
        status: "rejected",
        from: currentRouteId,
        to: targetId,
        warning: null,
        error: access.error
      });
    }

    if (access.blocking) {
      trace("blocked", {
        from: currentRouteId,
        to: access.route.id,
        accessMode: access.route.accessMode,
        warning: access.message,
        origin: safeOptions.origin || "runtime",
        error: access.error
      });
      return Object.freeze({
        ok: false,
        status: "blocked",
        from: currentRouteId,
        to: access.route.id,
        warning: access.message,
        error: access.error
      });
    }

    if (access.route.id === currentRouteId && safeOptions.force !== true) {
      trace("unchanged", {
        from: currentRouteId,
        to: currentRouteId,
        accessMode: access.route.accessMode,
        warning: access.ok ? null : access.message,
        origin: safeOptions.origin || "runtime"
      });
      return Object.freeze({
        ok: true,
        status: "unchanged",
        from: currentRouteId,
        to: currentRouteId,
        warning: access.ok ? null : access.message,
        error: null
      });
    }

    const from = routeMap.get(currentRouteId);
    const transition = Object.freeze({
      from,
      to: access.route,
      options: Object.freeze(safeOptions),
      access: Object.freeze({
        ok: access.ok,
        blocking: access.blocking,
        message: access.message
      })
    });

    navigating = true;
    let applyAttempted = false;
    try {
      beforeTransition(transition);
      applyAttempted = true;
      applyTransition(transition);
      currentRouteId = access.route.id;
      afterTransition(transition);

      const status = access.ok ? "navigated" : "navigated-with-warning";
      trace(status, {
        from: from.id,
        to: access.route.id,
        accessMode: access.route.accessMode,
        warning: access.ok ? null : access.message,
        origin: safeOptions.origin || "runtime"
      });

      return Object.freeze({
        ok: true,
        status,
        from: from.id,
        to: access.route.id,
        warning: access.ok ? null : access.message,
        error: null
      });
    } catch (error) {
      currentRouteId = from.id;
      let reportedError = error;

      if (applyAttempted) {
        try {
          rollbackTransition(Object.freeze({
            ...transition,
            error: cloneError(error)
          }));
        } catch (rollbackError) {
          reportedError = new Error(
            `${error.message || error}; rollback failed: ${rollbackError.message || rollbackError}`
          );
        }
      }

      try {
        onError(reportedError, transition);
      } catch {
        // Error reporting must never mask the transition failure.
      }

      trace("failed", {
        from: from.id,
        to: access.route.id,
        accessMode: access.route.accessMode,
        origin: safeOptions.origin || "runtime",
        error: reportedError
      });

      return Object.freeze({
        ok: false,
        status: "failed",
        from: from.id,
        to: access.route.id,
        warning: null,
        error: cloneError(reportedError)
      });
    } finally {
      scheduleRelease();
    }
  }

  function current() {
    return routeMap.get(currentRouteId);
  }

  function snapshot() {
    return Object.freeze({
      currentRoute: currentRouteId,
      navigating,
      queuedRoute: queuedRequest?.routeId || null,
      routeCount: routeList.length
    });
  }

  function recentTransitions() {
    return transitionLog.map((entry) => ({
      ...entry,
      error: entry.error ? { ...entry.error } : null
    }));
  }

  return Object.freeze({
    navigate,
    inspect,
    current,
    listRoutes: () => routeList,
    snapshot,
    recentTransitions
  });
}
