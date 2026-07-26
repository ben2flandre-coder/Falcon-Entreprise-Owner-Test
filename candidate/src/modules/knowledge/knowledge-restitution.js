export const KNOWLEDGE_RESTITUTION_VERSION = "1.0.0";
export const KNOWLEDGE_RESTITUTION_SCHEMA =
  "falcon.knowledge.restitution.v1";

export class KnowledgeRestitutionError extends Error {
  constructor(message, code = "KNOWLEDGE_RESTITUTION_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
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

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`
  ).join(",")}}`;
}

function fingerprint(value) {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function requireConfiguration(catalog, lifecycle) {
  if (
    !catalog?.registry
    || typeof catalog.registry.listSkills !== "function"
    || typeof catalog.listReferences !== "function"
    || typeof catalog.manifest !== "function"
  ) {
    throw new KnowledgeRestitutionError(
      "A valid Knowledge Catalog is required.",
      "KNOWLEDGE_RESTITUTION_CONFIGURATION_ERROR"
    );
  }
  if (typeof lifecycle?.qualifySkillReferences !== "function") {
    throw new KnowledgeRestitutionError(
      "A valid Reference Lifecycle is required.",
      "KNOWLEDGE_RESTITUTION_CONFIGURATION_ERROR"
    );
  }
}

export function createKnowledgeRestitution({
  catalog,
  lifecycle,
  orchestration,
  asOf,
  maxAgeDays = 365
} = {}) {
  requireConfiguration(catalog, lifecycle);
  if (
    !orchestration
    || orchestration.schema !== "falcon.knowledge.orchestration.v1"
    || !Array.isArray(orchestration.selected)
  ) {
    throw new KnowledgeRestitutionError(
      "A valid EKI orchestration is required.",
      "KNOWLEDGE_RESTITUTION_VALIDATION_ERROR"
    );
  }
  if (typeof asOf !== "string" || asOf.length === 0) {
    throw new KnowledgeRestitutionError(
      "An explicit asOf date is required.",
      "KNOWLEDGE_RESTITUTION_VALIDATION_ERROR"
    );
  }

  const skills = new Map(
    catalog.registry.listSkills().map((skill) => [skill.id, skill])
  );
  const references = new Map(
    catalog.listReferences().map((reference) => [reference.id, reference])
  );
  const steps = orchestration.selected.map((selection) => {
    const skill = skills.get(selection.id);
    if (!skill) {
      throw new KnowledgeRestitutionError(
        `Selected Skill is absent from catalog: ${selection.id}`,
        "KNOWLEDGE_RESTITUTION_REFERENCE_ERROR"
      );
    }
    const qualification = lifecycle.qualifySkillReferences({
      skillId: skill.id,
      asOf,
      maxAgeDays
    });
    const sourceStatuses = new Map(
      qualification.statuses.map((status) => [status.referenceId, status])
    );
    const sourceProof = skill.references.map((referenceId) => {
      const reference = references.get(referenceId);
      const status = sourceStatuses.get(referenceId);
      return {
        id: reference.id,
        title: reference.title,
        authority: reference.authority,
        locator: reference.locator,
        url: reference.url,
        checkedAt: reference.checkedAt,
        applicabilityStatus: reference.applicabilityStatus,
        lifecycle: status
      };
    });
    const blocked = qualification.requiresHumanRevalidation
      || selection.missingRequiredInputs.length > 0;
    return {
      rank: selection.rank,
      skillId: skill.id,
      skillVersion: skill.version,
      corpusId: skill.corpusId,
      title: skill.title,
      mastery: skill.mastery,
      status: blocked ? "requires-validation" : "ready-for-human-analysis",
      selectionReasons: clone(selection.selectionReasons),
      matchedSignals: clone(selection.matchedSignals),
      methods: clone(skill.methods),
      requiredInputs: clone(skill.requiredInputs),
      missingRequiredInputs: clone(selection.missingRequiredInputs),
      evidenceOutputs: clone(skill.evidenceOutputs),
      limitations: clone(skill.limitations),
      sources: sourceProof,
      sourceQualification: qualification,
      decisionAuthority: "human"
    };
  });

  const core = {
    schema: KNOWLEDGE_RESTITUTION_SCHEMA,
    version: KNOWLEDGE_RESTITUTION_VERSION,
    asOf,
    orchestrationVersion: orchestration.orchestratorVersion,
    catalogVersion: catalog.manifest().version,
    summary: {
      selectedSkillCount: steps.length,
      domainCount: orchestration.coverageDetails.domainCount,
      coverage: orchestration.coverage,
      coverageLevel: orchestration.coverageDetails.level,
      readyStepCount: steps.filter(({ status }) =>
        status === "ready-for-human-analysis"
      ).length,
      validationRequiredCount: steps.filter(({ status }) =>
        status === "requires-validation"
      ).length,
      uncoveredSignals: clone(orchestration.uncoveredSignals)
    },
    steps,
    uncertainties: clone(orchestration.uncertainties),
    deferred: clone(orchestration.deferred),
    decisionAuthority: "human",
    requiresHumanArbitration: true
  };
  return freezeDeep({
    ...core,
    proofFingerprint: fingerprint(core)
  });
}

export function projectKnowledgeCockpitPanel(restitution) {
  if (restitution?.schema !== KNOWLEDGE_RESTITUTION_SCHEMA) {
    throw new KnowledgeRestitutionError(
      "A valid Knowledge Restitution is required.",
      "KNOWLEDGE_RESTITUTION_VALIDATION_ERROR"
    );
  }
  return freezeDeep({
    id: "enterprise-knowledge",
    title: "Expertises mobilisées",
    state: restitution.summary.validationRequiredCount > 0
      || restitution.summary.uncoveredSignals.length > 0
      ? "degraded"
      : "ready",
    summary: clone(restitution.summary),
    alerts: [
      ...restitution.summary.uncoveredSignals.map((signal) => ({
        code: "UNCOVERED_SIGNAL",
        severity: "high",
        label: signal
      })),
      ...restitution.steps
        .filter(({ status }) => status === "requires-validation")
        .map((step) => ({
          code: "SKILL_REQUIRES_VALIDATION",
          severity: "medium",
          skillId: step.skillId,
          label: step.title
        }))
    ],
    items: restitution.steps.map((step) => ({
      rank: step.rank,
      skillId: step.skillId,
      title: step.title,
      corpusId: step.corpusId,
      mastery: step.mastery,
      status: step.status,
      missingInputCount: step.missingRequiredInputs.length,
      unavailableSourceCount:
        step.sourceQualification.unavailableReferenceIds.length,
      restrictedSourceCount:
        step.sourceQualification.restrictedReferenceIds.length
    })),
    proofFingerprint: restitution.proofFingerprint,
    decisionAuthority: "human"
  });
}

export function projectKnowledgeReportSection(restitution) {
  if (restitution?.schema !== KNOWLEDGE_RESTITUTION_SCHEMA) {
    throw new KnowledgeRestitutionError(
      "A valid Knowledge Restitution is required.",
      "KNOWLEDGE_RESTITUTION_VALIDATION_ERROR"
    );
  }
  return freezeDeep({
    id: "enterprise-knowledge-analysis",
    title: "Expertises, couverture et limites",
    type: "knowledge",
    content: {
      asOf: restitution.asOf,
      summary: clone(restitution.summary),
      analysisPlan: clone(restitution.steps),
      uncertainties: clone(restitution.uncertainties),
      deferred: clone(restitution.deferred),
      proofFingerprint: restitution.proofFingerprint,
      decisionAuthority: "human"
    }
  });
}

export function serializeKnowledgeRestitution(restitution) {
  if (restitution?.schema !== KNOWLEDGE_RESTITUTION_SCHEMA) {
    throw new KnowledgeRestitutionError(
      "A valid Knowledge Restitution is required.",
      "KNOWLEDGE_RESTITUTION_VALIDATION_ERROR"
    );
  }
  return JSON.stringify(restitution, null, 2);
}

export function restoreKnowledgeRestitution(serialized) {
  let value;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new KnowledgeRestitutionError(
      `Knowledge Restitution JSON is invalid: ${error.message || error}`,
      "KNOWLEDGE_RESTITUTION_RESTORE_ERROR"
    );
  }
  if (
    value?.schema !== KNOWLEDGE_RESTITUTION_SCHEMA
    || value?.version !== KNOWLEDGE_RESTITUTION_VERSION
  ) {
    throw new KnowledgeRestitutionError(
      "Knowledge Restitution schema or version is unsupported.",
      "KNOWLEDGE_RESTITUTION_RESTORE_ERROR"
    );
  }
  const proof = value.proofFingerprint;
  const { proofFingerprint: ignored, ...core } = value;
  if (proof !== fingerprint(core)) {
    throw new KnowledgeRestitutionError(
      "Knowledge Restitution proof fingerprint is invalid.",
      "KNOWLEDGE_RESTITUTION_INTEGRITY_ERROR"
    );
  }
  return freezeDeep(value);
}
