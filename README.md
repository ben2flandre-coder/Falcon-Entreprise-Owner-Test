# Falcon Enterprise — Owner Test Site

Ce dépôt contient uniquement le candidat navigateur nécessaire aux essais contrôlés EI-16.4 du propriétaire produit.

Il ne s'agit ni d'une release publique, ni d'une autorisation commerciale, ni du dépôt source complet. Le déploiement Pages est temporaire et doit être retiré après les essais.

## Candidat

- application : `48.0.0-rc.1`
- source : `ben2flandre-coder/Falcon-Entreprise@d21cff4b42afa05e68883462862fbdcd138f1189`
- phase : EI-16.4
- issue de preuve : `ben2flandre-coder/Falcon-Entreprise#230`
- données réelles : interdites
- IA externe : interdite
- synchronisation PC/téléphone : aucune ; chaque navigateur conserve son propre stockage local

Les 21 fichiers runtime de `candidate/` sont copiés sans modification depuis l'application qualifiée. `deployment-contract.json` conserve leurs tailles et empreintes. Le workflow refuse le déploiement si un octet diffère ou si un fichier non déclaré apparaît.

La qualification navigateur utilise deux profils Chrome réellement isolés, un desktop et un mobile. Pour chacun, elle exige successivement :

1. un navigateur vierge en niveau local `trial` ;
2. une activation Enterprise explicite via `FalconSecurityManager.switchProfile()` et `FalconEnterprise.commercial.saveLicense()` — aucune écriture directe dans le stockage ;
3. un nouveau chargement du runtime en mode `production`, profil `Administrateur`, niveau `enterprise`, sept capacités attendues et registres métier vierges ;
4. le rendu de l'interface et la conservation des DOM et captures comme preuves.

Ce résultat automatique prouve l'intégrité du candidat, l'évaluation locale des droits et leur persistance après rechargement. Il ne prouve ni une licence cryptographique/commerciale, ni l'effectivité de chaque garde UI historique, ni l'ergonomie sur un vrai téléphone. Ces verdicts restent réservés à la session humaine.

## Écarts UI connus et volontairement visibles

Le runtime exact issu de `main` affiche encore, y compris en profil de production :

- l'identité `Showcase Edition S1+` ;
- la version visible `V46.5.0-SHOWCASE-V1.0` ;
- l'action **Charger démo avancée** ;
- le fallback de présentation **Usine Alpha — Audit sécurité opérationnelle** quand le dossier est vide.

La sonde prouve que les registres du runtime Enterprise sont vides ; elle ne transforme pas pour autant cet affichage en « état vierge » UX. L'artefact CI conserve donc `uiProductIdentityPass=false`, `visualBlankStatePass=false` et `humanWorkflowPass=false`. Le sas de test ne corrige ni ne masque ces écarts : les essais réels doivent permettre de les qualifier.

## Démarrage sur chaque appareil

Après le déploiement Pages, ne pas commencer directement par `index.html` :

1. ouvrir l'URL Pages terminée par `/activate.html` ;
2. vérifier le SHA court affiché puis choisir **Activer le profil Enterprise de test** ;
3. attendre l'état **ENTERPRISE · activation persistée** et `7/7` capacités ;
4. choisir **Ouvrir Falcon** ;
5. constater et qualifier séparément les libellés Showcase, la version visible et le fallback de démonstration ;
6. utiliser uniquement des données fictives et compléter le journal de session ;
7. répéter l'activation sur l'autre appareil, car le stockage n'est pas synchronisé.

## Exécution

1. laisser le dépôt privé pendant la préparation ;
2. exécuter `node scripts/qualify-candidate.mjs` ;
3. rendre le dépôt public uniquement pour la fenêtre de test si le plan GitHub l'exige ;
4. sélectionner **Settings → Pages → Source: GitHub Actions** ;
5. lancer manuellement **Qualify and deploy owner test candidate** ;
6. ouvrir `/activate.html`, activer, puis tester sur PC et téléphone avec des données fictives ;
7. compléter `OWNER-TEST-SESSION.md` hors des données métier ;
8. dépublier Pages puis repasser le dépôt en privé.

## Limite de confidentialité

Une application web publique transmet nécessairement au navigateur le HTML, le CSS et le JavaScript qu'il exécute. Ce dépôt isole donc l'historique, les tickets, la configuration, la licence interne, les kits et les preuves internes, mais il ne peut pas rendre secret le code runtime servi par Pages. Le fichier d'activation publié est un contrat de test sans secret et sans droit commercial ; il ne s'agit pas de la licence interne du bundle propriétaire.
