import { createCockpitRefreshContract } from "./cockpit-refresh-contract.js";

export const COCKPIT_SYNC_CONTROLLER_VERSION = "CockpitSyncController@1.0";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function assertContract(contract) {
  if (!contract || typeof contract.resolve !== "function" || !Array.isArray(contract.eventTypes)) {
    throw new TypeError("Cockpit synchronization requires a refresh contract.");
  }
}

function emptyPending() {
  return {
    mode: "none",
    zones: new Set(),
    eventTypes: new Set(),
    eventIds: new Set(),
    eventCount: 0
  };
}

export function createCockpitSyncController({
  eventBus,
  contract = createCockpitRefreshContract(),
  onRefresh,
  delayMs = 40,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle),
  shouldHandle = () => true,
  subscriberPrefix = "cockpit-sync"
} = {}) {
  if (!eventBus || typeof eventBus.subscribe !== "function") {
    throw new TypeError("Cockpit synchronization requires an Event Bus exposing subscribe().");
  }
  assertContract(contract);
  if (typeof onRefresh !== "function") throw new TypeError("Cockpit synchronization requires an onRefresh callback.");
  if (!Number.isInteger(delayMs) || delayMs < 0) throw new RangeError("Cockpit synchronization delay must be a non-negative integer.");
  if (typeof schedule !== "function" || typeof cancel !== "function") throw new TypeError("Cockpit synchronization scheduler is invalid.");
  if (typeof shouldHandle !== "function") throw new TypeError("Cockpit synchronization filter must be a function.");

  let active = true;
  let timer = null;
  let pending = emptyPending();
  const subscriptions = [];

  function snapshotPending() {
    return freezeDeep({
      mode: pending.mode,
      zones: [...pending.zones].sort(),
      eventTypes: [...pending.eventTypes].sort(),
      eventIds: [...pending.eventIds].sort(),
      eventCount: pending.eventCount
    });
  }

  function resetPending() {
    pending = emptyPending();
  }

  function flush() {
    if (timer !== null) timer = null;
    if (!active || pending.mode === "none") return null;
    const batch = snapshotPending();
    resetPending();
    onRefresh(batch);
    return batch;
  }

  function queue(event) {
    if (!active || !shouldHandle(event)) return false;
    const refresh = contract.resolve(event);
    if (!refresh || refresh.mode === "none") return false;

    pending.eventCount += 1;
    if (event?.type) pending.eventTypes.add(String(event.type));
    if (event?.id) pending.eventIds.add(String(event.id));

    if (refresh.mode === "full") {
      pending.mode = "full";
      pending.zones.clear();
    } else if (pending.mode !== "full") {
      pending.mode = "targeted";
      for (const zone of refresh.zones || []) pending.zones.add(String(zone));
    }

    if (timer === null) timer = schedule(flush, delayMs);
    return true;
  }

  for (const eventType of contract.eventTypes) {
    const subscription = eventBus.subscribe(eventType, queue, {
      subscriberId: `${subscriberPrefix}:${eventType}`,
      priority: 200
    });
    subscriptions.push(subscription);
  }

  function flushNow() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    return flush();
  }

  function destroy() {
    if (!active) return false;
    active = false;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    for (const subscription of subscriptions) subscription.unsubscribe();
    subscriptions.length = 0;
    resetPending();
    return true;
  }

  return Object.freeze({
    version: COCKPIT_SYNC_CONTROLLER_VERSION,
    flushNow,
    destroy,
    isActive: () => active,
    pending: snapshotPending,
    subscriptionCount: () => subscriptions.length
  });
}
