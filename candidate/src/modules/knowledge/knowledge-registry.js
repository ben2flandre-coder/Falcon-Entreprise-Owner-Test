import { validateCorpusDefinition } from "./corpus-contract.js";
import { validateSkillDefinition } from "./skill-contract.js";

export const KNOWLEDGE_REGISTRY_VERSION = "1.0.0";

export class KnowledgeRegistryError extends Error {
  constructor(message, code = "KNOWLEDGE_REGISTRY_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function keyOf(definition) {
  return `${definition.id}@${definition.version}`;
}

export function createKnowledgeRegistry() {
  const corpusByKey = new Map();
  const skillsByKey = new Map();

  function registerCorpus(candidate) {
    const corpus = validateCorpusDefinition(candidate);
    const key = keyOf(corpus);
    if (corpusByKey.has(key)) {
      throw new KnowledgeRegistryError(`Corpus already registered: ${key}`, "KNOWLEDGE_CONFLICT_ERROR");
    }
    corpusByKey.set(key, corpus);
    return freezeDeep({ id: corpus.id, version: corpus.version });
  }

  function registerSkill(candidate) {
    const skill = validateSkillDefinition(candidate);
    const corpusExists = [...corpusByKey.values()].some((corpus) => corpus.id === skill.corpusId);
    if (!corpusExists) {
      throw new KnowledgeRegistryError(
        `Skill ${skill.id} references unknown corpus ${skill.corpusId}.`,
        "KNOWLEDGE_REFERENCE_ERROR"
      );
    }
    const key = keyOf(skill);
    if (skillsByKey.has(key)) {
      throw new KnowledgeRegistryError(`Skill already registered: ${key}`, "KNOWLEDGE_CONFLICT_ERROR");
    }
    skillsByKey.set(key, skill);
    return freezeDeep({ id: skill.id, version: skill.version, corpusId: skill.corpusId });
  }

  function listCorpus() {
    return freezeDeep([...corpusByKey.values()]
      .sort((left, right) => keyOf(left).localeCompare(keyOf(right)))
      .map((corpus) => clone(corpus)));
  }

  function listSkills() {
    return freezeDeep([...skillsByKey.values()]
      .sort((left, right) => keyOf(left).localeCompare(keyOf(right)))
      .map((skill) => clone(skill)));
  }

  function validateRelations() {
    const corpusIds = new Set([...corpusByKey.values()].map((corpus) => corpus.id));
    const skillIds = new Set([...skillsByKey.values()].map((skill) => skill.id));
    const errors = [];

    for (const corpus of corpusByKey.values()) {
      for (const relatedId of corpus.relatedCorpus) {
        if (!corpusIds.has(relatedId)) errors.push(`Corpus ${corpus.id} references unknown corpus ${relatedId}.`);
      }
    }

    for (const skill of skillsByKey.values()) {
      if (!corpusIds.has(skill.corpusId)) errors.push(`Skill ${skill.id} references unknown corpus ${skill.corpusId}.`);
      for (const complementId of skill.complements) {
        if (!skillIds.has(complementId)) errors.push(`Skill ${skill.id} complements unknown Skill ${complementId}.`);
      }
      for (const excludedId of skill.exclusions) {
        if (!skillIds.has(excludedId)) errors.push(`Skill ${skill.id} excludes unknown Skill ${excludedId}.`);
      }
    }

    if (errors.length > 0) {
      throw new KnowledgeRegistryError(errors.join("\n"), "KNOWLEDGE_INTEGRITY_ERROR");
    }
    return true;
  }

  function manifest() {
    validateRelations();
    return freezeDeep({
      schema: "falcon.knowledge.registry.manifest.v1",
      version: KNOWLEDGE_REGISTRY_VERSION,
      corpus: listCorpus().map(({ id, version, title }) => ({ id, version, title })),
      skills: listSkills().map(({ id, version, corpusId, title, mastery }) => ({ id, version, corpusId, title, mastery }))
    });
  }

  return Object.freeze({
    registerCorpus,
    registerSkill,
    listCorpus,
    listSkills,
    validateRelations,
    manifest
  });
}
