# Falcon Enterprise V1 — Runbook de la version interne propriétaire

Statut : EI-16.4-P0  
Bundle : `48.0.0-internal.1`  
Application : `48.0.0-rc.1`  
Baseline d'entrée : `20e9ec46392188e8ebcce3ef3792e040dbea078e`

## 1. Portée et décision de diffusion

Ce bundle est destiné aux essais contrôlés du propriétaire produit. Il n'est ni une publication, ni une prerelease publique, ni une autorisation de diffusion. Son manifeste doit porter le SHA exact construit et `publicationAuthorized=false`.

Les anciens contrats de promotion ou d'autorisation `48.0.0-rc.2` ciblent un autre SHA. Ils ne couvrent pas ce bundle et ne doivent pas être réutilisés.

## 2. Structure du bundle

Après téléchargement et extraction, la racine contient :

- `application/` : application Falcon qualifiée, profil production, sans données de test préchargées ;
- `configuration/` : configuration propriétaire et contrat de licence local sans secret ;
- `owner-test-kit/` : scénario fictif, protocole, modèle d'anomalie et présent runbook ;
- `evidence/` : preuve de vérification du candidat applicatif ;
- `internal-owner-manifest.json` : inventaire canonique lié au SHA source ;
- `INTERNAL_SHA256SUMS` : empreintes de tous les fichiers déclarés et du manifeste ;
- `INTERNAL_PACKAGE_SHA256` : empreinte du manifeste interne.

La séparation est impérative : le scénario fictif ne doit jamais apparaître dans `application/release-manifest.json` et il n'est jamais importé automatiquement.

## 3. Réception et vérification

1. téléchargez l'artefact GitHub Actions associé au SHA qualifié ;
2. conservez une copie intacte de l'archive reçue ;
3. extrayez-la dans un nouveau dossier vide ;
4. vérifiez que `internal-owner-manifest.json` annonce le SHA attendu ;
5. exécutez depuis la racine extraite :

```bash
sha256sum -c INTERNAL_SHA256SUMS
sha256sum internal-owner-manifest.json
```

Comparez la seconde empreinte à l'unique valeur de `INTERNAL_PACKAGE_SHA256`. Suspendez l'essai si une empreinte diffère, si un fichier est absent, si le SHA est inattendu ou si la publication est annoncée comme autorisée.

## 4. Configuration et licence

La configuration impose un usage local : profil `production`, démonstration désactivée, IA externe désactivée, serveur lié à `127.0.0.1`, données fictives uniquement et transmission externe sur action humaine.

Le fichier `configuration/internal-owner-license.json` est un contrat Enterprise sans secret :

- édition `enterprise` ;
- capacités Enterprise déclarées ;
- activation `local-offline` ;
- diffusion et transfert interdits ;
- aucune activation distante ;
- aucune autorisation commerciale.

Limite importante : les modules de licence et d'entitlements sont qualifiés, mais l'écran historique « Licences & profils » reste une couche de gouvernance locale et précise que le Showcase n'applique pas encore de verrou bloquant. Le fichier fourni ne doit donc pas être présenté comme une protection cryptographique ou une activation commerciale.

## 5. Installation et premier lancement

Depuis `application/` :

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Ouvrez `http://127.0.0.1:4173/index.html`, puis consignez :

- date et opérateur ;
- système et version du navigateur ;
- SHA du manifeste ;
- empreinte du bundle ;
- profil de production ;
- absence de mission ou dossier préchargé ;
- résultat du diagnostic ;
- emplacement de la sauvegarde initiale.

N'utilisez jamais `0.0.0.0` et ne rendez pas le serveur accessible sur le réseau.

## 6. Remise à zéro contrôlée

1. exportez une sauvegarde de sécurité ;
2. confirmez que seules des données fictives sont présentes ;
3. utilisez la commande de réinitialisation prévue par Falcon ;
4. acceptez la confirmation après lecture des impacts ;
5. rechargez l'application ;
6. vérifiez l'absence de mission, session, observation, rapport et export résiduels ;
7. consignez la sauvegarde créée avant nettoyage et le verdict.

Une remise à zéro ne doit jamais supprimer silencieusement une donnée réelle. Si le périmètre est incertain, arrêtez et restaurez l'environnement d'essai à partir d'une copie contrôlée.

## 7. Scénario propriétaire fictif

Le fichier `owner-test-kit/realistic-owner-scenario.json` décrit les valeurs à saisir ou à rejouer : mission industrielle fictive, session terrain, dossier, observation, média factice, criticité, contributions Radar et rapport.

Il s'agit d'un scénario, pas d'un import automatique. L'opérateur contrôle chaque création afin d'évaluer l'ergonomie et la compréhension réelle du produit.

## 8. Protocole sur trois journées

### Jour 1 — Installation et collecte

- vérifier et installer le bundle dans un dossier propre ;
- lancer Falcon et exporter le diagnostic ;
- créer la sauvegarde initiale ;
- créer mission, session, dossier, observation et média fictif ;
- fermer proprement Falcon et arrêter le serveur ;
- enregistrer irritants, erreurs et temps perçu.

### Jour 2 — Reprise et décision

- relancer depuis le même profil navigateur ;
- vérifier la reprise exacte ;
- calculer criticité, Radar et Trust ;
- examiner les réserves dans le Decision Cockpit ;
- documenter une décision et son action ;
- créer une sauvegarde intermédiaire ;
- tester un second onglet sans provoquer d'écrasement silencieux.

### Jour 3 — Preuve et récupération

- générer et relire le rapport ;
- produire les exports HTML et JSON ;
- vérifier ouverture, taille et empreinte ;
- exécuter une restauration contrôlée de la sauvegarde intermédiaire ;
- régénérer le rapport après restauration ;
- compléter le journal de retours ;
- rendre une décision : poursuivre, corriger puis rejouer, ou suspendre.

Une journée ne devient `PASS` qu'après exécution et conservation des preuves. La disponibilité d'un artefact ou d'un test automatique la place seulement à l'état `READY`.

## 9. Journal et classification

Utilisez `FALCON-V1-DEFECT-REPORT-TEMPLATE.md`. Chaque entrée doit contenir heure, version, SHA, environnement, étapes, attendu, observé, impact et preuve expurgée.

| Classe | Traitement |
|---|---|
| `blocking` | suspendre immédiatement le pilote |
| `major` | corriger avant reprise si aucun contournement sûr |
| `minor` | planifier un micro-lot prouvé |
| `cosmetic` | regrouper sans masquer l'écart |
| `future-improvement` | conserver hors gel V1 si non nécessaire |

Ne corrigez que les écarts reproduits. Chaque correctif exige son propre test, ses workflows de tête et une qualification du SHA fusionné.

## 10. Gel de la version interne

Le gel reste interdit tant que :

- les trois journées ne sont pas terminées ;
- une anomalie `blocking` ou `major` reste ouverte ;
- une restauration n'a pas été prouvée ;
- le SHA, l'artefact et les digests ne sont pas consignés ;
- le propriétaire n'a pas rendu une décision explicite.

Le gel doit enregistrer : bundle, version applicative, SHA `main`, manifeste, digest, navigateur, environnement, journal final, anomalies acceptées et décision propriétaire.

Documents associés : [manuel propriétaire](FALCON-V1-OWNER-HANDBOOK.md), [protocole terrain](FALCON-V1-FIELD-TEST-PROTOCOL.md) et [modèle d'anomalie](FALCON-V1-DEFECT-REPORT-TEMPLATE.md).

