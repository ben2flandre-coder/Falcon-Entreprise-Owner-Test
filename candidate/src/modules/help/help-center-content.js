export const FALCON_HELP_TOPICS = Object.freeze([
  {
    id: "first-start",
    title: "Première installation et premier lancement",
    body: "Ouvrez Falcon dans un navigateur récent. Le démarrage reste vierge : créez ou restaurez un dossier, choisissez le mode Jour/Nuit et vérifiez l’indication « local » avant de saisir des données réelles."
  },
  {
    id: "folder",
    title: "Création d’un dossier",
    body: "Depuis les paramètres, renseignez client et mission, contrôlez le nom et le code proposés, choisissez l’emplacement puis utilisez « Créer et enregistrer ». Falcon crée une nouvelle version au lieu d’écraser un dossier existant."
  },
  {
    id: "paths",
    title: "Enregistrement, codification et chemins",
    body: "Le chemin complet est affiché avant écriture. Conservez Mission.falcon avec le dossier. Si l’accès système doit être réautorisé, resélectionnez l’emplacement sans supprimer l’original."
  },
  {
    id: "media",
    title: "Gestion des médias",
    body: "Choisissez Falcon uniquement, Galerie uniquement ou Falcon et galerie. Contrôlez l’identifiant, le contexte et l’empreinte. Après un partage Android, confirmez manuellement la présence dans la galerie."
  },
  {
    id: "reports",
    title: "Rapports, exports, impression et partage",
    body: "Générez le rapport, relisez son statut puis utilisez le centre de diffusion. « Enregistrer sous » choisit un fichier, « Imprimer » ouvre le dialogue A4 et « Partager » transmet le fichier via le système."
  },
  {
    id: "backup",
    title: "Sauvegarde et restauration",
    body: "Créez un point de reprise avant une opération importante. La restauration vérifie l’intégrité et les écritures. Gardez aussi des copies du dossier Falcon sur un support maîtrisé."
  },
  {
    id: "transfers",
    title: "Transferts multi-supports",
    body: "Utilisez un paquet Falcon portable ou un support local approuvé. Vérifiez le manifeste, l’empreinte, la version et les conflits avant fusion. Ne remplacez jamais silencieusement une version plus récente."
  },
  {
    id: "offline",
    title: "Cloud et fonctionnement hors connexion",
    body: "Falcon fonctionne sans cloud. Un espace connecté n’est utilisé qu’après une action explicite et doit être monté ou fourni par votre organisation. Hors réseau, continuez localement et contrôlez la file avant reprise."
  },
  {
    id: "privacy",
    title: "Confidentialité",
    body: "Les données restent locales tant que vous ne les exportez ni ne les partagez. Vérifiez destinataires, emplacement, politique de conservation et sensibilité avant toute diffusion."
  },
  {
    id: "troubleshooting",
    title: "Dépannage",
    body: "En cas d’accès refusé, resélectionnez le dossier. En cas d’export bloqué, utilisez le téléchargement local. En cas de conflit, conservez les deux versions puis comparez avant de choisir."
  },
  {
    id: "faq",
    title: "FAQ",
    body: "Falcon exige-t-il Internet ? Non. Un cloud ? Non. Écrase-t-il un dossier ? Non. Peut-il garantir seul qu’un partage Android a créé une copie galerie ? Non : une confirmation humaine explicite est demandée."
  }
]);

export function validateHelpCenter(topics = FALCON_HELP_TOPICS) {
  const ids = new Set();
  const issues = [];
  for (const topic of topics) {
    if (!topic?.id || !topic?.title || !topic?.body) issues.push("Rubrique incomplète.");
    if (ids.has(topic?.id)) issues.push(`Rubrique dupliquée : ${topic.id}.`);
    ids.add(topic?.id);
  }
  return Object.freeze({
    valid: issues.length === 0 && topics.length === 11,
    topicCount: topics.length,
    issues: Object.freeze(issues)
  });
}
