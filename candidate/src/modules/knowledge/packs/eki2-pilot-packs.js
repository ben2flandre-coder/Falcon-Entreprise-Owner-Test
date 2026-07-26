const OWNER = "RMBD-RISKMANAGEMENT";
const CHECKED_AT = "2026-07-26";

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

const COMMON_PERSISTENCE =
  "Persist the selected Skill version, referenced source identifiers, context inputs and human validation with the dossier.";
const COMMON_REPORTING =
  "Report the selected method, source locators, applicability status, missing inputs, limitations and human arbitration.";
const COMMON_AUDIT =
  "Audit activation signals, pack and Skill versions, source verification dates, applicability revalidation and the final human decision.";
const DOSSIER_REVALIDATION =
  "La vigueur, la version et l’applicabilité doivent être revérifiées selon la date, le lieu et le contexte exacts du dossier.";

const amiantePack = {
  schema: "falcon.knowledge.pack.v1",
  id: "eki2.amiante-ss4",
  version: "1.0.0",
  title: "Amiante — SS4 et orientation Scolamiante",
  owner: OWNER,
  checkedAt: CHECKED_AT,
  corpus: {
    schema: "falcon.knowledge.corpus.v1",
    id: "amiante",
    version: "1.0.0",
    title: "Amiante et interventions SS4",
    purpose:
      "Qualifier un contexte amiante, reconnaître le cadre SS4 et orienter l’analyse d’une estimation Scolamiante sans conclure à la place du professionnel.",
    domains: [
      "amiante",
      "exposition professionnelle",
      "interventions sur matériaux contenant de l’amiante"
    ],
    terminology: [
      "SS3",
      "SS4",
      "Scolamiante",
      "matériau contenant de l’amiante",
      "empoussièrement",
      "mode opératoire"
    ],
    referenceFamilies: [
      "Code du travail",
      "INRS",
      "Ministère chargé du Travail"
    ],
    accidentModels: [
      "inhalation de fibres d’amiante",
      "dispersion de fibres",
      "contamination croisée"
    ],
    applicabilityRules: [
      "présence ou suspicion d’un matériau contenant de l’amiante",
      "intervention susceptible d’émettre des fibres",
      "qualification préalable du cadre SS3 ou SS4"
    ],
    relatedCorpus: ["electricite", "ergonomie-tms"],
    owner: OWNER
  },
  references: [
    {
      id: "amiante.inrs.scolamiante",
      title: "Scolamiante — estimation a priori des empoussièrements",
      authority: "INRS",
      type: "tool",
      locator: "Outil 146",
      url: "https://www.inrs.fr/media.html?refINRS=outil146",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Source d’orientation pour une estimation a priori dans le périmètre déclaré par l’outil ; le résultat doit rester relié au processus réel et aux mesures disponibles.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Une estimation ne remplace ni la mesure d’empoussièrement ni la validation du mode opératoire."
      ]
    },
    {
      id: "amiante.inrs.ed6262",
      title: "Interventions d’entretien et de maintenance susceptibles d’émettre des fibres d’amiante",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "ED 6262",
      url: "https://www.inrs.fr/media.html?refINRS=ED+6262",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Guide de prévention à rapprocher de la nature de l’intervention, des matériaux, des processus et des mesures de protection du dossier.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Le guide ne suffit pas à établir seul la qualification réglementaire ou la conformité de l’intervention."
      ]
    },
    {
      id: "amiante.travail.prevention",
      title: "Prévention des risques liés à l’amiante",
      authority: "Ministère chargé du Travail",
      type: "institutional-guidance",
      locator: "Synthèse officielle et renvoi au Code du travail, sous-section amiante",
      url: "https://travail-emploi.gouv.fr/la-prevention-des-risques-lies-lamiante",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Point d’entrée institutionnel pour identifier le cadre réglementaire à vérifier dans sa version applicable au dossier.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La page de synthèse ne remplace pas la lecture des articles et textes précisément applicables."
      ]
    }
  ],
  skills: [
    {
      schema: "falcon.knowledge.skill.v1",
      id: "amiante.ss4.scolamiante",
      version: "1.0.0",
      corpusId: "amiante",
      title: "Orientation SS4 et Scolamiante",
      purpose:
        "Reconnaître un contexte SS4, cadrer l’usage d’une estimation Scolamiante et rendre explicites les données, sources et validations encore requises.",
      mastery: "orchestrator-expert",
      activationSignals: [
        "intervention SS4",
        "Scolamiante",
        "matériau amianté",
        "empoussièrement amiante"
      ],
      requiredInputs: [
        "nature de l’intervention",
        "matériau concerné",
        "processus de travail",
        "résultat Scolamiante"
      ],
      methods: [
        "qualification prudente du cadre SS4",
        "lecture encadrée d’une estimation Scolamiante",
        "inventaire des données et validations manquantes"
      ],
      references: [
        "amiante.inrs.scolamiante",
        "amiante.inrs.ed6262",
        "amiante.travail.prevention"
      ],
      evidenceOutputs: [
        "qualification contextuelle SS4 à valider",
        "trace de l’estimation Scolamiante et de ses entrées",
        "liste des vérifications réglementaires et techniques requises"
      ],
      limitations: [
        "Falcon n’exécute pas une mesure d’empoussièrement et ne valide pas un mode opératoire.",
        "Falcon ne conclut ni à la conformité réglementaire ni à l’aptitude de l’intervention.",
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

const electricitePack = {
  schema: "falcon.knowledge.pack.v1",
  id: "eki2.electricite",
  version: "1.0.0",
  title: "Électricité — opérations, prévention et habilitation",
  owner: OWNER,
  checkedAt: CHECKED_AT,
  corpus: {
    schema: "falcon.knowledge.corpus.v1",
    id: "electricite",
    version: "1.0.0",
    title: "Risque électrique",
    purpose:
      "Qualifier les opérations sur ou au voisinage des installations électriques et orienter vers les mesures, compétences et références à valider.",
    domains: [
      "électricité",
      "maintenance",
      "opérations sur installations électriques"
    ],
    terminology: [
      "habilitation électrique",
      "consignation",
      "voisinage",
      "domaine de tension",
      "travail hors tension",
      "opération d’ordre électrique"
    ],
    referenceFamilies: [
      "Code du travail",
      "INRS",
      "NF C 18-510"
    ],
    accidentModels: [
      "électrisation",
      "électrocution",
      "arc électrique",
      "incendie d’origine électrique"
    ],
    applicabilityRules: [
      "opération sur une installation électrique",
      "opération dans l’environnement d’une installation électrique",
      "présence possible d’énergie électrique"
    ],
    relatedCorpus: ["amiante", "ergonomie-tms"],
    owner: OWNER
  },
  references: [
    {
      id: "electricite.inrs.ed6127",
      title: "L’habilitation électrique",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "ED 6127",
      url: "https://www.inrs.fr/media.html?refINRS=ED+6127",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Référence de prévention pour cadrer l’habilitation au regard des opérations, de l’environnement et des compétences requises.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La déclaration d’une habilitation ne prouve ni sa validité ni son adéquation à l’opération réelle."
      ]
    },
    {
      id: "electricite.inrs.operations",
      title: "Opérations sur les installations électriques",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "Dossier Risques électriques — opérations sur installations",
      url: "https://www.inrs.fr/risques/electriques/operations-installations.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Guide d’orientation selon la nature de l’opération et les conditions d’intervention.",
      limitations: [
        DOSSIER_REVALIDATION,
        "L’analyse doit être complétée par les caractéristiques réelles de l’installation et de l’opération."
      ]
    },
    {
      id: "electricite.legifrance.r4544-14",
      title: "Code du travail — article R4544-14",
      authority: "Légifrance",
      type: "regulation",
      locator: "Article R4544-14",
      url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000049743361",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Texte officiel à lire dans son chapitre, sa version et son champ d’application pertinents pour le dossier.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Un article isolé ne suffit pas à qualifier l’ensemble des obligations applicables."
      ]
    }
  ],
  skills: [
    {
      schema: "falcon.knowledge.skill.v1",
      id: "electricite.operations.prevention",
      version: "1.0.0",
      corpusId: "electricite",
      title: "Qualification d’une opération électrique",
      purpose:
        "Qualifier une opération électrique ou son voisinage et orienter vers la consignation, l’habilitation et les mesures de prévention à vérifier.",
      mastery: "orchestrator-expert",
      activationSignals: [
        "maintenance électrique",
        "consignation électrique",
        "habilitation électrique",
        "voisinage électrique"
      ],
      requiredInputs: [
        "type d’opération",
        "domaine de tension",
        "environnement de travail",
        "habilitation requise"
      ],
      methods: [
        "qualification de la nature de l’opération",
        "orientation vers les mesures de prévention",
        "contrôle documentaire de l’habilitation à faire valider"
      ],
      references: [
        "electricite.inrs.ed6127",
        "electricite.inrs.operations",
        "electricite.legifrance.r4544-14"
      ],
      evidenceOutputs: [
        "qualification contextuelle de l’opération",
        "liste des mesures et compétences à vérifier",
        "trace des références et limites mobilisées"
      ],
      limitations: [
        "Falcon ne réalise ni consignation ni vérification électrique.",
        "Falcon ne délivre, ne valide et ne renouvelle aucune habilitation.",
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

const ergonomieTmsPack = {
  schema: "falcon.knowledge.pack.v1",
  id: "eki2.ergonomie-tms",
  version: "1.0.0",
  title: "Ergonomie — dépistage TMS et manutention manuelle",
  owner: OWNER,
  checkedAt: CHECKED_AT,
  corpus: {
    schema: "falcon.knowledge.corpus.v1",
    id: "ergonomie-tms",
    version: "1.0.0",
    title: "Ergonomie et troubles musculosquelettiques",
    purpose:
      "Dépister les facteurs de TMS et orienter vers une analyse ergonomique de l’activité sans réduire le travail à un score isolé.",
    domains: [
      "ergonomie",
      "troubles musculosquelettiques",
      "manutention manuelle"
    ],
    terminology: [
      "TMS",
      "gestes répétitifs",
      "posture contraignante",
      "effort",
      "manutention manuelle",
      "activité réelle"
    ],
    referenceFamilies: [
      "Code du travail",
      "INRS",
      "démarche ergonomique"
    ],
    accidentModels: [
      "sollicitation biomécanique répétée",
      "effort excessif",
      "posture contraignante",
      "récupération insuffisante"
    ],
    applicabilityRules: [
      "activité exposant à des gestes répétitifs",
      "manutention manuelle de charges",
      "postures contraignantes ou efforts soutenus",
      "plainte, signal faible ou atteinte TMS"
    ],
    relatedCorpus: ["amiante", "electricite"],
    owner: OWNER
  },
  references: [
    {
      id: "ergonomie.inrs.tms-prevention",
      title: "Troubles musculosquelettiques — prévention",
      authority: "INRS",
      type: "institutional-guidance",
      locator: "Dossier TMS — démarche de prévention",
      url: "https://www.inrs.fr/risques/tms-troubles-musculosquelettiques/prevention.html",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Cadre de prévention à confronter à l’activité réelle, à l’organisation, aux expositions et aux personnes concernées.",
      limitations: [
        DOSSIER_REVALIDATION,
        "Le dépistage ne remplace pas l’analyse ergonomique approfondie de l’activité."
      ]
    },
    {
      id: "ergonomie.inrs.ed6518",
      title: "Démarche de prévention des troubles musculosquelettiques",
      authority: "INRS",
      type: "method",
      locator: "ED 6518",
      url: "https://www.inrs.fr/dam/inrs/CataloguePapier/ED/TI-ED-6518.pdf",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Méthode de structuration d’une démarche TMS à adapter au contexte, aux acteurs et aux données disponibles.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La méthode requiert une démarche collective et des observations adaptées au travail réel."
      ]
    },
    {
      id: "ergonomie.legifrance.r4541",
      title: "Code du travail — manutention des charges",
      authority: "Légifrance",
      type: "regulation",
      locator: "Articles R4541-1 à R4541-10",
      url: "https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000018492447/",
      checkedAt: CHECKED_AT,
      verificationStatus: "source-verified",
      applicabilityStatus: "dossier-revalidation-required",
      applicability:
        "Section officielle à qualifier selon la manutention réelle, les aides disponibles et la situation du dossier.",
      limitations: [
        DOSSIER_REVALIDATION,
        "La section manutention ne couvre pas à elle seule tous les déterminants possibles d’un TMS."
      ]
    }
  ],
  skills: [
    {
      schema: "falcon.knowledge.skill.v1",
      id: "ergonomie.tms.depistage",
      version: "1.0.0",
      corpusId: "ergonomie-tms",
      title: "Dépistage TMS et orientation ergonomique",
      purpose:
        "Repérer des facteurs de TMS, organiser les données utiles et orienter vers une analyse ergonomique proportionnée.",
      mastery: "honest-expert",
      activationSignals: [
        "manutention manuelle",
        "gestes répétitifs",
        "posture contraignante",
        "troubles musculosquelettiques"
      ],
      requiredInputs: [
        "activité observée",
        "durée d’exposition",
        "fréquence",
        "efforts",
        "organisation du travail"
      ],
      methods: [
        "dépistage structuré des facteurs de TMS",
        "qualification des données manquantes",
        "orientation vers une analyse ergonomique approfondie"
      ],
      references: [
        "ergonomie.inrs.tms-prevention",
        "ergonomie.inrs.ed6518",
        "ergonomie.legifrance.r4541"
      ],
      evidenceOutputs: [
        "facteurs de TMS observés ou à confirmer",
        "données d’exposition manquantes",
        "besoin d’analyse ergonomique et validations humaines"
      ],
      limitations: [
        "Falcon n’exécute pas une méthode de cotation spécialisée non intégrée.",
        "Un signal TMS ne prouve ni une causalité ni une maladie professionnelle.",
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

export const EKI2_PILOT_PACKS = freezeDeep([
  amiantePack,
  electricitePack,
  ergonomieTmsPack
]);
