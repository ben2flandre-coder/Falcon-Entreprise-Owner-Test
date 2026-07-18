export const EVENT_BUS_VERSION = "V48.0.0-dev";

const EVENT_TYPE_PATTERN = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;

export class EventBusError extends Error {
  constructor(message, code = "EVENT_BUS_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class EventValidationError extends EventBusError {
  constructor(message) { super(message, "EVENT_VALIDATION_ERROR"); }
}

export class EventDispatchError extends EventBusError {
  constructor(message, failures = []) {
    super(message, "EVENT_DISPATCH_ERROR");
    this.failures = Object.freeze(failures.map((failure) => Object.freeze({ ...failure })));
  }
}

function normalizeType(value) {
  if (typeof value !== "string") throw new EventValidationError("Event type must be a string.");
  const normalized = value.trim();
  if (!EVENT_TYPE_PATTERN.test(normalized)) {
    throw new EventValidationError(`Invalid event type: ${value}`);
  }
  return normalized;
}

function clone(value) {
  try { return structuredClone(value); }
  catch (error) {
    throw new EventValidationError(`Event payload is not cloneable: ${error.message || error}`);
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function describeError(error) {
  return Object.freeze({
    name: error?.name || "Error",
    code: error?.code || null,
    message: error?.message || String(error)
  });
}

export function createEventBus({
  now = () => new Date().toISOString(),
  diagnosticsLimit = 200,
  strict = false
} = {}) {
  if (typeof now !== "function") throw new TypeError("Event Bus clock must be a function.");
  if (!Number.isInteger(diagnosticsLimit) || diagnosticsLimit < 1) {
    throw new RangeError("Event Bus diagnostics limit must be a positive integer.");
  }

  const subscriptions = new Map();
  const diagnostics = [];
  let sequence = 0;
  let subscriptionSequence = 0;
  let dispatchDepth = 0;

  function timestamp() {
    try { return String(now()); } catch { return new Date().toISOString(); }
  }

  function trace(status, details = {}) {
    diagnostics.unshift(Object.freeze({
      at: timestamp(),
      status,
      type: details.type || null,
      eventId: details.eventId || null,
      subscriberId: details.subscriberId || null,
      handlerCount: details.handlerCount ?? null,
      origin: details.origin || "runtime",
      error: details.error ? describeError(details.error) : null
    }));
    if (diagnostics.length > diagnosticsLimit) diagnostics.length = diagnosticsLimit;
  }

  function subscribe(type, handler, options = {}) {
    const eventType = normalizeType(type);
    if (typeof handler !== "function") throw new TypeError("Event handler must be a function.");
    const priority = Number.isInteger(options.priority) ? options.priority : 100;
    const once = options.once === true;
    const subscriberId = typeof options.subscriberId === "string" && options.subscriberId.trim()
      ? options.subscriberId.trim()
      : `subscriber-${++subscriptionSequence}`;

    const bucket = subscriptions.get(eventType) || [];
    if (bucket.some((entry) => entry.subscriberId === subscriberId)) {
      throw new EventValidationError(`Duplicate subscriber id for ${eventType}: ${subscriberId}`);
    }
    const entry = Object.freeze({
      subscriberId,
      handler,
      priority,
      once,
      order: ++subscriptionSequence
    });
    bucket.push(entry);
    bucket.sort((left, right) => left.priority - right.priority || left.order - right.order);
    subscriptions.set(eventType, bucket);
    trace("subscribed", { type: eventType, subscriberId, handlerCount: bucket.length });

    let active = true;
    return Object.freeze({
      type: eventType,
      subscriberId,
      unsubscribe() {
        if (!active) return false;
        active = false;
        return unsubscribe(eventType, subscriberId);
      }
    });
  }

  function unsubscribe(type, subscriberId) {
    const eventType = normalizeType(type);
    if (typeof subscriberId !== "string" || !subscriberId.trim()) {
      throw new EventValidationError("Subscriber id is required.");
    }
    const bucket = subscriptions.get(eventType) || [];
    const next = bucket.filter((entry) => entry.subscriberId !== subscriberId);
    const removed = next.length !== bucket.length;
    if (next.length) subscriptions.set(eventType, next);
    else subscriptions.delete(eventType);
    trace(removed ? "unsubscribed" : "not-found", {
      type: eventType,
      subscriberId,
      handlerCount: next.length
    });
    return removed;
  }

  function publish(type, payload = null, options = {}) {
    const eventType = normalizeType(type);
    const eventId = typeof options.eventId === "string" && options.eventId.trim()
      ? options.eventId.trim()
      : `event-${++sequence}`;
    const origin = typeof options.origin === "string" && options.origin.trim()
      ? options.origin.trim()
      : "runtime";
    const event = freezeDeep({
      schema: "falcon.event.v1",
      id: eventId,
      type: eventType,
      at: timestamp(),
      origin,
      payload: clone(payload)
    });

    const bucket = [...(subscriptions.get(eventType) || [])];
    const failures = [];
    const delivered = [];
    dispatchDepth += 1;

    try {
      for (const entry of bucket) {
        try {
          entry.handler(event);
          delivered.push(entry.subscriberId);
          trace("delivered", {
            type: eventType,
            eventId,
            subscriberId: entry.subscriberId,
            handlerCount: bucket.length,
            origin
          });
          if (entry.once) unsubscribe(eventType, entry.subscriberId);
        } catch (error) {
          failures.push(Object.freeze({
            subscriberId: entry.subscriberId,
            error: describeError(error)
          }));
          trace("handler-failed", {
            type: eventType,
            eventId,
            subscriberId: entry.subscriberId,
            handlerCount: bucket.length,
            origin,
            error
          });
        }
      }
    } finally {
      dispatchDepth -= 1;
    }

    trace(failures.length ? "completed-with-errors" : "completed", {
      type: eventType,
      eventId,
      handlerCount: bucket.length,
      origin,
      error: failures.length ? new EventDispatchError("One or more event handlers failed.", failures) : null
    });

    const result = freezeDeep({
      event,
      delivered,
      failures,
      handlerCount: bucket.length
    });

    if ((strict || options.strict === true) && failures.length) {
      throw new EventDispatchError(`Event dispatch failed for ${eventType}.`, failures);
    }
    return result;
  }

  function subscriberCount(type = null) {
    if (type == null) {
      return [...subscriptions.values()].reduce((count, bucket) => count + bucket.length, 0);
    }
    return (subscriptions.get(normalizeType(type)) || []).length;
  }

  function clear(type = null) {
    if (dispatchDepth > 0) throw new EventBusError("Cannot clear subscriptions during dispatch.", "EVENT_BUS_BUSY");
    if (type == null) {
      const count = subscriberCount();
      subscriptions.clear();
      trace("cleared", { handlerCount: count });
      return count;
    }
    const eventType = normalizeType(type);
    const count = subscriberCount(eventType);
    subscriptions.delete(eventType);
    trace("cleared", { type: eventType, handlerCount: count });
    return count;
  }

  function recentDiagnostics() {
    return diagnostics.map((entry) => ({
      ...entry,
      error: entry.error ? { ...entry.error } : null
    }));
  }

  return Object.freeze({
    subscribe,
    unsubscribe,
    publish,
    subscriberCount,
    clear,
    recentDiagnostics
  });
}
