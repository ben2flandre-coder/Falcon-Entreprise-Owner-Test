const OWNER = "RMBD-RISKMANAGEMENT";
const CHECKED_AT = "2026-07-26";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

const COMMON_PERSISTENCE =
  "Persist the selected Skill and pack versions, source identifiers, context inputs, limitations and human validation with the dossier.";
const COMMON_REPORTING =
  "Report the method scope, precise source locators, applicability status, missing inputs, limitations and human arbitration.";
const COMMON_AUDIT =
  "Audit activation signals, versions, source verification dates, lifecycle status, dossier applicability and the final human decision.";
const DOSSIER_REVALIDATION =
  "La vigueur, la version et l’applicabilité doivent être revérifiées selon la date, le lieu, l’activité et le contexte exacts du dossier.";

const chimiqueCmrPack = {
  schema: "falcon.knowledge.pack.v1",
  id: "eki2.chimique-cmr",
  version: "1.0.0",
  title: "Risque chimique — agents chimiques dangereux et CMR",
  owner: OWNER,
  checkedAt: CHECKED_AT,
  corpus: {
    schema: "falcon.knowledge.corpus.v1",
    id: "chimique-cmr",
    version: "1.0.0",
    title: "Risque chimique et CMR",
    purpose:
      "Qualifier une exposition potentielle à des agents chimiques dangereux ou CMR et organiser les données, sources et validations nécessaires.",
    domains: [
      "risque chimique",
      "agents chimiques dangereux",
      "cancérogènes mutagènes reprotoxiques"
    ],
    terminology: [
      "CMR",
      "agent chimique dangereux",
      "fiche de données de sécurité",
      "FDS",
      "VLEP",
      "substitution",
      "exposition"
    ],
    referenceFamilies: [
      "Code du travail",
      "INRS",
      "règlements REACH et CLP"
    ],
    accidentModels: [
      "inhalation d’un agent chimique",
      "contact cutané ou oculaire",
      "ingestion accidentelle",
      "exposition chronique à un CMR"
    ],
    applicabilityRules: [
      "présence ou émission possible d’un agent chimique dangereux",
      "produit, mélange ou procédé classé ou suspecté CMR",
      "activité susceptible de générer poussières, fumées, gaz ou aérosols"
    ],
    relatedCorpus: ["amiante", "atex", "ergonomie-tms"],
    owner: OWNER
  },
  references: [
    {
      id: "chimique.inrs.reglementation",
      title: "Prévenir les risques chimiques — réglementation",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "Dossier Risques chimiques — réglementation de la prévention",
      url: "https://www.inrs.fr/risques/chimiques/reglementation.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Cadre institutionnel pour identifier les règles d’évaluation et de prévention à vérifier selon les agents, activités et expositions du dossier.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La page d’orientation ne remplace pas la lecture des textes précisément applicables."
      ]
    },
    {
      id: "chimique.inrs.ed6483",
      title: "La fiche de données de sécurité",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "ED 6483",
      url: "https://www.inrs.fr/dms/inrs/CataloguePapier/ED/TI-ED-6483/ed6483.pdf",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Guide de lecture d’une FDS à rapprocher du produit réellement utilisé, de sa version et des conditions de travail.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Une FDS absente, ancienne ou générique ne démontre pas la maîtrise de l’exposition réelle."
      ]
    },
    {
      id: "chimique.inrs.vlep",
      title: "Valeurs limites d’exposition professionnelle",
      authority: "INRS",
      type: "tool",
      locator: "Base de données VLEP",
      url: "https://www.inrs.fr/publications/bdd/vlep.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Base d’orientation pour rechercher une valeur limite associée à un agent et vérifier son statut réglementaire ou recommandé.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La présence d’une VLEP ne remplace ni la stratégie de mesurage ni l’interprétation professionnelle de l’exposition."
      ]
    }
  ],
  skills: [
    {
      schema: "falcon.knowledge.skill.v1",
      id: "chimique.cmr.evaluation",
      version: "1.0.0",
      corpusId: "chimique-cmr",
      title: "Qualification du risque chimique et CMR",
      purpose:
        "Identifier les agents et expositions à qualifier, structurer les données FDS/VLEP et orienter la prévention sans calculer une conformité d’exposition.",
      mastery: "orchestrator-expert",
      activationSignals: [
        "produit CMR",
        "agent chimique dangereux",
        "fiche de données de sécurité",
        "exposition chimique"
      ],
      requiredInputs: [
        "agent ou produit concerné",
        "activité et procédé",
        "fiche de données de sécurité",
        "durée et fréquence d’exposition",
        "mesures de prévention existantes"
      ],
      methods: [
        "inventaire des agents et émissions",
        "qualification documentaire FDS",
        "orientation vers substitution, prévention et mesurage"
      ],
      references: [
        "chimique.inrs.reglementation",
        "chimique.inrs.ed6483",
        "chimique.inrs.vlep"
      ],
      evidenceOutputs: [
        "inventaire des agents et voies d’exposition à valider",
        "état des FDS et références VLEP",
        "lacunes de prévention, mesurage ou substitution"
      ],
      limitations: [
        "Falcon ne mesure pas une exposition et ne calcule pas le respect d’une VLEP.",
        "Falcon ne classe pas seul une substance ou un mélange.",
        DOSSIER_REVALIDATION
      ],
      complements: [],
      exclusions: [],
      owner: OWNER,
      persistence: COMMON_PERSISTENCE,
      reporting: COMMON_REPORTING,
      audit: COMMON_AUDIT
    }
  ]
};

const atexPack = {
  schema: "falcon.knowledge.pack.v1",
  id: "eki2.atex",
  version: "1.0.0",
  title: "ATEX — prévention des atmosphères explosives",
  owner: OWNER,
  checkedAt: CHECKED_AT,
  corpus: {
    schema: "falcon.knowledge.corpus.v1",
    id: "atex",
    version: "1.0.0",
    title: "Atmosphères explosives et incendie-explosion",
    purpose:
      "Reconnaître une situation susceptible de former une ATEX et orienter la qualification du zonage, des sources d’inflammation et des mesures de prévention.",
    domains: [
      "ATEX",
      "explosion",
      "incendie-explosion"
    ],
    terminology: [
      "atmosphère explosive",
      "zone ATEX",
      "source d’inflammation",
      "gaz",
      "vapeur",
      "brouillard",
      "poussière combustible"
    ],
    referenceFamilies: [
      "Code du travail",
      "INRS",
      "directives ATEX"
    ],
    accidentModels: [
      "formation d’une atmosphère explosive",
      "inflammation d’un mélange explosif",
      "propagation d’une explosion",
      "effets thermiques et de surpression"
    ],
    applicabilityRules: [
      "présence possible d’un combustible dispersé dans l’air",
      "formation possible d’un mélange explosif",
      "présence ou introduction possible d’une source d’inflammation"
    ],
    relatedCorpus: ["chimique-cmr", "electricite"],
    owner: OWNER
  },
  references: [
    {
      id: "atex.inrs.prevention",
      title: "Explosion sur le lieu de travail — démarche de prévention",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "Dossier Explosion — démarche de prévention",
      url: "https://www.inrs.fr/risques/explosion/demarche-prevention-risques.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Démarche d’orientation pour empêcher la formation d’une ATEX, éliminer les sources d’inflammation et limiter les effets.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La démarche générale ne constitue pas un zonage ni une étude d’explosion du site."
      ]
    },
    {
      id: "atex.inrs.zonage",
      title: "Zonage et marquage des appareils ATEX",
      authority: "INRS",
      type: "method",
      locator: "Dossier Explosion — zonage et marquage",
      url: "https://www.inrs.fr/risques/explosion/zonage-marquage-materiel-atex.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Référence d’orientation pour relier la formation probable d’une ATEX au zonage et à l’adéquation des matériels.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Falcon ne détermine pas seul une zone ni l’adéquation réelle d’un équipement."
      ]
    },
    {
      id: "atex.inrs.reglementation",
      title: "Explosion sur le lieu de travail — réglementation et textes de référence",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "Dossier Explosion — réglementation ATEX",
      url: "https://www.inrs.fr/risques/explosion/reglementation-textes-reference.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Point d’entrée institutionnel vers les textes et catégories de matériels à vérifier dans le contexte du dossier.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La synthèse ne remplace pas la vérification des textes, du DRPCE et des données techniques du site."
      ]
    }
  ],
  skills: [
    {
      schema: "falcon.knowledge.skill.v1",
      id: "atex.explosion.prevention",
      version: "1.0.0",
      corpusId: "atex",
      title: "Qualification initiale d’un contexte ATEX",
      purpose:
        "Repérer les conditions possibles de formation et d’inflammation d’une ATEX et organiser les vérifications spécialisées requises.",
      mastery: "orchestrator-expert",
      activationSignals: [
        "zone ATEX",
        "atmosphère explosive",
        "poussière combustible",
        "risque explosion"
      ],
      requiredInputs: [
        "substance ou poussière concernée",
        "conditions d’émission",
        "ventilation",
        "sources d’inflammation",
        "zonage existant"
      ],
      methods: [
        "qualification des conditions de formation d’une ATEX",
        "inventaire des sources d’inflammation",
        "orientation vers zonage, adéquation matériels et DRPCE"
      ],
      references: [
        "atex.inrs.prevention",
        "atex.inrs.zonage",
        "atex.inrs.reglementation"
      ],
      evidenceOutputs: [
        "conditions de formation d’une ATEX à confirmer",
        "sources d’inflammation et matériels à vérifier",
        "besoin de zonage, DRPCE ou étude spécialisée"
      ],
      limitations: [
        "Falcon ne réalise ni zonage ATEX ni calcul d’explosion.",
        "Falcon ne certifie pas l’adéquation d’un appareil ou d’une installation.",
        DOSSIER_REVALIDATION
      ],
      complements: [],
      exclusions: [],
      owner: OWNER,
      persistence: COMMON_PERSISTENCE,
      reporting: COMMON_REPORTING,
      audit: COMMON_AUDIT
    }
  ]
};

const levagePack = {
  schema: "falcon.knowledge.pack.v1",
  id: "eki2.levage",
  version: "1.0.0",
  title: "Levage — appareils, accessoires et opérations",
  owner: OWNER,
  checkedAt: CHECKED_AT,
  corpus: {
    schema: "falcon.knowledge.corpus.v1",
    id: "levage",
    version: "1.0.0",
    title: "Opérations et équipements de levage",
    purpose:
      "Qualifier une opération de levage et orienter vers l’adéquation, les vérifications, les accessoires et les compétences à valider.",
    domains: [
      "levage",
      "appareils de levage",
      "accessoires de levage"
    ],
    terminology: [
      "charge maximale d’utilisation",
      "CMU",
      "élingage",
      "examen d’adéquation",
      "vérification générale périodique",
      "VGP",
      "chef de manœuvre"
    ],
    referenceFamilies: [
      "Code du travail",
      "INRS",
      "arrêté du 1er mars 2004"
    ],
    accidentModels: [
      "chute de charge",
      "rupture d’un accessoire",
      "renversement d’un appareil",
      "heurt ou écrasement pendant la manœuvre"
    ],
    applicabilityRules: [
      "déplacement d’une charge suspendue",
      "utilisation d’un appareil ou accessoire de levage",
      "présence de personnes dans l’environnement d’une manœuvre"
    ],
    relatedCorpus: ["electricite", "ergonomie-tms"],
    owner: OWNER
  },
  references: [
    {
      id: "levage.inrs.ed6339",
      title: "Vérifications réglementaires des machines, appareils et accessoires de levage",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "ED 6339",
      url: "https://www.inrs.fr/dam/inrs/CataloguePapier/ED/TI-ED-6339.pdf",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Repères pour qualifier les vérifications applicables à l’équipement et à sa situation d’utilisation.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Le document ne prouve ni la réalisation ni le résultat satisfaisant d’une vérification."
      ]
    },
    {
      id: "levage.inrs.ed6178",
      title: "Mémento de l’élingueur",
      authority: "INRS",
      type: "method",
      locator: "ED 6178",
      url: "https://www.inrs.fr/dam/inrs/CataloguePapier/ED/TI-ED-6178.pdf",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Référence de prévention pour préparer une opération d’élingage selon la charge, les accessoires et l’environnement.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Falcon ne dimensionne pas un élingage et ne valide pas l’état réel d’un accessoire."
      ]
    },
    {
      id: "levage.inrs.controles",
      title: "Contrôles périodiques des équipements — obligations de l’employeur",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "Focus juridique — contrôles périodiques des équipements",
      url: "https://www.inrs.fr/publications/juridique/focus-juridiques/focus-juridique-controle-periodiques-equipements-obligations-employeur.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Point d’orientation pour qualifier l’obligation de contrôle, sa périodicité et sa formalisation selon l’équipement.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La page générale doit être rapprochée de l’équipement, de l’arrêté et des conditions réelles d’utilisation."
      ]
    }
  ],
  skills: [
    {
      schema: "falcon.knowledge.skill.v1",
      id: "levage.operation.qualification",
      version: "1.0.0",
      corpusId: "levage",
      title: "Qualification d’une opération de levage",
      purpose:
        "Structurer les données d’une opération de levage et orienter vers les vérifications d’adéquation, d’état, d’élingage et de compétences.",
      mastery: "honest-expert",
      activationSignals: [
        "opération de levage",
        "charge suspendue",
        "élingage",
        "appareil de levage"
      ],
      requiredInputs: [
        "charge et centre de gravité",
        "appareil de levage",
        "accessoires de levage",
        "configuration et environnement",
        "compétences des intervenants",
        "preuves de vérification"
      ],
      methods: [
        "qualification de l’opération et de son environnement",
        "inventaire des appareils, accessoires et preuves",
        "orientation vers examen d’adéquation et plan de levage"
      ],
      references: [
        "levage.inrs.ed6339",
        "levage.inrs.ed6178",
        "levage.inrs.controles"
      ],
      evidenceOutputs: [
        "données de charge et de configuration à valider",
        "état des vérifications et compétences",
        "besoin de plan de levage ou d’expertise spécialisée"
      ],
      limitations: [
        "Falcon ne dimensionne ni appareil, ni accessoire, ni plan de levage.",
        "Falcon ne réalise pas une VGP et ne délivre aucune autorisation de conduite.",
        DOSSIER_REVALIDATION
      ],
      complements: [],
      exclusions: [],
      owner: OWNER,
      persistence: COMMON_PERSISTENCE,
      reporting: COMMON_REPORTING,
      audit: COMMON_AUDIT
    }
  ]
};

export const EKI2_PRIORITY_PACKS = freezeDeep([
  chimiqueCmrPack,
  atexPack,
  levagePack
]);
