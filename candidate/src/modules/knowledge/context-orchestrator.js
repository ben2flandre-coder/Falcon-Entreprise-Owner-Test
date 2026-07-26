import { KNOWLEDGE_REGISTRY_VERSION } from "./knowledge-registry.js";

export const CONTEXT_ORCHESTRATOR_VERSION = "1.1.0";

const MASTERY_ORDER = Object.freeze({
  "native-expert": 0,
  "orchestrator-expert": 1,
  "honest-expert": 2
});

export class ContextOrchestratorError extends Error {
  constructor(message, code = "CONTEXT_ORCHESTRATOR_ERROR") {
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

function canonicalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTextList(values, field) {
  if (!Array.isArray(values)) {
    throw new ContextOrchestratorError(
      `${field} must be an array.`,
      "CONTEXT_VALIDATION_ERROR"
    );
  }

  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const display = value.trim().toLowerCase().replace(/\s+/g, " ");
    const canonical = canonicalize(display);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push({ display, canonical });
  }
  return normalized;
}

function includesPhrase(container, phrase) {
  return ` ${container} `.includes(` ${phrase} `);
}

function matchTerms(activationSignal, contextSignal) {
  const activation = canonicalize(activationSignal);
  const context = contextSignal.canonical;
  if (!activation || !context) return null;
  if (activation === context) return { strength: 1, kind: "exact" };
  if (includesPhrase(context, activation)) {
    return { strength: 0.85, kind: "phrase" };
  }

  const activationTokens = activation.split(" ").filter((token) => token.length >= 3);
  const contextTokens = new Set(context.split(" "));
  if (
    activationTokens.length >= 2
    && activationTokens.every((token) => contextTokens.has(token))
  ) {
    return { strength: 0.7, kind: "tokens" };
  }
  return null;
}

function bestSignalMatch(activationSignal, contextSignals) {
  return contextSignals
    .map((contextSignal) => ({
      contextSignal,
      match: matchTerms(activationSignal, contextSignal)
    }))
    .filter(({ match }) => match)
    .sort((left, right) =>
      right.match.strength - left.match.strength
      || left.contextSignal.canonical.localeCompare(right.contextSignal.canonical)
    )[0] || null;
}

function inputReadiness(skill, availableInputs) {
  const available = new Set(availableInputs.map(({ canonical }) => canonical));
  const required = skill.requiredInputs.map((input) => ({
    display: input,
    canonical: canonicalize(input)
  }));
  const present = required.filter(({ canonical }) => available.has(canonical));
  const missing = required.filter(({ canonical }) => !available.has(canonical));
  return {
    present: present.map(({ display }) => display),
    missing: missing.map(({ display }) => display),
    ratio: required.length === 0 ? 1 : present.length / required.length
  };
}

function scoreSkill(skill, contextSignals, availableInputs) {
  const matches = skill.activationSignals
    .map((activationSignal) => ({
      activationSignal,
      best: bestSignalMatch(activationSignal, contextSignals)
    }))
    .filter(({ best }) => best);
  const matchedSignals = [...new Map(matches.map(({ best }) => [
    best.contextSignal.canonical,
    best.contextSignal.display
  ])).values()];
  const readiness = inputReadiness(skill, availableInputs);
  const score = matches.length / skill.activationSignals.length;
  const matchConfidence = matches.length === 0
    ? 0
    : matches.reduce((sum, { best }) => sum + best.match.strength, 0) / matches.length;
  const priorityScore = Number((
    (score * 0.7)
    + (matchConfidence * 0.2)
    + (readiness.ratio * 0.1)
  ).toFixed(4));

  return {
    skill,
    matches,
    matchedSignals,
    score,
    matchConfidence,
    priorityScore,
    readiness
  };
}

function compareCandidates(left, right) {
  return right.priorityScore - left.priorityScore
    || right.score - left.score
    || (MASTERY_ORDER[left.skill.mastery] ?? 99) - (MASTERY_ORDER[right.skill.mastery] ?? 99)
    || left.skill.id.localeCompare(right.skill.id);
}

function skillsConflict(left, right) {
  return left.exclusions.includes(right.id) || right.exclusions.includes(left.id);
}

function priorityLabel(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function coverageLevel(ratio) {
  if (ratio === 1) return "complete";
  if (ratio >= 0.66) return "substantial";
  if (ratio > 0) return "partial";
  return "none";
}

function uniqueSortedUncertainties(uncertainties) {
  const byKey = new Map();
  for (const uncertainty of uncertainties) {
    const key = JSON.stringify(uncertainty);
    byKey.set(key, uncertainty);
  }
  return [...byKey.values()].sort((left, right) =>
    left.code.localeCompare(right.code)
    || (left.skillId || "").localeCompare(right.skillId || "")
    || (left.signal || left.input || "").localeCompare(right.signal || right.input || "")
  );
}

export function createContextOrchestrator({ registry } = {}) {
  if (!registry || typeof registry.listSkills !== "function" || typeof registry.manifest !== "function") {
    throw new ContextOrchestratorError(
      "A valid Knowledge Registry is required.",
      "CONTEXT_CONFIGURATION_ERROR"
    );
  }

  function orchestrate({ signals = [], availableInputs = [], minimumScore = 0.25 } = {}) {
    if (typeof minimumScore !== "number" || Number.isNaN(minimumScore) || minimumScore < 0 || minimumScore > 1) {
      throw new ContextOrchestratorError(
        "minimumScore must be between 0 and 1.",
        "CONTEXT_VALIDATION_ERROR"
      );
    }

    registry.manifest();
    const normalizedSignals = normalizeTextList(signals, "signals");
    const normalizedInputs = normalizeTextList(availableInputs, "availableInputs");
    const allSkills = registry.listSkills();
    const skillsById = new Map(allSkills.map((skill) => [skill.id, skill]));
    const candidates = allSkills
      .map((skill) => scoreSkill(skill, normalizedSignals, normalizedInputs))
      .filter((candidate) => candidate.matches.length > 0 && candidate.score >= minimumScore)
      .sort(compareCandidates);

    const accepted = [];
    const deferredCandidates = [];
    for (const candidate of candidates) {
      const conflicting = accepted.filter(({ skill }) => skillsConflict(candidate.skill, skill));
      if (conflicting.length > 0) {
        deferredCandidates.push({
          ...candidate,
          conflictingWith: conflicting.map(({ skill }) => skill.id).sort()
        });
      } else {
        accepted.push(candidate);
      }
    }

    const selectedIds = new Set(accepted.map(({ skill }) => skill.id));
    const selected = accepted.map((candidate, index) => {
      const { skill, matches, matchedSignals, score, matchConfidence, priorityScore, readiness } = candidate;
      const activeComplements = skill.complements.filter((id) => selectedIds.has(id)).sort();
      const recommendedComplements = skill.complements
        .filter((id) => !selectedIds.has(id) && skillsById.has(id))
        .sort();
      const unresolvedComplements = skill.complements
        .filter((id) => !selectedIds.has(id) && !skillsById.has(id))
        .sort();
      return {
        id: skill.id,
        version: skill.version,
        corpusId: skill.corpusId,
        title: skill.title,
        mastery: skill.mastery,
        rank: index + 1,
        priority: priorityLabel(priorityScore),
        priorityScore,
        matchedSignals,
        matchedActivationSignals: matches.map(({ activationSignal }) => activationSignal),
        matchConfidence: Number(matchConfidence.toFixed(4)),
        score,
        selectionReasons: [
          {
            code: "ACTIVATION_SIGNALS_MATCHED",
            detail: `${matches.length}/${skill.activationSignals.length} signal(aux) d’activation reconnu(s).`
          },
          {
            code: "MASTERY_DECLARED",
            detail: `Niveau de maîtrise déclaré : ${skill.mastery}.`
          }
        ],
        requiredInputs: [...skill.requiredInputs],
        availableRequiredInputs: readiness.present,
        missingRequiredInputs: readiness.missing,
        inputReadiness: Number(readiness.ratio.toFixed(4)),
        complements: activeComplements,
        recommendedComplements,
        unresolvedComplements,
        exclusions: skill.exclusions.filter((id) => selectedIds.has(id)).sort(),
        evidenceOutputs: [...skill.evidenceOutputs],
        limitations: [...skill.limitations]
      };
    });

    const deferred = deferredCandidates.map(({ skill, conflictingWith, ...candidate }) => ({
      id: skill.id,
      version: skill.version,
      corpusId: skill.corpusId,
      title: skill.title,
      mastery: skill.mastery,
      priority: priorityLabel(candidate.priorityScore),
      priorityScore: candidate.priorityScore,
      matchedSignals: candidate.matchedSignals,
      score: candidate.score,
      reason: "exclusion-conflict",
      conflictingWith,
      limitations: [...skill.limitations]
    }));

    const coveredSignalCanonicals = new Set(accepted.flatMap(({ matchedSignals }) =>
      matchedSignals.map((signal) => canonicalize(signal))
    ));
    const coveredSignals = normalizedSignals
      .filter(({ canonical }) => coveredSignalCanonicals.has(canonical))
      .map(({ display }) => display);
    const uncoveredSignals = normalizedSignals
      .filter(({ canonical }) => !coveredSignalCanonicals.has(canonical))
      .map(({ display }) => display);
    const coverage = normalizedSignals.length === 0
      ? 0
      : coveredSignals.length / normalizedSignals.length;
    const corpusIds = [...new Set(selected.map((skill) => skill.corpusId))].sort();
    const complementRecommendations = [...new Set(selected.flatMap((skill) =>
      skill.recommendedComplements
    ))].sort();

    const uncertainties = [];
    for (const signal of uncoveredSignals) {
      uncertainties.push({ code: "UNCOVERED_SIGNAL", severity: "high", signal });
    }
    for (const skill of selected) {
      for (const input of skill.missingRequiredInputs) {
        uncertainties.push({
          code: "MISSING_REQUIRED_INPUT",
          severity: "high",
          skillId: skill.id,
          input
        });
      }
      if (skill.mastery !== "native-expert") {
        uncertainties.push({
          code: "LIMITED_MASTERY",
          severity: "medium",
          skillId: skill.id,
          mastery: skill.mastery
        });
      }
      for (const complementId of skill.recommendedComplements) {
        uncertainties.push({
          code: "COMPLEMENT_RECOMMENDED",
          severity: "medium",
          skillId: skill.id,
          complementId
        });
      }
    }
    for (const skill of deferred) {
      uncertainties.push({
        code: "EXCLUSION_CONFLICT",
        severity: "high",
        skillId: skill.id,
        conflictingWith: skill.conflictingWith
      });
    }

    const normalizedUncertainties = uniqueSortedUncertainties(uncertainties);
    return freezeDeep({
      schema: "falcon.knowledge.orchestration.v1",
      orchestratorVersion: CONTEXT_ORCHESTRATOR_VERSION,
      registryVersion: KNOWLEDGE_REGISTRY_VERSION,
      signals: normalizedSignals.map(({ display }) => display),
      availableInputs: normalizedInputs.map(({ display }) => display),
      selected,
      deferred,
      complementRecommendations,
      corpusIds,
      detectedDomains: corpusIds.map((corpusId) => ({
        corpusId,
        skillIds: selected.filter((skill) => skill.corpusId === corpusId).map((skill) => skill.id)
      })),
      coverage,
      coverageDetails: {
        ratio: coverage,
        level: coverageLevel(coverage),
        coveredSignals,
        uncoveredSignals,
        selectedSkillCount: selected.length,
        domainCount: corpusIds.length
      },
      uncoveredSignals,
      uncertainties: normalizedUncertainties,
      requiresHumanArbitration: normalizedUncertainties.length > 0
        || selected.some((skill) => skill.exclusions.length > 0),
      decisionAuthority: "human"
    });
  }

  return Object.freeze({ orchestrate });
}
