import { createContextOrchestrator } from "./context-orchestrator.js";
import { createKnowledgeCatalog } from "./knowledge-catalog.js";
import {
  createKnowledgeRestitution,
  projectKnowledgeCockpitPanel,
  projectKnowledgeReportSection,
  restoreKnowledgeRestitution
} from "./knowledge-restitution.js";
import { EKI2_PILOT_PACKS } from "./packs/eki2-pilot-packs.js";
import { EKI2_PRIORITY_PACKS } from "./packs/eki2-priority-packs.js";
import { createReferenceLifecycle } from "./reference-lifecycle.js";

export const ENTERPRISE_KNOWLEDGE_SERVICE_VERSION = "1.0.0";
export const ENTERPRISE_KNOWLEDGE_SNAPSHOT_SCHEMA =
  "falcon.enterprise.knowledge.snapshot.v1";

export const EKI_OWNER_SCENARIOS = Object.freeze([
  Object.freeze({
    id: "amiante-ss4",
    title: "Amiante · intervention SS4",
    description: "Cadrer une intervention sur matériau amianté et l’usage de Scolamiante.",
    signals: Object.freeze(["intervention SS4", "matériau amianté", "Scolamiante"]),
    availableInputs: Object.freeze([
      "nature de l’intervention",
      "matériau concerné",
      "processus de travail",
      "résultat Scolamiante"
    ])
  }),
  Object.freeze({
    id: "electricite",
    title: "Électricité · consignation",
    description: "Qualifier une opération électrique, le voisinage et l’habilitation à vérifier.",
    signals: Object.freeze(["habilitation électrique", "consignation", "opération électrique"]),
    availableInputs: Object.freeze([
      "nature de l’opération",
      "domaine de tension",
      "environnement électrique",
      "habilitation déclarée"
    ])
  }),
  Object.freeze({
    id: "ergonomie-tms",
    title: "Ergonomie · TMS",
    description: "Structurer l’analyse d’un poste exposé aux gestes répétitifs et contraintes posturales.",
    signals: Object.freeze(["troubles musculosquelettiques", "gestes répétitifs", "posture contraignante"]),
    availableInputs: Object.freeze([
      "activité observée",
      "durée et fréquence",
      "postures et efforts",
      "variabilité du travail"
    ])
  }),
  Object.freeze({
    id: "chimique-cmr",
    title: "Chimique · CMR",
    description: "Organiser la qualification d’un agent CMR, des FDS et de l’exposition.",
    signals: Object.freeze(["produit CMR", "fiche de données de sécurité", "exposition chimique"]),
    availableInputs: Object.freeze([
      "agent ou produit concerné",
      "activité et procédé",
      "fiche de données de sécurité",
      "durée et fréquence d’exposition",
      "mesures de prévention existantes"
    ])
  }),
  Object.freeze({
    id: "atex",
    title: "ATEX · explosion",
    description: "Cadrer une atmosphère explosive potentielle, son zonage et les sources d’inflammation.",
    signals: Object.freeze(["zone ATEX", "atmosphère explosive", "source d’inflammation"]),
    availableInputs: Object.freeze([
      "substance ou poussière concernée",
      "conditions de formation de l’atmosphère",
      "sources d’inflammation possibles",
      "zonage existant"
    ])
  }),
  Object.freeze({
    id: "levage",
    title: "Levage · charge suspendue",
    description: "Qualifier une opération de levage, les équipements et la préparation à vérifier.",
    signals: Object.freeze(["opération de levage", "charge suspendue", "accessoire de levage"]),
    availableInputs: Object.freeze([
      "charge et centre de gravité",
      "équipement de levage",
      "accessoires de levage",
      "environnement et trajectoire",
      "personnes compétentes"
    ])
  })
]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function normalizeScopeId(value) {
  const normalized = String(value || "global").trim();
  if (!normalized || normalized.length > 160) {
    throw new TypeError("Knowledge analysis scopeId must contain between 1 and 160 characters.");
  }
  return normalized;
}

function normalizeAsOf(value) {
  const candidate = String(value || "").slice(0, 10);
  const instant = new Date(`${candidate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(candidate)
    || Number.isNaN(instant.getTime())
    || instant.toISOString().slice(0, 10) !== candidate
  ) {
    throw new TypeError("Knowledge analysis requires a valid YYYY-MM-DD asOf date.");
  }
  return candidate;
}

export function isEnterpriseKnowledgeSnapshot(value) {
  return Boolean(
    value
    && value.schema === ENTERPRISE_KNOWLEDGE_SNAPSHOT_SCHEMA
    && value.version === ENTERPRISE_KNOWLEDGE_SERVICE_VERSION
    && Number.isInteger(value.analysisCount)
    && Array.isArray(value.analyses)
    && value.analysisCount === value.analyses.length
  );
}

export function createEnterpriseKnowledgeService({
  initialSnapshot = null,
  now = () => new Date().toISOString(),
  onChange = () => {}
} = {}) {
  if (typeof now !== "function") throw new TypeError("Knowledge service clock must be a function.");
  if (typeof onChange !== "function") throw new TypeError("Knowledge change hook must be a function.");

  const catalog = createKnowledgeCatalog({
    packs: [...EKI2_PILOT_PACKS, ...EKI2_PRIORITY_PACKS]
  });
  const lifecycle = createReferenceLifecycle({ catalog });
  const orchestrator = createContextOrchestrator({ registry: catalog.registry });
  const analyses = new Map();

  function restoreSnapshot(snapshot) {
    if (!isEnterpriseKnowledgeSnapshot(snapshot)) {
      throw new TypeError("Stored Enterprise Knowledge snapshot is invalid.");
    }
    analyses.clear();
    for (const entry of snapshot.analyses) {
      const scopeId = normalizeScopeId(entry.scopeId);
      const restitution = restoreKnowledgeRestitution(
        JSON.stringify(entry.restitution)
      );
      analyses.set(scopeId, {
        scopeId,
        scenarioId: entry.scenarioId == null ? null : String(entry.scenarioId),
        signals: [...entry.signals],
        availableInputs: [...entry.availableInputs],
        updatedAt: String(entry.updatedAt),
        restitution
      });
    }
  }

  function analyze({
    scopeId = "global",
    scenarioId = null,
    signals = [],
    availableInputs = [],
    asOf = String(now()).slice(0, 10),
    minimumScore = 0.25
  } = {}) {
    const normalizedScopeId = normalizeScopeId(scopeId);
    const normalizedAsOf = normalizeAsOf(asOf);
    const orchestration = orchestrator.orchestrate({
      signals,
      availableInputs,
      minimumScore
    });
    const restitution = createKnowledgeRestitution({
      catalog,
      lifecycle,
      orchestration,
      asOf: normalizedAsOf
    });
    const entry = {
      scopeId: normalizedScopeId,
      scenarioId: scenarioId == null ? null : String(scenarioId),
      signals: [...orchestration.signals],
      availableInputs: [...orchestration.availableInputs],
      updatedAt: String(now()),
      restitution
    };
    analyses.set(normalizedScopeId, entry);
    onChange(freezeDeep({
      action: "knowledge.analyzed",
      scopeId: normalizedScopeId,
      scenarioId: entry.scenarioId,
      restitution: clone(restitution)
    }));
    return restitution;
  }

  function analyzeScenario(scenarioId, {
    scopeId = "owner-trial",
    asOf = String(now()).slice(0, 10)
  } = {}) {
    const scenario = EKI_OWNER_SCENARIOS.find(({ id }) => id === scenarioId);
    if (!scenario) throw new TypeError(`Unknown EKI owner scenario: ${String(scenarioId)}`);
    return analyze({
      scopeId,
      scenarioId: scenario.id,
      signals: scenario.signals,
      availableInputs: scenario.availableInputs,
      asOf
    });
  }

  function requireEntry(scopeId) {
    return analyses.get(normalizeScopeId(scopeId)) || null;
  }

  function getRestitution(scopeId = "global") {
    const entry = requireEntry(scopeId);
    return entry ? freezeDeep(clone(entry.restitution)) : null;
  }

  function getCockpitPanel(scopeId = "global") {
    const restitution = getRestitution(scopeId);
    return restitution ? projectKnowledgeCockpitPanel(restitution) : null;
  }

  function getReportSection(scopeId = "global") {
    const restitution = getRestitution(scopeId);
    return restitution ? projectKnowledgeReportSection(restitution) : null;
  }

  function listAnalyses() {
    return freezeDeep([...analyses.values()]
      .sort((left, right) => left.scopeId.localeCompare(right.scopeId))
      .map((entry) => ({
        scopeId: entry.scopeId,
        scenarioId: entry.scenarioId,
        signals: [...entry.signals],
        availableInputs: [...entry.availableInputs],
        updatedAt: entry.updatedAt,
        restitution: clone(entry.restitution)
      })));
  }

  function snapshot() {
    const entries = listAnalyses();
    return freezeDeep({
      schema: ENTERPRISE_KNOWLEDGE_SNAPSHOT_SCHEMA,
      version: ENTERPRISE_KNOWLEDGE_SERVICE_VERSION,
      analysisCount: entries.length,
      analyses: entries
    });
  }

  if (initialSnapshot) restoreSnapshot(initialSnapshot);

  return Object.freeze({
    version: ENTERPRISE_KNOWLEDGE_SERVICE_VERSION,
    catalog,
    lifecycle,
    scenarios: EKI_OWNER_SCENARIOS,
    analyze,
    analyzeScenario,
    getRestitution,
    getCockpitPanel,
    getReportSection,
    listAnalyses,
    snapshot
  });
}
