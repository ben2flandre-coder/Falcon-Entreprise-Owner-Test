export const SKILL_CONTRACT_VERSION = "1.0.0";

export const SKILL_MASTERY_LEVELS = Object.freeze([
  "native-expert",
  "orchestrator-expert",
  "honest-expert"
]);

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export class SkillContractError extends Error {
  constructor(message, code = "SKILL_CONTRACT_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

function clone(value) {
  try { return structuredClone(value); }
  catch (error) {
    throw new SkillContractError(`Skill definition is not cloneable: ${error.message || error}`);
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SkillContractError(`Skill field ${field} must be a non-empty string.`, "SKILL_VALIDATION_ERROR");
  }
  return value.trim();
}

function requireIdentifier(value, field) {
  const normalized = requireText(value, field).toLowerCase();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new SkillContractError(`Invalid ${field}: ${value}`, "SKILL_VALIDATION_ERROR");
  }
  return normalized;
}

function requireStringArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new SkillContractError(`Skill field ${field} must be ${allowEmpty ? "an" : "a non-empty"} array.`, "SKILL_VALIDATION_ERROR");
  }
  const normalized = value.map((entry, index) => requireText(entry, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new SkillContractError(`Skill field ${field} contains duplicate values.`, "SKILL_VALIDATION_ERROR");
  }
  return normalized;
}

export function validateSkillDefinition(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new SkillContractError("Skill definition must be an object.", "SKILL_VALIDATION_ERROR");
  }

  const skill = clone(candidate);
  const normalized = {
    schema: skill.schema || "falcon.knowledge.skill.v1",
    id: requireIdentifier(skill.id, "id"),
    version: requireText(skill.version, "version"),
    corpusId: requireIdentifier(skill.corpusId, "corpusId"),
    title: requireText(skill.title, "title"),
    purpose: requireText(skill.purpose, "purpose"),
    mastery: requireText(skill.mastery, "mastery"),
    activationSignals: requireStringArray(skill.activationSignals, "activationSignals"),
    requiredInputs: requireStringArray(skill.requiredInputs, "requiredInputs", { allowEmpty: true }),
    methods: requireStringArray(skill.methods, "methods"),
    references: requireStringArray(skill.references, "references"),
    evidenceOutputs: requireStringArray(skill.evidenceOutputs, "evidenceOutputs"),
    limitations: requireStringArray(skill.limitations, "limitations"),
    complements: requireStringArray(skill.complements || [], "complements", { allowEmpty: true }),
    exclusions: requireStringArray(skill.exclusions || [], "exclusions", { allowEmpty: true }),
    owner: requireText(skill.owner, "owner"),
    persistence: requireText(skill.persistence, "persistence"),
    reporting: requireText(skill.reporting, "reporting"),
    audit: requireText(skill.audit, "audit")
  };

  if (!VERSION_PATTERN.test(normalized.version)) {
    throw new SkillContractError(`Invalid version: ${normalized.version}`, "SKILL_VALIDATION_ERROR");
  }
  if (!SKILL_MASTERY_LEVELS.includes(normalized.mastery)) {
    throw new SkillContractError(`Unknown mastery level: ${normalized.mastery}`, "SKILL_VALIDATION_ERROR");
  }
  if (normalized.complements.includes(normalized.id) || normalized.exclusions.includes(normalized.id)) {
    throw new SkillContractError("A Skill cannot complement or exclude itself.", "SKILL_VALIDATION_ERROR");
  }

  return freezeDeep(normalized);
}
