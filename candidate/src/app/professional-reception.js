(function installFalconProfessionalReception() {
  "use strict";

  const CAPABILITY_LABELS = Object.freeze([
    ["Cadrer", "Acteurs, entreprise, contexte et périmètre"],
    ["Documenter", "Sources, historique et gouvernance des données"],
    ["Observer", "Faits terrain, dangers, signaux et médias"],
    ["QQOQCP", "Situation décrite de façon exploitable"],
    ["Ishikawa", "Causes contributives structurées en 8M"],
    ["Causes racines", "5 Pourquoi et arbre des causes"],
    ["Méthodes métier", "LOTO/LOTOTO ou RULA/REBA selon le risque"],
    ["Coter", "Criticité G×P×M et niveau de maîtrise"],
    ["Décider", "Acceptabilité, justification et risque résiduel"],
    ["Agir", "Priorités, responsables, échéances et efficacité"],
    ["Prouver", "Sources, médias, journal et rapport Prestige"],
    ["Maîtriser", "Enregistrement, export, partage et confidentialité"]
  ]);

  const ADDITIONAL_OBSERVATIONS = Object.freeze({
    industrie: [
      { zone: "Presse P3", family: "Machines / protecteurs", danger: "Neutralisation ponctuelle d’un interverrouillage", risk: "Happement ou écrasement lors d’un redémarrage", signal: "Écart connu oralement mais non inscrit au registre", facts: "Un capteur est contourné pendant certains réglages courts afin d’éviter des arrêts de ligne. Aucun mode opératoire dégradé ni autorisation formelle n’encadre cette pratique.", score: 88 },
      { zone: "Atelier découpe", family: "Bruit", danger: "Exposition cumulée aux presses et meuleuses", risk: "Atteinte auditive et fatigue", signal: "Mesures anciennes et port des protections variable", facts: "Les mesures disponibles datent de trois ans. Les opérateurs alternent entre zones sans suivi de dose et les protections ne sont pas adaptées à toutes les tâches.", score: 64 },
      { zone: "Zone charge batteries", family: "Incendie / atmosphère", danger: "Charge de batteries de traction sans séparation claire", risk: "Incendie, explosion ou exposition à l’électrolyte", signal: "Ventilation présente mais contrôle périodique non retrouvé", facts: "La zone est utilisée comme stockage temporaire. Les dégagements varient et aucune vérification récente du renouvellement d’air n’est jointe au dossier.", score: 72 },
      { zone: "Magasin matières", family: "Manutention / ergonomie", danger: "Prises manuelles répétées au sol et au-dessus des épaules", risk: "TMS et chute de charge", signal: "Aides disponibles mais éloignées du poste", facts: "Les préparateurs effectuent des prélèvements fréquents dans des racks non adaptés aux références les plus demandées. Les rotations de poste ne sont pas formalisées.", score: 61 },
      { zone: "Équipe de nuit", family: "Travail isolé", danger: "Intervention de dépannage avec effectif réduit", risk: "Retard d’alerte et aggravation d’un accident", signal: "Procédure PTI connue mais tests irréguliers", facts: "Le technicien peut intervenir seul hors vue de l’équipe. Le dernier essai documenté du dispositif d’alarme remonte à plusieurs mois.", score: 70 }
    ],
    btp: [
      { zone: "Façade nord", family: "Échafaudage", danger: "Plancher incomplet après modification", risk: "Chute de hauteur et chute d’objet", signal: "Réception initiale disponible mais modification non recontrôlée", facts: "Une console a été déplacée pour permettre un passage de réseau. Le procès-verbal de réception n’a pas été actualisé et l’accès reste ouvert.", score: 90 },
      { zone: "Niveau R+2", family: "Électricité provisoire", danger: "Coffret et rallonges exposés aux chocs et à l’humidité", risk: "Électrisation, incendie ou arrêt chantier", signal: "Vérification visuelle sans registre quotidien", facts: "Plusieurs entreprises partagent le coffret. Des rallonges traversent une zone de circulation et une prise présente un capot endommagé.", score: 76 },
      { zone: "Carottage béton", family: "Poussières / silice", danger: "Émission de poussières respirables pendant percement", risk: "Atteinte respiratoire chronique", signal: "Aspiration disponible mais captage mal positionné", facts: "Les séquences sont courtes mais répétées. Le captage est parfois retiré pour accéder à la zone et le nettoyage se fait au balai.", score: 73 },
      { zone: "Aire de levage", family: "Levage / coactivité", danger: "Charge suspendue au-dessus d’une circulation résiduelle", risk: "Heurt ou écrasement grave", signal: "Chef de manœuvre identifié mais zone non entièrement neutralisée", facts: "La livraison intervient pendant une phase occupée. Le balisage est mobile et des compagnons traversent encore l’aire pour rejoindre les vestiaires.", score: 84 },
      { zone: "Découpe intérieure", family: "Bruit / vibrations", danger: "Usage prolongé d’outils vibrants", risk: "Atteinte auditive et syndrome main-bras", signal: "Durées non cumulées entre entreprises", facts: "Les temps d’utilisation sont suivis par tâche mais pas par personne. Les sous-traitants utilisent des matériels d’âges différents sans consolidation.", score: 60 }
    ],
    erp: [
      { zone: "Grande salle événementielle", family: "Gestion de foule", danger: "Configuration modulable réduisant les cheminements", risk: "Mouvement de foule et évacuation retardée", signal: "Plans adaptés par événement mais contrôle final non tracé", facts: "Les cloisons et mobiliers changent selon l’événement. La jauge est connue mais la largeur utile des dégagements n’est pas toujours revalidée.", score: 81 },
      { zone: "Cuisine traiteur temporaire", family: "Travaux par point chaud", danger: "Appareils de cuisson proches de décors combustibles", risk: "Départ de feu et propagation rapide", signal: "Autorisation ponctuelle non intégrée au registre sécurité", facts: "Le prestataire installe du matériel quelques heures avant l’ouverture. Le contrôle des distances, extincteurs et coupures n’est pas formalisé.", score: 74 },
      { zone: "Porte coupe-feu secteur B", family: "Compartimentage", danger: "Maintien ouvert par cale en période de livraison", risk: "Propagation des fumées et du feu", signal: "Pratique récurrente connue des équipes", facts: "La porte reste ouverte pour faciliter les flux logistiques. Aucun dispositif automatique adapté ni surveillance compensatoire n’est prévu.", score: 78 },
      { zone: "Sanitaires accessibles", family: "Accessibilité", danger: "Espace de transfert réduit par stockage", risk: "Impossibilité d’usage autonome et chute", signal: "Écart constaté après changement d’organisation", facts: "Du consommable est stocké dans l’espace latéral. Le contrôle d’ouverture quotidien ne couvre pas l’accessibilité intérieure.", score: 52 },
      { zone: "Poste central sécurité", family: "Organisation d’urgence", danger: "Transmission de consignes entre titulaires et remplaçants", risk: "Décision tardive en cas d’alarme", signal: "Main courante renseignée mais exercices incomplets", facts: "Les scénarios rares ne sont pas connus des remplaçants. Les derniers exercices n’ont pas couvert une indisponibilité du système de sonorisation.", score: 67 }
    ],
    restauration: [
      { zone: "Légumerie", family: "Coupures", danger: "Usage rapide de couteaux et mandoline", risk: "Plaie profonde et arrêt de travail", signal: "Gants disponibles mais choix non adapté à toutes les opérations", facts: "Les gestes sont rapides pendant la préparation du matin. Les lames sont changées sans contrôle formalisé et le rangement varie selon l’équipe.", score: 69 },
      { zone: "Préparation froide", family: "Allergènes", danger: "Croisement d’ustensiles et information incomplète", risk: "Réaction allergique grave d’un convive", signal: "Plan allergènes à jour mais preuve de nettoyage lacunaire", facts: "Les productions se succèdent sur un espace contraint. L’identification des bacs est fiable, mais la validation du nettoyage intermédiaire n’est pas toujours signée.", score: 82 },
      { zone: "Quai réception", family: "Chaîne du froid", danger: "Attente de produits réfrigérés avant contrôle", risk: "Rupture de température et non-conformité sanitaire", signal: "Pics de livraison sans zone tampon dimensionnée", facts: "Deux fournisseurs peuvent arriver simultanément. Les températures sont prises, mais le temps d’attente et la décision en cas d’écart ne sont pas consolidés.", score: 71 },
      { zone: "Conditionnement", family: "Ergonomie / cadence", danger: "Gestes répétitifs et hauteur de travail fixe", risk: "TMS des membres supérieurs", signal: "Douleurs signalées sans étude de poste récente", facts: "La cadence augmente avant expédition. Les opérateurs changent peu de tâche et le réglage du plan de travail n’est pas possible.", score: 63 },
      { zone: "Local produits d’entretien", family: "Chimique", danger: "Transvasement et incompatibilités de stockage", risk: "Projection, inhalation ou réaction chimique", signal: "Étiquetage secondaire hétérogène", facts: "Des flacons d’usage sont préparés à l’avance. Certaines étiquettes sont effacées et la séparation acide/chloré n’est pas matérialisée.", score: 75 }
    ],
    tertiaire: [
      { zone: "Service facturation", family: "RPS / organisation", danger: "Accumulation d’urgences et objectifs contradictoires", risk: "Épuisement, erreurs et désengagement", signal: "Heures supplémentaires et demandes de mobilité en hausse", facts: "Les priorités changent plusieurs fois par semaine. Les managers arbitrent individuellement sans règle commune ni espace de régulation collective.", score: 72 },
      { zone: "Accueil isolé", family: "Violences externes", danger: "Gestion d’un public mécontent sans appui immédiat", risk: "Agression verbale ou physique", signal: "Incidents consignés de façon inégale", facts: "Le poste est parfois tenu seul en fin de journée. Le bouton d’alerte existe mais les exercices et le retour d’expérience sont irréguliers.", score: 68 },
      { zone: "Salle de réunion aveugle", family: "Qualité de l’air", danger: "Occupation dense et renouvellement d’air insuffisant", risk: "Inconfort, céphalées et baisse de vigilance", signal: "Plaintes récurrentes sans mesure CO₂", facts: "Les réunions s’enchaînent porte fermée. La ventilation est commune au plateau et aucun indicateur n’aide les utilisateurs à aérer.", score: 49 },
      { zone: "Baie informatique locale", family: "Électrique / incendie", danger: "Multiplication d’équipements et stockage adjacent", risk: "Surchauffe et départ de feu", signal: "Extension progressive sans revue de charge", facts: "Des équipements ont été ajoutés au fil des projets. Des cartons sont stockés à proximité et la dernière thermographie n’est pas retrouvée.", score: 65 },
      { zone: "Déplacements inter-sites", family: "Risque routier", danger: "Trajets fréquents après journées longues", risk: "Accident de mission", signal: "Kilométrage suivi mais fatigue non intégrée aux plannings", facts: "Les réunions tardives génèrent des retours en soirée. Le train ou la visioconférence ne sont pas systématiquement arbitrés.", score: 62 }
    ],
    collectivite: [
      { zone: "Local phytosanitaire", family: "Produits chimiques", danger: "Stockage de produits anciens et préparation de mélanges", risk: "Intoxication, pollution ou incendie", signal: "Inventaire disponible mais filière d’élimination en retard", facts: "Des produits non utilisés restent en stock. La ventilation fonctionne mais les contrôles, compatibilités et quantités maximales ne sont pas consolidés.", score: 74 },
      { zone: "Fouille réseau éclairage", family: "Terrassement / réseaux", danger: "Intervention à proximité de réseaux enterrés", risk: "Électrisation, rupture de réseau ou ensevelissement", signal: "Plans disponibles avec précision variable", facts: "L’intervention urgente débute après marquage. Les écarts entre plans et terrain ne sont pas toujours capitalisés pour les opérations suivantes.", score: 86 },
      { zone: "Gymnase municipal", family: "Travail en hauteur", danger: "Remplacement de luminaire avec équipement mobile", risk: "Chute grave et exposition du public", signal: "Nacelle partagée et réservation informelle", facts: "L’intervention est réalisée entre deux occupations. La zone est balisée mais la remise à disposition n’est pas formalisée avec l’exploitant.", score: 77 },
      { zone: "Atelier voirie", family: "Bruit / vibrations", danger: "Utilisation cumulée d’outils portatifs", risk: "Atteinte auditive et syndrome main-bras", signal: "Suivi du matériel sans suivi individuel d’exposition", facts: "Les agents alternent les activités selon les urgences. Les durées d’usage, l’état des outils et les symptômes ne sont pas rapprochés.", score: 59 },
      { zone: "Astreinte technique", family: "Travail isolé / urgence", danger: "Intervention nocturne sur incident avec information incomplète", risk: "Accident non secouru et mauvaise décision", signal: "Main courante présente mais scénarios non exercés", facts: "L’agent reçoit un appel puis se rend seul sur site. L’évaluation avant départ, le renfort et la clôture de l’intervention ne sont pas systématiquement tracés.", score: 73 }
    ]
  });

  function nowIso() {
    return new Date().toISOString();
  }

  function todayIso() {
    return nowIso().slice(0, 10);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function isEnergyRisk(observation) {
    return /électr|énergie|machine|maintenance|consign/i.test(
      `${observation?.family || ""} ${observation?.danger || ""}`
    );
  }

  function isErgonomicRisk(observation) {
    return /ergonom|tms|manutention|posture|charge de travail/i.test(
      `${observation?.family || ""} ${observation?.risk || ""}`
    );
  }

  function enrichAnalysis(analysis, observation, score) {
    const energy = isEnergyRisk(observation);
    const ergonomics = isErgonomicRisk(observation);
    const methods = ["QQOQCP", "Ishikawa 8M", "5 Pourquoi", "Arbre des causes"];
    if (energy) methods.push("LOTO / LOTOTO");
    if (ergonomics) methods.push("RULA / REBA");
    return Object.assign(analysis, {
      confidenceLevel: "élevé",
      certainty: "Élevée",
      methods,
      qqoqcp: {
        qui: "Salariés, encadrement, maintenance, prestataires et tiers exposés selon la zone.",
        quoi: `${observation.danger} ; risque associé : ${observation.risk}.`,
        ou: `${observation.zone}.`,
        quand: "Pendant l’activité normale, avec aggravation lors des pics, interventions ou changements d’équipe.",
        comment: observation.constat || observation.facts,
        pourquoi: "Barrières techniques, organisationnelles et documentaires insuffisamment coordonnées."
      },
      ishikawa: {
        level: "8M",
        branches: {
          "Main d'œuvre": "Compétences, charge et coordination à vérifier.",
          Méthodes: "Procédure disponible mais application et preuve hétérogènes.",
          Matériel: "Équipement ou protection à contrôler avant usage.",
          Milieu: "Coactivité, flux et contraintes d’exploitation.",
          Matière: "Produit, énergie ou charge contribuant à l’exposition.",
          Management: "Supervision et arbitrage à formaliser.",
          Mesure: "Indicateur de maîtrise et contrôle d’efficacité à définir.",
          Maintenance: "État, périodicité et traçabilité à consolider."
        }
      },
      fiveWhy: {
        items: [
          "La barrière attendue n’est pas appliquée de façon systématique.",
          "La responsabilité et la preuve de contrôle restent dispersées.",
          "Le processus n’impose pas de point d’arrêt vérifiable.",
          "Les contraintes d’exploitation priment sans arbitrage tracé.",
          "Cause racine : gouvernance opérationnelle et contrôle d’efficacité incomplets."
        ]
      },
      causeTree: {
        facts: observation.constat || observation.facts,
        causes: `${observation.signal} ; coordination et supervision variables.`,
        rootCauses: "Absence de barrière robuste, de propriétaire unique et de preuve de vérification.",
        barriers: "Mesure collective, règle organisationnelle, compétence vérifiée et contrôle d’efficacité."
      },
      itamami: {
        items: {
          individu: "Exposition et compétence des personnes concernées.",
          tache: "Variabilité de la tâche, cadence et interventions non nominales.",
          activite: "Écart entre travail prescrit et travail réel.",
          materiel: "Adéquation, état et disponibilité des équipements.",
          milieu: "Flux, espace, coactivité, ambiance et contraintes de site."
        }
      },
      loto: energy ? {
        energies: ["électrique", "mécanique", "fluide / pression"],
        lockout: true,
        tagout: true,
        tryout: true,
        verification: "Séparation, condamnation, identification, dissipation puis essai de non-remise en énergie.",
        residual: "Énergie résiduelle et remise en service non coordonnée."
      } : {
        energies: [],
        lockout: false,
        tagout: false,
        tryout: false,
        verification: "Non applicable à cette observation.",
        residual: ""
      },
      ergonomics: ergonomics ? {
        method: "RULA / REBA",
        score: Number(score || 0) >= 65 ? 7 : 5,
        interpretation: Number(score || 0) >= 65
          ? "Action ergonomique prioritaire"
          : "Analyse du poste et adaptation planifiée",
        factors: ["postures", "efforts", "répétitivité", "durée", "marges de manœuvre"]
      } : null,
      missingCriticalData: [],
      riskGuards: [
        "Vérifier le constat avec les opérateurs.",
        "Confirmer la faisabilité avec le responsable opérationnel.",
        "Tracer le contrôle d’efficacité."
      ],
      reportReservations: [
        "Données fictives à remplacer par des preuves réelles avant toute diffusion."
      ]
    });
  }

  function enrichDecision(decision, observation, analysis) {
    const critical = Number(analysis?.score || 0) >= 70;
    return Object.assign(decision, {
      observationId: observation.id,
      decision: critical
        ? "Suspendre l’exposition non maîtrisée puis sécuriser avant reprise complète."
        : "Planifier et piloter la correction avec contrôle d’efficacité.",
      decisionType: critical ? "traiter immédiatement" : "réduire et surveiller",
      residualRisk: critical
        ? "acceptable uniquement après vérification des barrières"
        : "tolérable sous contrôle",
      acceptance: critical ? "non avant action" : "conditionnelle",
      priority: critical ? "P1" : "P2",
      deadline: critical ? "immédiat" : "30 jours",
      responsible: "Responsable opérationnel",
      rationale: "Privilégier suppression, protection collective et organisation avant EPI et information.",
      limits: "Validation finale à réaliser sur le terrain avec les acteurs exposés.",
      confidenceLevel: "élevé",
      coherenceSnapshot: [
        { criterion: "Fait terrain relié", status: "ok" },
        { criterion: "Analyse structurée", status: "ok" },
        { criterion: "Hiérarchie de prévention", status: "ok" },
        { criterion: "Responsable et échéance", status: "ok" }
      ]
    });
  }

  function enrichAction(action, index) {
    return Object.assign(action, {
      priority: action.priority || (index === 0 ? "P1" : "P2"),
      responsible: action.responsible || "Responsable opérationnel",
      deadline: action.deadline || action.due || "30 jours",
      expectedEvidence: action.expectedEvidence
        || "Photo ou document de mise en œuvre, responsable identifié et date de vérification.",
      effectivenessCheck: action.effectivenessCheck
        || "Contrôle terrain contradictoire et absence de réapparition de l’écart.",
      source: "démonstration métier"
    });
  }

  function createDetailedObservation(key, item, index, timestamp) {
    return {
      id: `demo_${key}_obs_${index + 4}`,
      date: todayIso(),
      zone: item.zone,
      family: item.family,
      danger: item.danger,
      risk: item.risk,
      signal: item.signal,
      constat: item.facts,
      facts: item.facts,
      evidence: `Constat terrain fictif documenté : ${item.facts}`,
      photos: "",
      createdAt: timestamp
    };
  }

  function createDetailedAnalysis(key, observation, item, index, timestamp) {
    const score = Number(item.score || 55);
    return enrichAnalysis({
      id: `demo_${key}_ana_${index + 4}`,
      observationId: observation.id,
      gravity: score >= 75 ? 5 : score >= 55 ? 4 : 3,
      probability: score >= 75 ? 4 : 3,
      masteryIndex: score >= 70 ? 2 : 3,
      score,
      rawScore: Math.min(100, score + 12),
      scoringMethod: "G×P×M normalisé /100",
      mastery: score >= 70
        ? "Maîtrise insuffisante"
        : score >= 50
          ? "Maîtrise partielle"
          : "Maîtrise acceptable",
      causes: `${observation.signal}. Organisation, supervision et traçabilité à renforcer.`,
      consequences: `${observation.risk}. Impact possible sur les personnes, l’activité et la responsabilité de l’organisation.`,
      createdAt: timestamp
    }, observation, score);
  }

  function createDetailedDecision(key, observation, analysis, index, timestamp) {
    return enrichDecision({
      id: `demo_${key}_dec_${index + 4}`,
      analysisId: analysis.id,
      observationId: observation.id,
      justification: "Décision fondée sur le niveau de criticité, le travail réel, la hiérarchie de prévention et la qualité de la preuve.",
      constraints: "Continuité d’activité, disponibilité des moyens, coordination des acteurs et délais de mise en œuvre.",
      createdAt: timestamp
    }, observation, analysis);
  }

  function createDetailedActions(key, observation, analysis, index, timestamp) {
    const immediate = Number(analysis.score || 0) >= 75;
    return [
      enrichAction({
        id: `demo_${key}_act_${index + 4}a`,
        observationId: observation.id,
        title: `Mettre en place la barrière prioritaire — ${observation.family}`,
        type: "protection_collective",
        priority: immediate ? "P1" : "P2",
        due: immediate ? "immédiat" : "15 jours",
        deadline: immediate ? todayIso() : "30 jours",
        responsible: "Responsable opérationnel",
        detail: "Supprimer ou réduire l’exposition à la source et formaliser la condition de reprise.",
        status: immediate ? "en cours" : "à lancer",
        createdAt: timestamp
      }, index * 2),
      enrichAction({
        id: `demo_${key}_act_${index + 4}b`,
        observationId: observation.id,
        title: `Tracer et vérifier la maîtrise — ${observation.zone}`,
        type: "organisation",
        priority: "P2",
        due: "30 jours",
        deadline: "30 jours",
        responsible: "Référent prévention",
        detail: "Mettre à jour le support applicable, associer les acteurs et programmer la revue d’efficacité.",
        status: "à lancer",
        createdAt: timestamp
      }, index * 2 + 1)
    ];
  }

  function enrichSources(key, scenario, timestamp) {
    return [
      {
        id: `demo_src_${key}_1`,
        title: "DUERP et programme annuel de prévention",
        type: "DUERP antérieur",
        date: todayIso(),
        origin: scenario.client,
        summary: `Risques prioritaires et actions antérieures du secteur ${scenario.label}.`,
        keypoints: "Récurrence des écarts, niveau de maîtrise et actions restant à vérifier.",
        exploitation: "comparaison historique",
        reliability: "document validé",
        fileName: `DUERP_${key}_demo.pdf`,
        fileSize: 820000,
        embedded: false,
        createdAt: timestamp
      },
      {
        id: `demo_src_${key}_2`,
        title: "Visite terrain contradictoire",
        type: "Rapport d’audit",
        date: todayIso(),
        origin: "Auditeur Falcon",
        summary: "Constats reconstitués avec entretiens courts et observation de l’activité réelle.",
        keypoints: "Variabilité, coactivité, contraintes et barrières disponibles.",
        exploitation: "preuve / traçabilité",
        reliability: "démonstration",
        fileName: `visite_terrain_${key}_demo.pdf`,
        fileSize: 540000,
        embedded: false,
        createdAt: timestamp
      },
      {
        id: `demo_src_${key}_3`,
        title: "Registre de contrôles et compétences",
        type: "Registre sécurité",
        date: todayIso(),
        origin: scenario.client,
        summary: "Habilitations, vérifications, formations et contrôles périodiques fictifs.",
        keypoints: "Échéances, responsabilités et preuves de suivi.",
        exploitation: "décision / arbitrage",
        reliability: "à qualifier",
        fileName: `registre_${key}_demo.xlsx`,
        fileSize: 180000,
        embedded: false,
        createdAt: timestamp
      },
      {
        id: `demo_src_${key}_4`,
        title: "Entretiens opérateurs et encadrement",
        type: "Entretiens",
        date: todayIso(),
        origin: scenario.client,
        summary: "Retours fictifs croisés sur le travail réel, les contraintes et les contournements.",
        keypoints: "Écarts entre procédure, moyens disponibles et activité observée.",
        exploitation: "QQOQCP / causes",
        reliability: "témoignages à corroborer",
        fileName: `entretiens_${key}_demo.pdf`,
        fileSize: 320000,
        embedded: false,
        createdAt: timestamp
      },
      {
        id: `demo_src_${key}_5`,
        title: "Historique incidents, presque-accidents et alertes",
        type: "Historique sécurité",
        date: todayIso(),
        origin: scenario.client,
        summary: "Événements fictifs des douze derniers mois, classés par activité et gravité potentielle.",
        keypoints: "Récurrences, signaux faibles et barrières absentes ou défaillantes.",
        exploitation: "priorisation / tendance",
        reliability: "registre consolidé",
        fileName: `historique_evenements_${key}_demo.xlsx`,
        fileSize: 260000,
        embedded: false,
        createdAt: timestamp
      },
      {
        id: `demo_src_${key}_6`,
        title: "Vérifications périodiques, maintenance et habilitations",
        type: "Dossier de conformité",
        date: todayIso(),
        origin: scenario.client,
        summary: "Échéances fictives des équipements, contrôles, formations et habilitations.",
        keypoints: "Validité, réserves, actions correctives et responsables.",
        exploitation: "maîtrise / preuve",
        reliability: "documents à vérifier",
        fileName: `conformite_${key}_demo.pdf`,
        fileSize: 690000,
        embedded: false,
        createdAt: timestamp
      }
    ];
  }

  function buildDemonstrationMedia(key, observations, timestamp) {
    const targets = [observations[0], observations[3], observations[6]].filter(Boolean);
    const destinations = ["Falcon uniquement", "Galerie de démonstration", "Falcon et galerie"];
    return targets.map((observation, index) => ({
      id: `demo_media_${key}_${index + 1}`,
      observationId: observation.id || "",
      fileName: `preuve_terrain_${key}_${index + 1}.jpg`,
      mediaType: "image/jpeg",
      capturedAt: timestamp,
      context: `Illustration fictive reliée au constat « ${observation.danger || observation.zone} » — ${observation.zone || "zone auditée"}.`,
      storageDestination: destinations[index],
      syncStatus: "local",
      consent: "démonstration fictive — aucun transfert externe",
      integrity: { algorithm: "SHA-256", digest: `demo-${key}-integrity-${index + 1}` }
    }));
  }

  function buildAiDemonstrationContract(scenario) {
    return {
      mode: "local",
      status: "désactivée",
      externalRequestMade: false,
      requiresExplicitActivation: true,
      localValue: {
        operational: true,
        description: "Le dossier, les méthodes, les cotations, les arbitrages, les actions et le rapport sont entièrement consultables sans IA.",
        capabilities: [
          "Chaîne Observation → Analyse → Décision → Action → Preuve",
          "QQOQCP, Ishikawa 8M, 5 Pourquoi et arbre des causes",
          "Cotation, risque résiduel, responsables, échéances et contrôles",
          "Rapport Prestige, export et conservation locale"
        ]
      },
      optionalAssistance: {
        available: true,
        provider: "non configuré",
        activation: "choix explicite de l’utilisateur après configuration du fournisseur",
        confidentiality: "aucune donnée envoyée tant que l’utilisateur n’a pas activé et validé la demande",
        proposedUses: [
          "Repérer les contradictions ou informations manquantes",
          "Proposer une reformulation professionnelle sans modifier les faits",
          "Suggérer des pistes de causes à confirmer par l’expert",
          "Préparer une synthèse à relire avant intégration au rapport"
        ],
        suggestedPrompts: [
          `Rechercher les incohérences du dossier ${scenario.label} sans prendre de décision.`,
          "Comparer les constats, les causes et les barrières puis signaler les ruptures de traçabilité.",
          "Préparer une synthèse factuelle en distinguant faits, hypothèses et réserves."
        ],
        guardrails: [
          "Falcon signale, l’expert décide.",
          "Aucune recommandation n’est validée automatiquement.",
          "La sortie du fournisseur reste une proposition à vérifier et tracer.",
          "Le mode local reste intégralement fonctionnel."
        ]
      }
    };
  }

  function enrichActiveDemonstration(key) {
    if (typeof state === "undefined") return false;
    const scenario = window.falconS5Scenarios?.[key];
    if (!scenario) return false;
    const timestamp = nowIso();
    const observations = list(state.observations);
    const analyses = list(state.analyses);
    const decisions = list(state.decisions);
    const additionalItems = list(ADDITIONAL_OBSERVATIONS[key]);

    state.auditor = Object.assign({}, state.auditor || {}, {
      firstName: "Camille",
      lastName: "Martin",
      email: "camille.martin@cabinet-falcon.example",
      phone: "01 84 80 20 20",
      role: "Auditrice QHSE",
      activity: "Audit et prévention des risques professionnels"
    });
    observations.forEach((observation) => {
      observation.constat = observation.constat || observation.facts || "";
      observation.evidence = observation.evidence
        || `Constat terrain fictif documenté : ${observation.constat}`;
    });
    analyses.forEach((analysis, index) => {
      enrichAnalysis(analysis, observations[index] || observations[0] || {}, analysis.score);
    });
    decisions.forEach((decision, index) => {
      enrichDecision(
        decision,
        observations[index] || observations[0] || {},
        analyses[index] || analyses[0] || {}
      );
    });
    const additionalObservations = additionalItems.map((item, index) =>
      createDetailedObservation(key, item, index, timestamp)
    );
    const additionalAnalyses = additionalObservations.map((observation, index) =>
      createDetailedAnalysis(key, observation, additionalItems[index], index, timestamp)
    );
    const additionalDecisions = additionalObservations.map((observation, index) =>
      createDetailedDecision(key, observation, additionalAnalyses[index], index, timestamp)
    );
    const additionalActions = additionalObservations.flatMap((observation, index) =>
      createDetailedActions(key, observation, additionalAnalyses[index], index, timestamp)
    );
    observations.push(...additionalObservations);
    analyses.push(...additionalAnalyses);
    decisions.push(...additionalDecisions);
    state.observations = observations;
    state.analyses = analyses;
    state.decisions = decisions;
    state.actions = [
      ...list(state.actions).map(enrichAction),
      ...additionalActions
    ];
    state.sources = enrichSources(key, scenario, timestamp);
    state.media = buildDemonstrationMedia(key, observations, timestamp);
    state.aiDemonstration = buildAiDemonstrationContract(scenario);
    state.missionStakeholders = [
      { role: "Direction / employeur", contribution: "Arbitrage, moyens et validation du risque résiduel" },
      { role: "Responsable opérationnel", contribution: "Conditions réelles de travail et mise en œuvre des barrières" },
      { role: "Salariés et représentants", contribution: "Travail réel, signaux faibles et contrôle d’efficacité" },
      { role: "Prévention / QHSE", contribution: "Méthode, cohérence, traçabilité et revue du plan d’action" }
    ];
    state.missionHistory = [
      { date: todayIso(), event: "Cadrage de la mission", evidence: "Périmètre, acteurs et règles de diffusion définis" },
      { date: todayIso(), event: "Visite et entretiens", evidence: `${observations.length} constats reliés à ${state.sources.length} sources` },
      { date: todayIso(), event: "Revue contradictoire", evidence: `${decisions.length} arbitrages et ${state.actions.length} actions préparés` }
    ];
    state.dataGovernance = Object.assign({}, state.dataGovernance || {}, {
      dataMode: "local-first",
      storage: "appareil de démonstration",
      retentionPolicy: "Durée de la mission puis archivage décidé par l’utilisateur",
      sensitivity: "professionnel / confidentiel",
      responsibility: "Client / employeur",
      roleCabinet: "Conseil et production de la preuve",
      pointsVigilance: ["Données fictives", "Aucun envoi automatique", "Diffusion après validation"]
    });
    state.reportValidation = Object.assign({}, state.reportValidation || {}, {
      employerName: `Direction ${scenario.client}`,
      employerRole: "Direction / responsable site",
      validationDate: todayIso(),
      auditorConclusion: `Démonstration fictive ${scenario.label} renseignée du cadrage au rapport.`,
      diffusionStatus: "document de démonstration — diffusion maîtrisée"
    });
    state.demo = Object.assign({}, state.demo || {}, {
      active: true,
      presentation: true,
      scenarioS5: key,
      coverage: "complète",
      assistanceMode: "local",
      depth: {
        observations: observations.length,
        analyses: analyses.length,
        decisions: decisions.length,
        actions: state.actions.length,
        sources: state.sources.length,
        media: state.media.length
      },
      lastLoadedAt: timestamp
    });
    state.logs = [
      {
        id: `demo_log_${key}_1`,
        date: timestamp,
        action: "DEMO_COMPLETE_LOADED",
        detail: { scenario: key, label: scenario.label, coverage: "compétences complètes" }
      },
      {
        id: `demo_log_${key}_2`,
        date: timestamp,
        action: "REPORT_READY",
        detail: { status: "à valider avant diffusion" }
      }
    ];
    state.ui = Object.assign({}, state.ui || {}, { view: "accueil" });
    if (state.enterpriseAccess?.license?.plan === "Showcase") {
      state.enterpriseAccess.license.plan = "Enterprise";
    }
    if (typeof save === "function") save();
    if (typeof render === "function") render();
    return true;
  }

  function renderCapabilityCoverage() {
    if (typeof state === "undefined" || state.demo?.coverage !== "complète") return "";
    const complete = CAPABILITY_LABELS.map(([label, detail]) =>
      `<div class="falcon-capability-card"><span aria-hidden="true">✓</span><div><strong>${label}</strong><small>${detail}</small></div></div>`
    ).join("");
    const depth = state.demo?.depth || {};
    return `<details class="panel falcon-capability-coverage" data-falcon-demo-coverage="complete">
      <summary class="falcon-capability-summary"><div>
        <span class="tag green">Dossier sectoriel approfondi</span>
        <strong>${depth.observations || 0} situations · ${depth.decisions || 0} arbitrages · ${depth.actions || 0} actions</strong>
        <small>Explorer la lecture à 360° : du contexte terrain à l’arbitrage humain et à la preuve.</small>
      </div><span class="tag blue">${CAPABILITY_LABELS.length}/${CAPABILITY_LABELS.length}</span></summary>
      <div class="falcon-assistance-comparison" data-falcon-ai-comparison="explicit">
        <article>
          <span class="tag green">Sans IA · opérationnel</span>
          <strong>Le dossier est complet en local</strong>
          <p>Faits, méthodes, cotations, décisions humaines, actions, preuves et rapport restent disponibles hors ligne. Aucune donnée n’est envoyée.</p>
        </article>
        <article>
          <span class="tag blue">IA · optionnelle et inactive</span>
          <strong>Une assistance, jamais un décideur</strong>
          <p>Après configuration et consentement explicites : contradictions, reformulation, pistes à confirmer et synthèse à relire. Aucun résultat IA n’est simulé.</p>
        </article>
      </div>
      <div class="falcon-capability-grid">${complete}</div>
    </details>`;
  }

  function patchDemonstrationLoader() {
    const originalLoader = window.loadScenarioS5;
    const originalModal = window.openModal;
    if (typeof originalLoader !== "function" || typeof originalModal !== "function") return false;
    if (originalLoader.__falconProfessionalReception) return true;

    function professionalLoader(key) {
      const previousModal = window.openModal;
      window.openModal = function interceptModal(options) {
        const originalConfirm = options?.onConfirm;
        return originalModal(Object.assign({}, options, {
          title: String(options?.title || "").replace(/Charger scénario S5/i, "Charger la démonstration"),
          content: "Le dossier courant sera remplacé par une démonstration fictive complète : cadrage, sources, constats, méthodes d’analyse, arbitrages, actions, preuve et rapport. Exportez vos données avant de poursuivre si nécessaire.",
          onConfirm() {
            if (typeof originalConfirm === "function") originalConfirm();
            enrichActiveDemonstration(key);
            if (typeof toast === "function") {
              toast("Démonstration complète chargée. Explorez les capacités depuis l’accueil.", "ok");
            }
          }
        }));
      };
      try {
        return originalLoader(key);
      } finally {
        window.openModal = previousModal;
      }
    }
    professionalLoader.__falconProfessionalReception = true;
    window.loadScenarioS5 = professionalLoader;
    return true;
  }

  function patchAccueil() {
    const original = window.renderAccueil;
    if (typeof original !== "function" || original.__falconProfessionalReception) return false;
    function professionalAccueil() {
      const html = original();
      const coverage = renderCapabilityCoverage();
      if (!coverage || html.includes("data-falcon-demo-coverage")) return html;
      return html.replace("</section>", `${coverage}</section>`);
    }
    professionalAccueil.__falconProfessionalReception = true;
    window.renderAccueil = professionalAccueil;
    return true;
  }

  function patchScenarioPresentation() {
    const originalStudio = window.renderScenarioStudioS5;
    if (typeof originalStudio === "function" && !originalStudio.__falconProfessionalReception) {
      function professionalStudio() {
        return String(originalStudio())
          .replace(/Sprint 5 — Scénarios métier immersifs/i, "Démonstrations métier approfondies")
          .replace(
            /Charge un dossier sectoriel complet et crédible[^<]*/i,
            "Chaque secteur montre les capacités réelles de Falcon Radar 360 — Entreprise : 8 situations, 8 analyses, 8 arbitrages, 16 actions, 6 sources et 3 médias reliés."
          )
          .replace(/S5 scénarios/i, "6 dossiers prêts");
      }
      professionalStudio.__falconProfessionalReception = true;
      window.renderScenarioStudioS5 = professionalStudio;
    }

    const originalPath = window.renderScenarioPathS5;
    if (typeof originalPath === "function" && !originalPath.__falconProfessionalReception) {
      function professionalPath() {
        const depth = state?.demo?.depth || {};
        return String(originalPath())
          .replace(/3 constats sectoriels/i, `${depth.observations || 8} situations sectorielles`)
          .replace(/criticités qualifiées/i, `${depth.analyses || 8} analyses causales`)
          .replace(/arbitrages tracés/i, `${depth.decisions || 8} arbitrages tracés`)
          .replace(/actions priorisées/i, `${depth.actions || 16} actions pilotables`)
          .replace(/rapport Prestige/i, "rapport Prestige et annexes");
      }
      professionalPath.__falconProfessionalReception = true;
      window.renderScenarioPathS5 = professionalPath;
    }
  }

  function initialize() {
    patchDemonstrationLoader();
    patchAccueil();
    patchScenarioPresentation();
    if (typeof state !== "undefined") {
      state.ui = Object.assign({}, state.ui || {}, { view: "accueil" });
      if (state.enterpriseAccess?.license?.plan === "Showcase") {
        state.enterpriseAccess.license.plan = "Enterprise";
      }
      if (typeof render === "function") render();
    }
    document.documentElement.dataset.falconProfessionalDemo = "ready";
  }

  window.FalconProfessionalReception = Object.freeze({
    capabilityLabels: CAPABILITY_LABELS,
    enrichActiveDemonstration,
    renderCapabilityCoverage
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
