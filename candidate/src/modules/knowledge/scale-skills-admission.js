import { createKnowledgeCatalog } from "./knowledge-catalog.js";
import { validateKnowledgePack } from "./knowledge-pack-contract.js";

export const SCALE_SKILLS_ADMISSION_VERSION = "1.0.0";
export const SCALE_SKILLS_QUALIFICATION_SCHEMA =
  "falcon.knowledge.scale-skills.qualification.v1";

export class ScaleSkillsAdmissionError extends Error {
  constructor(
    message,
    code = "SCALE_SKILLS_ADMISSION_ERROR",
    qualification = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.qualification = qualification;
  }
}

function clone(value) {
  return structuredClone(value);
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function fingerprint(value) {
  const input = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

function packKey(pack) {
  return `${pack.id}@${pack.version}`;
}

function describeCandidate(candidate, index) {
  return typeof candidate?.id === "string" && candidate.id.trim()
    ? candidate.id.trim()
    : `batch[${index}]`;
}

function errorEntry({
  code,
  message,
  packId = null,
  path = null,
  scope = "batch"
}) {
  return { code, scope, packId, path, message };
}

function sortErrors(errors) {
  return errors.sort((left, right) =>
    [
      left.scope,
      left.packId || "",
      left.path || "",
      left.code,
      left.message
    ]
      .join("\u0000")
      .localeCompare(
        [
          right.scope,
          right.packId || "",
          right.path || "",
          right.code,
          right.message
        ].join("\u0000")
      )
  );
}

function requireCatalog(catalog) {
  if (
    !catalog
    || typeof catalog.listPacks !== "function"
    || typeof catalog.manifest !== "function"
  ) {
    throw new ScaleSkillsAdmissionError(
      "A knowledge catalog exposing listPacks() and manifest() is required.",
      "SCALE_SKILLS_CATALOG_REQUIRED"
    );
  }
  const packs = catalog.listPacks();
  if (!Array.isArray(packs) || packs.length === 0) {
    throw new ScaleSkillsAdmissionError(
      "The baseline catalog must contain at least one pack.",
      "SCALE_SKILLS_CATALOG_INVALID"
    );
  }
  return packs;
}

function indexResources(packs) {
  return {
    pack: new Set(packs.map(({ id }) => id)),
    corpus: new Set(packs.map(({ corpus }) => corpus.id)),
    skill: new Set(
      packs.flatMap(({ skills }) => skills.map(({ id }) => id))
    ),
    reference: new Set(
      packs.flatMap(({ references }) => references.map(({ id }) => id))
    )
  };
}

function collectCollisions(baselinePacks, batchPacks, errors) {
  const baseline = indexResources(baselinePacks);
  const seen = {
    pack: new Map(),
    corpus: new Map(),
    skill: new Map(),
    reference: new Map()
  };

  function inspect(type, id, packId, path) {
    if (baseline[type].has(id)) {
      errors.push(errorEntry({
        code: `SCALE_SKILLS_${type.toUpperCase()}_COLLISION`,
        scope: "collision",
        packId,
        path,
        message: `${type} identifier ${id} is already active in the baseline catalog.`
      }));
    }
    if (seen[type].has(id)) {
      errors.push(errorEntry({
        code: `SCALE_SKILLS_${type.toUpperCase()}_COLLISION`,
        scope: "collision",
        packId,
        path,
        message:
          `${type} identifier ${id} is declared by both `
          + `${seen[type].get(id)} and ${packId}.`
      }));
    } else {
      seen[type].set(id, packId);
    }
  }

  for (const pack of batchPacks) {
    inspect("pack", pack.id, pack.id, "id");
    inspect("corpus", pack.corpus.id, pack.id, "corpus.id");
    for (const skill of pack.skills) {
      inspect("skill", skill.id, pack.id, `skills.${skill.id}.id`);
    }
    for (const reference of pack.references) {
      inspect(
        "reference",
        reference.id,
        pack.id,
        `references.${reference.id}.id`
      );
    }
  }
}

function collectMissingRelations(baselinePacks, batchPacks, errors) {
  const target = indexResources([...baselinePacks, ...batchPacks]);

  for (const pack of batchPacks) {
    for (const relatedCorpusId of pack.corpus.relatedCorpus) {
      if (!target.corpus.has(relatedCorpusId)) {
        errors.push(errorEntry({
          code: "SCALE_SKILLS_UNKNOWN_CORPUS_RELATION",
          scope: "relation",
          packId: pack.id,
          path: `corpus.relatedCorpus.${relatedCorpusId}`,
          message:
            `Corpus ${pack.corpus.id} references unknown Corpus `
            + `${relatedCorpusId}.`
        }));
      }
    }
    for (const skill of pack.skills) {
      for (const complementId of skill.complements) {
        if (!target.skill.has(complementId)) {
          errors.push(errorEntry({
            code: "SCALE_SKILLS_UNKNOWN_SKILL_COMPLEMENT",
            scope: "relation",
            packId: pack.id,
            path: `skills.${skill.id}.complements.${complementId}`,
            message: `Skill ${skill.id} complements unknown Skill ${complementId}.`
          }));
        }
      }
      for (const exclusionId of skill.exclusions) {
        if (!target.skill.has(exclusionId)) {
          errors.push(errorEntry({
            code: "SCALE_SKILLS_UNKNOWN_SKILL_EXCLUSION",
            scope: "relation",
            packId: pack.id,
            path: `skills.${skill.id}.exclusions.${exclusionId}`,
            message: `Skill ${skill.id} excludes unknown Skill ${exclusionId}.`
          }));
        }
      }
    }
  }
}

function manifestCounts(manifest) {
  return {
    packs: manifest.packs.length,
    corpus: manifest.corpus.length,
    skills: manifest.skills.length,
    references: manifest.references.length
  };
}

function buildQualification({
  baselineManifest,
  receivedCount,
  normalizedPacks,
  errors,
  targetManifest
}) {
  const orderedPacks = normalizedPacks
    .map((pack) => ({
      id: pack.id,
      version: pack.version,
      corpusId: pack.corpus.id,
      skillCount: pack.skills.length,
      referenceCount: pack.references.length
    }))
    .sort((left, right) =>
      `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`)
    );
  const orderedErrors = sortErrors(errors);
  const draft = {
    schema: SCALE_SKILLS_QUALIFICATION_SCHEMA,
    version: SCALE_SKILLS_ADMISSION_VERSION,
    status: orderedErrors.length === 0 ? "accepted" : "rejected",
    atomic: true,
    baseline: {
      counts: manifestCounts(baselineManifest),
      manifestFingerprint: fingerprint(baselineManifest)
    },
    batch: {
      receivedCount,
      validatedCount: normalizedPacks.length,
      packs: orderedPacks
    },
    target: targetManifest
      ? {
          counts: manifestCounts(targetManifest),
          manifest: targetManifest
        }
      : null,
    errors: orderedErrors,
    decisionAuthority: "human"
  };
  return freezeDeep({
    ...draft,
    proofFingerprint: fingerprint(draft)
  });
}

export function qualifyKnowledgePackBatch({ catalog, packs } = {}) {
  const baselinePacks = requireCatalog(catalog);
  const baselineManifest = catalog.manifest();
  const errors = [];
  const receivedCount = Array.isArray(packs) ? packs.length : 0;

  if (!Array.isArray(packs) || packs.length === 0) {
    errors.push(errorEntry({
      code: "SCALE_SKILLS_BATCH_REQUIRED",
      message: "A non-empty knowledge pack batch is required."
    }));
    return buildQualification({
      baselineManifest,
      receivedCount,
      normalizedPacks: [],
      errors,
      targetManifest: null
    });
  }

  const normalizedPacks = [];
  packs.forEach((candidate, index) => {
    try {
      normalizedPacks.push(validateKnowledgePack(candidate));
    } catch (error) {
      errors.push(errorEntry({
        code: error.code || "SCALE_SKILLS_PACK_INVALID",
        scope: "contract",
        packId: describeCandidate(candidate, index),
        path: `batch[${index}]`,
        message: error.message || String(error)
      }));
    }
  });
  normalizedPacks.sort((left, right) =>
    packKey(left).localeCompare(packKey(right))
  );

  collectCollisions(baselinePacks, normalizedPacks, errors);
  collectMissingRelations(baselinePacks, normalizedPacks, errors);

  let targetManifest = null;
  if (errors.length === 0) {
    try {
      targetManifest = createKnowledgeCatalog({
        packs: [...baselinePacks, ...normalizedPacks]
      }).manifest();
    } catch (error) {
      errors.push(errorEntry({
        code: error.code || "SCALE_SKILLS_TARGET_INVALID",
        scope: "target",
        message: error.message || String(error)
      }));
    }
  }

  return buildQualification({
    baselineManifest,
    receivedCount,
    normalizedPacks,
    errors,
    targetManifest
  });
}

export function admitKnowledgePackBatch({ catalog, packs } = {}) {
  const qualification = qualifyKnowledgePackBatch({ catalog, packs });
  if (qualification.status !== "accepted") {
    throw new ScaleSkillsAdmissionError(
      "Knowledge pack batch rejected atomically.",
      "SCALE_SKILLS_BATCH_REJECTED",
      qualification
    );
  }
  return freezeDeep({
    qualification,
    catalog: createKnowledgeCatalog({
      packs: [...catalog.listPacks(), ...packs.map(validateKnowledgePack)]
    })
  });
}

export function verifyScaleSkillsQualification(candidate) {
  if (
    !candidate
    || candidate.schema !== SCALE_SKILLS_QUALIFICATION_SCHEMA
    || candidate.version !== SCALE_SKILLS_ADMISSION_VERSION
    || !["accepted", "rejected"].includes(candidate.status)
    || candidate.atomic !== true
    || !Array.isArray(candidate.errors)
    || typeof candidate.proofFingerprint !== "string"
  ) {
    throw new ScaleSkillsAdmissionError(
      "Scale Skills qualification schema or version is unsupported.",
      "SCALE_SKILLS_QUALIFICATION_INVALID"
    );
  }
  const acceptedShape =
    candidate.status === "accepted"
    && candidate.errors.length === 0
    && candidate.target
    && typeof candidate.target === "object";
  const rejectedShape =
    candidate.status === "rejected"
    && candidate.errors.length > 0
    && candidate.target === null;
  if (
    (!acceptedShape && !rejectedShape)
    || candidate.decisionAuthority !== "human"
    || !candidate.baseline?.counts
    || !candidate.batch?.packs
    || !Array.isArray(candidate.batch.packs)
  ) {
    throw new ScaleSkillsAdmissionError(
      "Scale Skills qualification state is inconsistent.",
      "SCALE_SKILLS_QUALIFICATION_INVALID"
    );
  }
  const payload = clone(candidate);
  const claimedFingerprint = payload.proofFingerprint;
  delete payload.proofFingerprint;
  if (fingerprint(payload) !== claimedFingerprint) {
    throw new ScaleSkillsAdmissionError(
      "Scale Skills qualification fingerprint does not match its content.",
      "SCALE_SKILLS_QUALIFICATION_INTEGRITY_ERROR"
    );
  }
  return true;
}

export function serializeScaleSkillsQualification(qualification) {
  verifyScaleSkillsQualification(qualification);
  return JSON.stringify(qualification, null, 2);
}

export function restoreScaleSkillsQualification(serialized) {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    throw new ScaleSkillsAdmissionError(
      "A serialized Scale Skills qualification is required.",
      "SCALE_SKILLS_QUALIFICATION_RESTORE_ERROR"
    );
  }
  let qualification;
  try {
    qualification = JSON.parse(serialized);
  } catch (error) {
    throw new ScaleSkillsAdmissionError(
      `Scale Skills qualification JSON is invalid: ${error.message || error}`,
      "SCALE_SKILLS_QUALIFICATION_RESTORE_ERROR"
    );
  }
  verifyScaleSkillsQualification(qualification);
  return freezeDeep(qualification);
}
