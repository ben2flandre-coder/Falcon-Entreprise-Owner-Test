export const FALCON_CAPABILITIES = Object.freeze([
  { id: "enterprise-foundation", level: 1, status: "locked" },
  { id: "document-engine", level: 1, status: "locked" },
  { id: "security-foundation", level: 1, status: "locked" },
  { id: "license-engine", level: 2, status: "integrating" },
  { id: "mission-workspace", level: 2, status: "specified" },
  { id: "knowledge-engine", level: 2, status: "specified" },
  { id: "ai-foundation", level: 3, status: "specified" },
  { id: "sync-foundation", level: 3, status: "specified" },
  { id: "marketplace-foundation", level: 3, status: "specified" },
  { id: "executive-cockpit", level: 3, status: "demonstrated" }
]);

export function getCapability(id) {
  return FALCON_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}
