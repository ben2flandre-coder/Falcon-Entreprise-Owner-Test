import { createKnowledgeRegistry } from "./knowledge-registry.js";
import { validateKnowledgePack } from "./knowledge-pack-contract.js";

export const KNOWLEDGE_CATALOG_VERSION = "1.0.0";
export const KNOWLEDGE_CATALOG_SNAPSHOT_SCHEMA =
  "falcon.knowledge.catalog.snapshot.v1";

export class KnowledgeCatalogError extends Error {
  constructor(message, code = "KNOWLEDGE_CATALOG_ERROR") {
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

function packKey(pack) {
  return `${pack.id}@${pack.version}`;
}

export function createKnowledgeCatalog({ packs } = {}) {
  if (!Array.isArray(packs) || packs.length === 0) {
    throw new KnowledgeCatalogError(
      "A non-empty knowledge pack array is required.",
      "KNOWLEDGE_CATALOG_VALIDATION_ERROR"
    );
  }

  const normalizedPacks = packs
    .map(validateKnowledgePack)
    .sort((left, right) => packKey(left).localeCompare(packKey(right)));
  const packKeys = normalizedPacks.map(packKey);
  if (new Set(packKeys).size !== packKeys.length) {
    throw new KnowledgeCatalogError(
      "The catalog contains duplicate knowledge pack versions.",
      "KNOWLEDGE_CATALOG_CONFLICT_ERROR"
    );
  }
  const packIds = normalizedPacks.map(({ id }) => id);
  if (new Set(packIds).size !== packIds.length) {
    throw new KnowledgeCatalogError(
      "The catalog contains more than one active version of a knowledge pack.",
      "KNOWLEDGE_CATALOG_CONFLICT_ERROR"
    );
  }

  const corpusIds = normalizedPacks.map(({ corpus }) => corpus.id);
  if (new Set(corpusIds).size !== corpusIds.length) {
    throw new KnowledgeCatalogError(
      "The catalog contains more than one active pack for a Corpus.",
      "KNOWLEDGE_CATALOG_CONFLICT_ERROR"
    );
  }
  const skillIds = normalizedPacks.flatMap((pack) =>
    pack.skills.map(({ id }) => id)
  );
  if (new Set(skillIds).size !== skillIds.length) {
    throw new KnowledgeCatalogError(
      "The catalog contains more than one active version of a Skill.",
      "KNOWLEDGE_CATALOG_CONFLICT_ERROR"
    );
  }

  const references = normalizedPacks
    .flatMap((pack) =>
      pack.references.map((reference) => ({
        ...reference,
        packId: pack.id,
        packVersion: pack.version,
        corpusId: pack.corpus.id
      }))
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const referenceIds = references.map(({ id }) => id);
  if (new Set(referenceIds).size !== referenceIds.length) {
    throw new KnowledgeCatalogError(
      "Reference identifiers must be unique across the catalog.",
      "KNOWLEDGE_CATALOG_CONFLICT_ERROR"
    );
  }

  const registry = createKnowledgeRegistry();
  for (const pack of normalizedPacks) registry.registerCorpus(pack.corpus);
  for (const pack of normalizedPacks) {
    for (const skill of pack.skills) registry.registerSkill(skill);
  }
  registry.validateRelations();

  const registryView = Object.freeze({
    listCorpus: registry.listCorpus,
    listSkills: registry.listSkills,
    validateRelations: registry.validateRelations,
    manifest: registry.manifest
  });

  function listPacks() {
    return freezeDeep(normalizedPacks.map(clone));
  }

  function listReferences() {
    return freezeDeep(references.map(clone));
  }

  function snapshot() {
    return freezeDeep({
      schema: KNOWLEDGE_CATALOG_SNAPSHOT_SCHEMA,
      version: KNOWLEDGE_CATALOG_VERSION,
      packs: listPacks()
    });
  }

  function serialize() {
    return JSON.stringify(snapshot(), null, 2);
  }

  function manifest() {
    const registryManifest = registry.manifest();
    return freezeDeep({
      schema: "falcon.knowledge.catalog.manifest.v1",
      version: KNOWLEDGE_CATALOG_VERSION,
      packs: normalizedPacks.map((pack) => ({
        id: pack.id,
        version: pack.version,
        title: pack.title,
        corpusId: pack.corpus.id,
        checkedAt: pack.checkedAt,
        skillCount: pack.skills.length,
        referenceCount: pack.references.length
      })),
      corpus: registryManifest.corpus,
      skills: registryManifest.skills,
      references: references.map((reference) => ({
        id: reference.id,
        packId: reference.packId,
        corpusId: reference.corpusId,
        authority: reference.authority,
        type: reference.type,
        locator: reference.locator,
        url: reference.url,
        checkedAt: reference.checkedAt,
        verificationStatus: reference.verificationStatus,
        applicabilityStatus: reference.applicabilityStatus
      }))
    });
  }

  return Object.freeze({
    registry: registryView,
    listPacks,
    listReferences,
    snapshot,
    serialize,
    manifest
  });
}

export function restoreKnowledgeCatalog(serialized) {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    throw new KnowledgeCatalogError(
      "A serialized knowledge catalog is required.",
      "KNOWLEDGE_CATALOG_RESTORE_ERROR"
    );
  }

  let snapshot;
  try {
    snapshot = JSON.parse(serialized);
  } catch (error) {
    throw new KnowledgeCatalogError(
      `Knowledge catalog JSON is invalid: ${error.message || error}`,
      "KNOWLEDGE_CATALOG_RESTORE_ERROR"
    );
  }

  if (
    !snapshot
    || snapshot.schema !== KNOWLEDGE_CATALOG_SNAPSHOT_SCHEMA
    || snapshot.version !== KNOWLEDGE_CATALOG_VERSION
  ) {
    throw new KnowledgeCatalogError(
      "Knowledge catalog snapshot schema or version is unsupported.",
      "KNOWLEDGE_CATALOG_RESTORE_ERROR"
    );
  }

  return createKnowledgeCatalog({ packs: snapshot.packs });
}
