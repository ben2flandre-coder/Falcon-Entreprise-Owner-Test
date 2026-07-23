# Release Candidate — Guide développeur

## Critères de promotion

Une Release Candidate Falcon exige :

- un manifeste conforme à `falcon.release.manifest.v1` ;
- un commit source complet et identifiable ;
- un Falcon Engineering Gate vert ;
- le profil `production` ;
- le mode démonstration désactivé ;
- les procédures d’installation, mise à jour et retour arrière ;
- une checklist opérateur ;
- aucune rupture de compatibilité non documentée ;
- aucune clé sensible dans le dépôt ;
- une décision explicite de promotion.

## Construction

Le package RC reste local-first. Il ne doit ajouter aucun transfert réseau implicite, aucune récupération silencieuse et aucune mutation de données hors contrats publics.

## Promotion

La validation technique ne suffit pas. La promotion nécessite une revue Release Readiness couvrant architecture, tests, sécurité, compatibilité, documentation, exploitation et risques résiduels.

## Retour arrière

Toute évolution incompatible doit fournir une stratégie de migration et une procédure de retour arrière vérifiable.
