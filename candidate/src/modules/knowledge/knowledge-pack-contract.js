import { validateCorpusDefinition } from "./corpus-contract.js";
import { validateSkillDefinition } from "./skill-contract.js";

export const KNOWLEDGE_PACK_CONTRACT_VERSION = "1.0.0";

export const KNOWLEDGE_REFERENCE_TYPES = Object.freeze([
  "regulation",
  "institutional-guidance",
  "standard",
  "method",
  "tool"
]);

export const KNOWLEDGE_REFERENCE_VERIFICATION_STATUSES = Object.freeze([
  "source-verified",
  "revalidation-required",
  "superseded"
]);

export const KNOWLEDGE_REFERENCE_APPLICABILITY_STATUSES = Object.freeze([
  "dossier-revalidation-required",
  "applicable",
  "not-applicable"
]);

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class KnowledgePackContractError extends Error {
  constructor(message, code = "KNOWLEDGE_PACK_CONTRACT_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new KnowledgePackContractError(
      `Knowledge pack is not cloneable: ${error.message || error}`
    );
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new KnowledgePackContractError(
      `Knowledge pack field ${field} must be a non-empty string.`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  return value.trim();
}

function requireIdentifier(value, field) {
  const normalized = requireText(value, field).toLowerCase();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new KnowledgePackContractError(
      `Invalid ${field}: ${value}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function requireStringArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new KnowledgePackContractError(
      `Knowledge pack field ${field} must be ${allowEmpty ? "an" : "a non-empty"} array.`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  const normalized = value.map((entry, index) =>
    requireText(entry, `${field}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new KnowledgePackContractError(
      `Knowledge pack field ${field} contains duplicate values.`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function requireVersion(value, field) {
  const normalized = requireText(value, field);
  if (!VERSION_PATTERN.test(normalized)) {
    throw new KnowledgePackContractError(
      `Invalid ${field}: ${value}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function requireDate(value, field) {
  const normalized = requireText(value, field);
  const instant = new Date(`${normalized}T00:00:00.000Z`);
  if (
    !DATE_PATTERN.test(normalized)
    || Number.isNaN(instant.getTime())
    || instant.toISOString().slice(0, 10) !== normalized
  ) {
    throw new KnowledgePackContractError(
      `Invalid ${field}: ${value}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  return normalized;
}

function requireHttpsUrl(value, field) {
  const normalized = requireText(value, field);
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new KnowledgePackContractError(
      `Invalid ${field}: ${value}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  if (url.protocol !== "https:") {
    throw new KnowledgePackContractError(
      `${field} must use HTTPS.`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  return url.toString();
}

function normalizeReference(candidate, index) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new KnowledgePackContractError(
      `references[${index}] must be an object.`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }

  const prefix = `references[${index}]`;
  const normalized = {
    id: requireIdentifier(candidate.id, `${prefix}.id`),
    title: requireText(candidate.title, `${prefix}.title`),
    authority: requireText(candidate.authority, `${prefix}.authority`),
    type: requireText(candidate.type, `${prefix}.type`),
    locator: requireText(candidate.locator, `${prefix}.locator`),
    url: requireHttpsUrl(candidate.url, `${prefix}.url`),
    checkedAt: requireDate(candidate.checkedAt, `${prefix}.checkedAt`),
    verificationStatus: requireText(
      candidate.verificationStatus,
      `${prefix}.verificationStatus`
    ),
    applicabilityStatus: requireText(
      candidate.applicabilityStatus,
      `${prefix}.applicabilityStatus`
    ),
    applicability: requireText(candidate.applicability, `${prefix}.applicability`),
    limitations: requireStringArray(candidate.limitations, `${prefix}.limitations`)
  };

  if (!KNOWLEDGE_REFERENCE_TYPES.includes(normalized.type)) {
    throw new KnowledgePackContractError(
      `Unknown reference type: ${normalized.type}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  if (
    !KNOWLEDGE_REFERENCE_VERIFICATION_STATUSES.includes(
      normalized.verificationStatus
    )
  ) {
    throw new KnowledgePackContractError(
      `Unknown verification status: ${normalized.verificationStatus}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  if (
    !KNOWLEDGE_REFERENCE_APPLICABILITY_STATUSES.includes(
      normalized.applicabilityStatus
    )
  ) {
    throw new KnowledgePackContractError(
      `Unknown applicability status: ${normalized.applicabilityStatus}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }

  return normalized;
}

export function validateKnowledgePack(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new KnowledgePackContractError(
      "Knowledge pack must be an object.",
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }

  const pack = clone(candidate);
  const schema = pack.schema || "falcon.knowledge.pack.v1";
  if (schema !== "falcon.knowledge.pack.v1") {
    throw new KnowledgePackContractError(
      `Unsupported knowledge pack schema: ${schema}`,
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }

  if (!Array.isArray(pack.references) || pack.references.length === 0) {
    throw new KnowledgePackContractError(
      "Knowledge pack references must be a non-empty array.",
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }
  if (!Array.isArray(pack.skills) || pack.skills.length === 0) {
    throw new KnowledgePackContractError(
      "Knowledge pack skills must be a non-empty array.",
      "KNOWLEDGE_PACK_VALIDATION_ERROR"
    );
  }

  const normalized = {
    schema,
    id: requireIdentifier(pack.id, "id"),
    version: requireVersion(pack.version, "version"),
    title: requireText(pack.title, "title"),
    owner: requireText(pack.owner, "owner"),
    checkedAt: requireDate(pack.checkedAt, "checkedAt"),
    corpus: validateCorpusDefinition(pack.corpus),
    references: pack.references.map(normalizeReference),
    skills: pack.skills.map(validateSkillDefinition)
  };

  const referenceIds = normalized.references.map(({ id }) => id);
  if (new Set(referenceIds).size !== referenceIds.length) {
    throw new KnowledgePackContractError(
      `Knowledge pack ${normalized.id} contains duplicate reference identifiers.`,
      "KNOWLEDGE_PACK_CONFLICT_ERROR"
    );
  }

  const skillIds = normalized.skills.map(({ id }) => id);
  if (new Set(skillIds).size !== skillIds.length) {
    throw new KnowledgePackContractError(
      `Knowledge pack ${normalized.id} contains duplicate Skill identifiers.`,
      "KNOWLEDGE_PACK_CONFLICT_ERROR"
    );
  }

  if (normalized.corpus.owner !== normalized.owner) {
    throw new KnowledgePackContractError(
      `Corpus ${normalized.corpus.id} owner differs from pack ${normalized.id} owner.`,
      "KNOWLEDGE_PACK_OWNERSHIP_ERROR"
    );
  }

  const knownReferences = new Set(referenceIds);
  for (const reference of normalized.references) {
    if (reference.checkedAt > normalized.checkedAt) {
      throw new KnowledgePackContractError(
        `Reference ${reference.id} was checked after pack ${normalized.id}.`,
        "KNOWLEDGE_PACK_VALIDATION_ERROR"
      );
    }
  }

  for (const skill of normalized.skills) {
    if (skill.corpusId !== normalized.corpus.id) {
      throw new KnowledgePackContractError(
        `Skill ${skill.id} references corpus ${skill.corpusId} outside pack ${normalized.id}.`,
        "KNOWLEDGE_PACK_REFERENCE_ERROR"
      );
    }
    if (skill.owner !== normalized.owner) {
      throw new KnowledgePackContractError(
        `Skill ${skill.id} owner differs from pack ${normalized.id} owner.`,
        "KNOWLEDGE_PACK_OWNERSHIP_ERROR"
      );
    }
    for (const referenceId of skill.references) {
      if (!knownReferences.has(referenceId)) {
        throw new KnowledgePackContractError(
          `Skill ${skill.id} references unknown source ${referenceId}.`,
          "KNOWLEDGE_PACK_REFERENCE_ERROR"
        );
      }
    }
  }

  return freezeDeep(normalized);
}
