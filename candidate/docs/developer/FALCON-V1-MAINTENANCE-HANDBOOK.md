# Falcon Enterprise V1 — Manuel de maintenance technique

Statut : documentation minimale EI-16.3  
Version documentée : `48.0.0-rc.1`  
Baseline de rédaction : `e45a0dfa7d6988acf668da91a5cb14e5e76c5e28`

## 1. Objet et autorité

Ce document définit le minimum nécessaire pour maintenir, construire, qualifier et diagnostiquer Falcon Enterprise V1 sans contourner ses garde-fous. Il ne remplace ni une décision de release ni l'autorisation de publication.

Ordre d'autorité :

1. commit Git qualifié ;
2. spécifications sous `release/` ;
3. manifestes et empreintes générés ;
4. tests automatisés ;
5. preuves GitHub Actions ;
6. documentation opérateur.

Si la documentation diverge du code ou d'un contrat exécutable, suspendez la livraison, classez l'écart et corrigez la source appropriée avec preuve de non-régression.

## 2. Architecture maintenable

Falcon est une application web portable organisée en couches :

- `Falcon_Radar_360_V46_8_0_ENTERPRISE_SECURITY_FOUNDATION.html` : entrée historique contrôlée ;
- `script.js` : runtime historique durci à la construction ;
- `src/app/` : bootstrap, contrôleurs, navigation et présentation ;
- `src/modules/` : contrats métier, persistance, sécurité, récupération, release et cockpit ;
- `release/` : spécifications et politiques de construction/distribution ;
- `scripts/release/` : assemblage déterministe de la RC ;
- `scripts/quality/` : audits statiques ;
- `tests/` : tests unitaires, d'intégration, de frontières et de qualification ;
- `docs/operator/` et `docs/developer/` : documentation embarquée dans le paquet Enterprise.

Les modules métier ne doivent pas dépendre du DOM, du réseau ou du stockage navigateur. Les adaptateurs et contrôleurs portent ces effets. Les tests de frontières interdisent les dépendances inversées et l'accès direct non autorisé.

## 3. Configuration et sécurité

Les profils explicites sont `development`, `demonstration` et `production`. La production utilise :

- niveau de journalisation `warn` ;
- diagnostics activés ;
- démonstration désactivée ;
- espace de persistance `falcon-enterprise` ;
- canal `production`.

Le profil de production refuse `demoMode=true`. Les clés sensibles — secret, jeton, mot de passe, clé API, clé privée ou identifiant technique — sont interdites dans les surcharges de configuration. La RC annonce `externalAI=false` et `dynamicEvaluation=false`; la construction doit appliquer ces garde-fous et échouer s'ils ne peuvent être prouvés.

Ne commitez jamais `.env`, clé, certificat ou archive de données. Les profils de distribution les déclarent interdits.

## 4. Construction reproductible

Prérequis : Node.js 20 ou supérieur, arbre source propre et SHA Git complet du commit courant.

```bash
npm test
npm run build:rc -- --source-commit=<SHA_GIT_COMPLET_40_CARACTERES> --output=build/release-candidate
```

Le constructeur :

1. lit `release/package-files.json` et `release/release-spec.json` ;
2. vérifie l'égalité des versions entre `package.json` et la spécification ;
3. copie l'inventaire autorisé et applique le durcissement à `script.js` ;
4. génère `index.html` depuis l'entrée historique avec le bootstrap et la feuille de style Enterprise ;
5. écrit `release-manifest.json` avec le SHA source, la version, le profil, les fonctionnalités et l'empreinte de chaque fichier ;
6. écrit `SHA256SUMS` et `PACKAGE_SHA256`.

Construisez deux fois le même SHA dans deux dossiers distincts et comparez les manifestes et empreintes pour toute modification de la chaîne d'assemblage.

## 5. Qualification obligatoire

### Socle

```bash
npm test
npm run test:ei16-documentation
```

Le premier exécute les audits de santé du code, l'intégrité de baseline, la syntaxe, les frontières architecturales, les modules métier, le runtime Enterprise, le packaging et la matrice EI-16.2. Le second valide le contrat documentaire EI-16.3, les fichiers, les liens relatifs, la couverture des exigences et l'inclusion dans le paquet.

### Preuves minimales avant merge

- SHA de tête de la PR figé ;
- tous les workflows requis terminés avec succès sur ce SHA ;
- artefact de qualification documentaire conservé ;
- absence de commentaire bloquant non résolu ;
- diff limité au périmètre annoncé ;
- versions et baseline cohérentes.

### Preuves minimales après merge

- SHA exact de `main` après fusion ;
- tests et statut combiné verts sur ce SHA ;
- construction RC réussie avec ce SHA ;
- issue de lot mise à jour puis close ;
- campagne #196 consolidée.

Ne qualifiez jamais une branche seulement par son nom ou par les résultats d'un SHA antérieur.

## 6. Persistance, sauvegarde et restauration

La persistance est coordonnée par contrat. Le coordinateur de récupération :

- crée un paquet versionné avec manifeste, identité opérateur, motif et empreinte ;
- valide schéma, version et intégrité ;
- prépare un plan de restauration séparé ;
- exige le même opérateur et un jeton de confirmation ;
- impose une vérification après restauration ;
- conserve une trace d'audit ;
- ne supprime ni n'efface automatiquement l'état.

En incident critique : stoppez les écritures, sauvegardez l'état courant si possible, validez une sauvegarde connue, préparez une restauration confirmée puis vérifiez chaque flux critique. Une réparation silencieuse est interdite par le contrat de pilote.

## 7. Concurrence et multi-onglets

Chaque onglet reçoit un identifiant de session et conserve le dossier actif dans `sessionStorage`. Chaque dossier porte une révision monotone. Une sauvegarde depuis une révision obsolète est refusée ; le mainteneur ne doit ni retirer ce contrôle ni transformer le conflit en dernière écriture gagnante sans décision d'architecture, migration et tests dédiés.

Rejouez au minimum les tests de persistance, dossiers, mission/session, matrice EI-16.2 et le scénario terrain multi-onglets après toute modification de stockage ou de catalogue.

## 8. Rapports et exports

Le rapport est généré à partir d'un état métier traçable. Le rendu HTML doit rester déterministe, imprimable, échappé et sans script. Le moteur d'export accepte `html`, `json`, `pdf`, `docx` et `zip`, mais un format demandé n'est disponible que si son artefact peut être produit et validé. Un adaptateur manquant doit conduire à un statut `failed` explicite.

Après modification :

- rejouez les tests du moteur de rapport, du renderer, de l'export et du rapport Enterprise ;
- contrôlez les réserves, identifiants, révisions et checksums ;
- ouvrez les fichiers produits sur un jeu fictif ;
- ne modifiez pas un artefact après calcul de son empreinte.

## 9. Profils, permissions et licence

Le RBAC comprend 47 permissions et neuf profils. Toute modification doit :

1. conserver l'unicité des permissions ;
2. préserver le moindre privilège ;
3. documenter l'impact pour chaque profil ;
4. ajouter ou modifier un test de permission ;
5. rejouer le protocole terrain sur les profils affectés.

Le périmètre EI-16.3 documente l'état de licence visible et local. Le packaging, la configuration propriétaire et le mécanisme de licence livrable appartiennent à EI-16.4. Les libellés `serveur licence futur` et `SSO futur` ne doivent pas être interprétés comme des fonctions actives.

## 10. Diagnostic et classification

Utilisez les quatre niveaux du pilote :

- `blocking` : arrêt de la qualification ;
- `major` : correction avant reprise si aucun contournement sûr ;
- `minor` : défaut circonscrit ;
- `feedback` : amélioration non bloquante.

Preuves requises : horodatage, version, navigateur, étapes, attendu, observé et diagnostic exporté. Expurgez tout secret ou donnée personnelle avant transmission. N'appliquez jamais une réparation silencieuse à des données utilisateur.

## 11. Politique de changement

Un micro-lot doit être atomique : objectif unique, issue dédiée, branche depuis `main` qualifié, tests proportionnés, PR explicite et qualification du SHA fusionné. Mettez à jour le contrat documentaire lorsqu'un changement modifie une procédure, une limite, un profil, un format, un chemin ou une preuve.

Les changements cassant la donnée exigent une migration. Le contrat de compatibilité est `migration-required-on-breaking-change`. Une modification de format de sauvegarde, de clé de persistance, d'identifiant ou de schéma doit inclure : version de schéma, migration aller, stratégie de retour, tests d'anciens états et documentation opérateur.

## 12. Retour arrière technique

1. geler les écritures et la publication ;
2. identifier le dernier SHA et paquet qualifiés ;
3. conserver les preuves du défaut et les deux artefacts ;
4. valider la compatibilité des sauvegardes ;
5. déployer le paquet précédent dans un nouveau dossier ;
6. restaurer uniquement après contrôle et confirmation ;
7. rejouer installation, démarrage, mission, preuve, rapport, export et arrêt ;
8. documenter le verdict et le SHA effectivement utilisé.

Un retour arrière Git ne remplace pas la restauration des données et ne doit pas réécrire l'historique partagé.

## 13. Baseline et historique

| Version | Baseline documentaire | État |
|---|---|---|
| `48.0.0-rc.1` | `e45a0dfa7d6988acf668da91a5cb14e5e76c5e28` | EI-16.2 qualifiée, source de EI-16.3 |

La valeur courante de version provient de `package.json` et `release/release-spec.json`. Le SHA réellement livré provient de `release-manifest.json`; le tableau ci-dessus décrit uniquement la baseline de rédaction. Après la fusion de EI-16.3, la clôture doit enregistrer le nouveau SHA de `main` et sa preuve post-merge.

## 14. Documents liés

- [Manuel propriétaire](../operator/FALCON-V1-OWNER-HANDBOOK.md)
- [Protocole d'essais terrain](../operator/FALCON-V1-FIELD-TEST-PROTOCOL.md)
- [Modèle de signalement](../operator/FALCON-V1-DEFECT-REPORT-TEMPLATE.md)
- [Matrice de traçabilité EI-16.3](EI-16.3-DOCUMENTATION-TRACEABILITY.md)
- [Contrat documentaire exécutable](ei16-documentation-contract.json)

