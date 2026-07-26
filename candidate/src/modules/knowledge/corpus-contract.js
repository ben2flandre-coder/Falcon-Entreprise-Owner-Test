export const CORPUS_CONTRACT_VERSION = "1.0.0";

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export class CorpusContractError extends Error {
  constructor(message, code = "CORPUS_CONTRACT_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

function clone(value) {
  try { return structuredClone(value); }
  catch (error) {
    throw new CorpusContractError(`Corpus definition is not cloneable: ${error.message || error}`);
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CorpusContractError(`Corpus field ${field} must be a non-empty string.`, "CORPUS_VALIDATION_ERROR");
  }
  return value.trim();
}

function requireIdentifier(value, field) {
  const normalized = requireText(value, field).toLowerCase();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new CorpusContractError(`Invalid ${field}: ${value}`, "CORPUS_VALIDATION_ERROR");
  }
  return normalized;
}

function requireStringArray(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new CorpusContractError(`Corpus field ${field} must be ${allowEmpty ? "an" : "a non-empty"} array.`, "CORPUS_VALIDATION_ERROR");
  }
  const normalized = value.map((entry, index) => requireText(entry, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new CorpusContractError(`Corpus field ${field} contains duplicate values.`, "CORPUS_VALIDATION_ERROR");
  }
  return normalized;
}

export function validateCorpusDefinition(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new CorpusContractError("Corpus definition must be an object.", "CORPUS_VALIDATION_ERROR");
  }

  const corpus = clone(candidate);
  const normalized = {
    schema: corpus.schema || "falcon.knowledge.corpus.v1",
    id: requireIdentifier(corpus.id, "id"),
    version: requireText(corpus.version, "version"),
    title: requireText(corpus.title, "title"),
    purpose: requireText(corpus.purpose, "purpose"),
    domains: requireStringArray(corpus.domains, "domains"),
    terminology: requireStringArray(corpus.terminology, "terminology"),
    referenceFamilies: requireStringArray(corpus.referenceFamilies, "referenceFamilies"),
    accidentModels: requireStringArray(corpus.accidentModels || [], "accidentModels", { allowEmpty: true }),
    applicabilityRules: requireStringArray(corpus.applicabilityRules, "applicabilityRules"),
    relatedCorpus: requireStringArray(corpus.relatedCorpus || [], "relatedCorpus", { allowEmpty: true }),
    owner: requireText(corpus.owner, "owner")
  };

  if (!VERSION_PATTERN.test(normalized.version)) {
    throw new CorpusContractError(`Invalid version: ${normalized.version}`, "CORPUS_VALIDATION_ERROR");
  }
  if (normalized.relatedCorpus.includes(normalized.id)) {
    throw new CorpusContractError("A Corpus cannot reference itself.", "CORPUS_VALIDATION_ERROR");
  }

  return freezeDeep(normalized);
}
