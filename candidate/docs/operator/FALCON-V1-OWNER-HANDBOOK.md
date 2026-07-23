# Falcon Enterprise V1 — Manuel propriétaire

Statut : documentation EI-16.3  
Version produit documentée : `48.0.0-rc.1`  
Baseline de rédaction : `e45a0dfa7d6988acf668da91a5cb14e5e76c5e28`  
Public : propriétaire, opérateur désigné et responsable de mission

## 1. Objet et règles de sécurité

Ce manuel décrit l'installation, le démarrage et l'utilisation contrôlée de Falcon Enterprise V1. La version documentée est une application web portable, locale et souveraine. Elle ne doit pas être ouverte directement depuis l'archive : extrayez toujours le paquet dans un dossier propre puis lancez-le avec un serveur HTTP local.

Règles impératives :

1. vérifiez l'intégrité du paquet avant la première ouverture ;
2. conservez une copie intacte du paquet reçu ;
3. affectez un opérateur identifié ;
4. définissez un emplacement de sauvegarde distinct du dossier d'installation ;
5. n'utilisez pas de données client réelles pendant les essais EI-16.3 ;
6. exportez une sauvegarde avant une importation, une restauration ou une réinitialisation ;
7. ne partagez jamais un export ou un diagnostic sans validation humaine.

La RC de référence désactive l'IA externe et l'évaluation dynamique. Aucune clé API ne doit être ajoutée au paquet. Voir [Limites connues](#12-limites-connues).

## 2. Prérequis

- archive Falcon Enterprise fournie par le canal autorisé ;
- navigateur moderne maintenu ;
- droit d'écriture dans le dossier de travail et le dossier de sauvegarde ;
- Python 3 pour servir localement les fichiers ;
- Node.js 20 ou supérieur uniquement si vous construisez ou qualifiez la source ;
- espace de stockage local surveillé par l'opérateur.

Le paquet de distribution contient au minimum `index.html`, `script.js`, `src/`, `release-manifest.json`, `SHA256SUMS` et `PACKAGE_SHA256`. La documentation opérateur est obligatoire dans l'édition Enterprise.

## 3. Installation propre

### 3.1 Réception et isolement

1. créez un nouveau dossier vide, par exemple `Falcon-Enterprise-48-rc1` ;
2. copiez l'archive reçue et sa preuve de provenance dans un emplacement d'archives ;
3. extrayez le contenu dans le nouveau dossier ;
4. vérifiez qu'aucun état d'une installation précédente n'a été copié dans ce dossier ;
5. consignez la date, l'opérateur, la version et le SHA source du manifeste.

### 3.2 Contrôle d'intégrité

Depuis la racine du paquet extrait, sous Linux :

```bash
sha256sum -c SHA256SUMS
sha256sum release-manifest.json
```

La première commande doit déclarer chaque fichier conforme. Comparez ensuite manuellement l'empreinte affichée pour `release-manifest.json` à l'unique valeur contenue dans `PACKAGE_SHA256`.

Sous PowerShell, calculez chaque empreinte avec `Get-FileHash -Algorithm SHA256` et comparez-la aux valeurs de `SHA256SUMS`, puis calculez l'empreinte du manifeste indiquée par `PACKAGE_SHA256`.

Arrêtez l'installation si un fichier est absent, si une empreinte diffère, si `release-manifest.json` ne porte pas un SHA Git complet de 40 caractères, ou si le manifeste annonce un profil autre que `production` ou un mode démonstration actif.

### 3.3 Construction depuis une source autorisée

Cette opération concerne le mainteneur, pas l'utilisateur terrain :

```bash
npm run build:rc -- --source-commit=<SHA_GIT_COMPLET_40_CARACTERES> --output=build/release-candidate
```

La construction doit être lancée sur le commit exact à livrer. Ne remplacez jamais le SHA par un nom de branche.

## 4. Lancement et arrêt contrôlés

### 4.1 Lancement

Depuis la racine du paquet extrait :

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Ouvrez ensuite `http://127.0.0.1:4173/index.html` dans le navigateur prévu. Ne rendez pas le serveur accessible sur le réseau et ne remplacez pas `127.0.0.1` par `0.0.0.0`.

Au premier démarrage :

1. confirmez la version et le contexte affichés ;
2. vérifiez qu'aucun dossier utilisateur n'est préchargé ;
3. contrôlez que le mode démonstration n'est pas actif implicitement ;
4. lancez le diagnostic disponible et consignez le résultat ;
5. créez une sauvegarde initiale avant le premier scénario.

### 4.2 Arrêt

1. terminez ou suspendez proprement la session active ;
2. enregistrez le dossier ;
3. exportez la sauvegarde attendue par le protocole ;
4. fermez les onglets Falcon ;
5. arrêtez le serveur avec `Ctrl+C` dans le terminal ;
6. consignez l'arrêt et toute alerte observée.

## 5. Modes vierge et démonstration

### Mode vierge

Le profil de production démarre avec `demoMode=false`. Une installation propre ne doit contenir ni mission, ni dossier, ni données de démonstration préchargées. Utilisez ce mode pour les essais propriétaires contrôlés et, plus tard, pour les données autorisées.

### Mode démonstration

Le mode démonstration est explicite, isolé dans l'espace de persistance `falcon-enterprise-demo` et non destructif pour le profil `Démonstration`. Il ne doit jamais être confondu avec la production. La configuration de production refuse l'activation du mode démonstration.

Avant de réinitialiser une démonstration, Falcon crée une sauvegarde locale de sécurité et demande une confirmation. Après réinitialisation, vérifiez l'état vierge et revenez au tableau de bord.

## 6. Missions, sessions et parcours critique

Le parcours canonique est : **Observer → Analyser → Décider → Agir → Prouver**.

### Mission

Une mission porte le cadre général : objectif, organisation, client, intervenants et contexte. Donnez-lui un intitulé stable et vérifiez son périmètre avant de créer des preuves. Une modification de périmètre doit être tracée dans le dossier et répercutée dans l'analyse.

### Session

Une session représente une séquence de travail au sein d'une mission. Créez-la, activez-la avant la collecte, puis archivez-la lorsqu'elle est terminée. Ne mélangez pas dans une même session des contextes ou dates qui devraient rester auditables séparément.

### Contrôle minimal du flux

1. créer ou sélectionner une mission ;
2. créer et activer une session ;
3. enregistrer au moins une observation ;
4. joindre le média utile et contrôler sa provenance ;
5. qualifier la criticité ;
6. générer Radar et Trust ;
7. formuler la décision et le plan d'action ;
8. produire le rapport ;
9. exporter le résultat et la sauvegarde de fin de scénario.

## 7. Dossiers, observations, médias et criticité

### Dossiers

Un onglet navigateur est lié à un dossier actif. Plusieurs onglets peuvent consulter des contextes distincts, mais une écriture depuis une révision obsolète est refusée. Si Falcon signale un conflit, n'écrasez rien : rechargez le dossier concerné, vérifiez la révision, puis rejouez uniquement l'action nécessaire.

### Observations

Une observation doit distinguer le fait observé, sa source, son horodatage et son interprétation. Utilisez des formulations vérifiables. Ne présentez pas une hypothèse comme une preuve.

### Médias

N'attachez que les fichiers nécessaires et autorisés. Vérifiez le dossier actif avant chaque ajout. Un média exporté reste sous la responsabilité de l'opérateur ; Falcon ne réalise pas de diffusion externe implicite.

### Criticité

Renseignez les données requises avant calcul. Si une preuve manque, conservez la réserve visible au lieu de surévaluer la confiance. Toute modification des éléments sources doit conduire à recalculer les indicateurs dépendants.

## 8. Radar, Trust et Decision Cockpit

### Radar

Radar synthétise les dimensions évaluées. Contrôlez la couverture, la confiance et le statut d'interprétation. Un score sans couverture suffisante n'est pas une conclusion autonome.

### Trust

Trust exprime la qualité et la cohérence du socle de preuve. Lisez conjointement l'indice, les axes et les réserves. Une confiance faible impose une investigation complémentaire, pas une correction manuelle du résultat.

### Decision Cockpit

Le cockpit aide à arbitrer ; il ne remplace pas la décision humaine. Avant de valider une décision :

- vérifiez que le bon dossier et la bonne mission sont actifs ;
- consultez les preuves et réserves associées ;
- rafraîchissez après toute modification amont ;
- consignez la justification, le responsable et l'action attendue ;
- contrôlez la cohérence du rapport final.

## 9. Rapports et exports

Le moteur prépare des exports `html`, `json`, `pdf`, `docx` ou `zip`. La disponibilité réelle d'un format dépend de l'adaptateur présent dans le runtime ; un format indisponible doit produire un échec explicite, jamais un fichier silencieusement incomplet.

Procédure :

1. régénérez le rapport après la dernière modification de preuve ;
2. relisez la synthèse, Radar, Trust, réserves et traçabilité ;
3. validez humainement le contenu ;
4. choisissez le format nécessaire ;
5. contrôlez le nom, la taille et l'ouverture du fichier produit ;
6. conservez ensemble l'export, le manifeste associé et la sauvegarde du dossier ;
7. tracez toute diffusion externe.

Le rendu HTML est déterministe, sans script embarqué, et inclut une mise en page d'impression. Si l'adaptateur PDF n'est pas disponible, imprimez le HTML en PDF depuis un navigateur contrôlé et mentionnez cette méthode dans la preuve.

## 10. Sauvegarde, restauration et retour arrière

### Sauvegarde

Créez une sauvegarde : au démarrage du pilote, avant une opération risquée, à la fin d'un scénario et avant l'arrêt. Notez l'identité de l'opérateur et le motif. Conservez la sauvegarde hors du dossier d'installation.

### Restauration

1. stoppez les écritures ;
2. créez si possible une sauvegarde de l'état courant ;
3. sélectionnez une sauvegarde connue et vérifiez son intégrité ;
4. vérifiez la compatibilité de version ;
5. préparez la restauration avec l'identité et le motif ;
6. lisez les impacts et confirmez avec le jeton affiché ;
7. exécutez avec le même opérateur ;
8. vérifiez mission, session, observations, indicateurs, rapport et export après restauration.

La restauration automatique et silencieuse est interdite. Un paquet altéré, incomplet ou d'une version incompatible doit être refusé.

### Retour arrière d'installation

Revenez au dernier paquet qualifié si le démarrage est bloqué, si l'intégrité des données est menacée, si la restauration échoue ou si un événement de sécurité critique apparaît. Conservez les deux paquets, tracez la décision, restaurez seulement une sauvegarde compatible et rejouez le contrôle d'acceptation.

## 11. Profils, permissions et licence

### Profils

| Profil | Usage principal | Niveau |
|---|---|---:|
| Super Administrateur | Gouvernance Enterprise et contrôle total local | 100 |
| Administrateur | Administration opérationnelle | 90 |
| Responsable | Pilotage de mission et supervision | 75 |
| Consultant Senior | Production complète d'audit | 70 |
| Auditeur | Contribution terrain et analyse | 60 |
| Préventeur | Prévention et plans d'action | 55 |
| Client | Lecture et suivi limité des actions | 35 |
| Lecteur | Consultation seule | 20 |
| Démonstration | Démonstration non destructive | 10 |

Appliquez le moindre privilège. Le profil `Super Administrateur` est réservé à la gouvernance ; le profil `Démonstration` ne crée ni session ni document. Contrôlez le profil actif avant toute exportation, restauration ou configuration de sécurité.

### Licence

La V1 documentée fonctionne localement et hors ligne. Les modes affichés comme `serveur licence futur` et `SSO futur` sont des perspectives, pas des capacités actives. Ne documentez ni ne promettez une activation distante tant que EI-16.4 n'a pas livré le packaging, la configuration et la licence propriétaires.

Contrôles opérateur :

1. vérifiez l'identité du détenteur et l'édition autorisée ;
2. contrôlez la période et la tolérance hors ligne affichées ;
3. n'altérez pas un fichier ou une clé de licence ;
4. consignez tout refus ou changement d'état ;
5. escaladez une anomalie de licence sans contourner le contrôle.

## 12. Limites connues

- Les données résident dans le stockage du profil navigateur ; il n'existe pas de synchronisation cloud implicite.
- L'opérateur reste responsable des sauvegardes externes et de leur conservation.
- L'IA externe est désactivée dans la RC qualifiée.
- Le mode production refuse le mode démonstration.
- Les modes serveur de licence et SSO sont futurs.
- Les formats PDF, DOCX et ZIP nécessitent un adaptateur disponible ; HTML et JSON constituent les formats de base vérifiables.
- La diffusion externe exige une action humaine.
- Les données client réelles sont interdites pendant le pilote EI-16.3.
- Un conflit de révision entre onglets bloque l'écriture obsolète et impose un rechargement contrôlé.
- Le Decision Cockpit assiste la décision humaine ; il ne fournit pas une décision autonome.

Toute limite nouvelle doit être consignée avec le [modèle de signalement](FALCON-V1-DEFECT-REPORT-TEMPLATE.md).

## 13. Essais terrain et assistance

Exécutez le [protocole d'essais terrain](FALCON-V1-FIELD-TEST-PROTOCOL.md) sur un paquet dont l'intégrité a été vérifiée. Pour toute anomalie, utilisez le [modèle de signalement](FALCON-V1-DEFECT-REPORT-TEMPLATE.md) et joignez le diagnostic exporté après vérification de son contenu.

Le mainteneur dispose du [manuel de maintenance](../developer/FALCON-V1-MAINTENANCE-HANDBOOK.md) et de la [matrice de traçabilité EI-16.3](../developer/EI-16.3-DOCUMENTATION-TRACEABILITY.md).
