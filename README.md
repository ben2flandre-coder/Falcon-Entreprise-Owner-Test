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

Les fichiers runtime de `candidate/` sont copiés sans modification depuis l'application qualifiée. `deployment-contract.json` conserve leurs tailles et empreintes. Le workflow refuse le déploiement si un octet diffère ou si un fichier non déclaré apparaît. Il démarre également le candidat dans Chrome aux formats desktop et mobile, contrôle le bootstrap Enterprise et conserve les DOM et captures comme preuves. Une sonde en iframe observe l'application exacte et exige un runtime en mode `production` avec des registres métier vierges ; elle n'attribue aucun PASS ergonomique au téléphone réel.

## Exécution

1. laisser le dépôt privé pendant la préparation ;
2. exécuter `node scripts/qualify-candidate.mjs` ;
3. rendre le dépôt public uniquement pour la fenêtre de test si le plan GitHub l'exige ;
4. sélectionner **Settings → Pages → Source: GitHub Actions** ;
5. lancer manuellement **Qualify and deploy owner test candidate** ;
6. tester l'URL générée sur PC puis téléphone avec des données fictives ;
7. compléter `OWNER-TEST-SESSION.md` hors des données métier ;
8. dépublier Pages puis repasser le dépôt en privé.

## Limite de confidentialité

Une application web publique transmet nécessairement au navigateur le HTML, le CSS et le JavaScript qu'il exécute. Ce dépôt isole donc l'historique, les tickets, la configuration, la licence, les kits et les preuves internes, mais il ne peut pas rendre secret le code runtime servi par Pages.
