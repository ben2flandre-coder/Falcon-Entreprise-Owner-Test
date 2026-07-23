# Falcon Enterprise V1 — Protocole d'essais terrain

Statut : EI-16.3  
Version : `48.0.0-rc.1`  
Principe : données fictives uniquement jusqu'à autorisation propriétaire explicite

## 1. Fiche d'exécution

| Champ | Valeur à consigner |
|---|---|
| Date et créneau | |
| Opérateur | |
| Machine / système | |
| Navigateur / version | |
| Version Falcon | |
| SHA source du manifeste | |
| Empreinte du paquet | |
| Dossier d'installation | |
| Emplacement de sauvegarde | |
| Identifiant du scénario | |

## 2. Conditions d'entrée

- [ ] archive reçue par le canal autorisé ;
- [ ] empreintes `SHA256SUMS` et `PACKAGE_SHA256` conformes ;
- [ ] extraction dans un dossier propre ;
- [ ] profil de production et démonstration désactivée ;
- [ ] aucune donnée utilisateur préchargée ;
- [ ] navigateur moderne maintenu ;
- [ ] opérateur et emplacement de sauvegarde définis ;
- [ ] paquet de retour arrière disponible ;
- [ ] données de scénario fictives préparées.

Un seul échec de condition d'entrée interdit de poursuivre. Ouvrez un signalement et conservez les preuves.

## 3. Jeu de données fictif minimal

Utilisez des noms sans rapport avec une personne ou une entreprise réelle :

- mission `PILOTE-EI16-3` ;
- session `SESSION-01` ;
- dossier `DOSSIER-FICTIF-A` ;
- une observation factuelle, une hypothèse explicitement marquée et un média non sensible ;
- une criticité comportant suffisamment de données pour un calcul ;
- une action avec responsable fictif et échéance ;
- un rapport et deux exports, HTML et JSON.

## 4. Scénario nominal

| Étape | Action | Résultat attendu | Preuve |
|---:|---|---|---|
| 1 | Lancer le serveur local et ouvrir `index.html` | Falcon démarre sans erreur bloquante | capture + heure |
| 2 | Exécuter le diagnostic | système cohérent ou alertes expliquées | export diagnostic |
| 3 | Vérifier l'état vierge | aucun dossier ou contenu implicite | capture |
| 4 | Créer la mission fictive | mission visible et sélectionnée | identifiant |
| 5 | Créer puis activer la session | session active liée à la mission | identifiant |
| 6 | Créer le dossier et l'observation | données conservées après rafraîchissement | capture avant/après |
| 7 | Ajouter le média fictif | média attaché au bon dossier | nom + taille |
| 8 | Calculer la criticité | résultat explicite et traçable | valeur + réserves |
| 9 | Générer Radar et Trust | indicateurs, couverture et réserves visibles | capture |
| 10 | Ouvrir le Decision Cockpit | preuves du dossier actif affichées | capture |
| 11 | Décider et créer une action | justification et action persistées | identifiants |
| 12 | Générer le rapport | synthèse et traçabilité cohérentes | fichier HTML |
| 13 | Exporter HTML et JSON | deux fichiers ouvrables et non vides | noms + empreintes |
| 14 | Créer une sauvegarde | paquet intègre avec version et motif | fichier + empreinte |
| 15 | Fermer puis relancer Falcon | dossier retrouvé sans perte | capture |

## 5. Scénarios de robustesse

### Restauration contrôlée

1. créez une sauvegarde de sécurité ;
2. modifiez une donnée fictive identifiable ;
3. préparez la restauration de la sauvegarde nominale ;
4. contrôlez version et intégrité ;
5. confirmez avec le même opérateur ;
6. vérifiez le retour de la donnée initiale ;
7. régénérez Radar, Trust, rapport et export.

Verdict attendu : restauration confirmée, auditée et suivie d'une vérification fonctionnelle.

### Import invalide

Présentez un fichier JSON dont la racine n'est pas un objet ou une sauvegarde dont l'empreinte a été modifiée. N'utilisez aucune donnée sensible.

Verdict attendu : refus explicite, état courant intact et possibilité de poursuivre après l'erreur.

### Conflit multi-onglets

1. ouvrez le même dossier dans deux onglets ;
2. enregistrez une modification dans le premier ;
3. tentez d'enregistrer une révision devenue obsolète dans le second.

Verdict attendu : écriture obsolète refusée avec instruction de rechargement ; aucune perte silencieuse.

### Quota ou stockage indisponible

Sur une copie de test contrôlée, simulez l'indisponibilité de persistance selon le moyen prévu par le banc de qualification. N'altérez pas le navigateur principal.

Verdict attendu : message exploitable, aucune confirmation mensongère, export de sécurité recommandé.

### Mode démonstration

Activez uniquement le profil de démonstration prévu, contrôlez son isolement, puis réinitialisez après confirmation.

Verdict attendu : données de démonstration explicites, profil non destructif et retour à un état vierge.

## 6. Contrôle des rôles

Au minimum :

- [ ] `Lecteur` peut consulter mais ne peut pas modifier mission ou session ;
- [ ] `Client` peut suivre une action sans configurer la sécurité ;
- [ ] `Démonstration` ne peut créer ni session ni document ;
- [ ] `Auditeur` contribue sans archiver une session ;
- [ ] `Consultant Senior` produit et exporte sans administration totale ;
- [ ] toute opération sensible est testée avec le profil minimal attendu.

## 7. Contrôle arrêt et retour arrière

- [ ] sauvegarde de fin créée et vérifiée ;
- [ ] session arrêtée ou suspendue proprement ;
- [ ] onglets fermés avant arrêt du serveur ;
- [ ] serveur local arrêté ;
- [ ] emplacement des preuves consigné ;
- [ ] paquet précédent disponible ;
- [ ] procédure de retour arrière relue, sans l'exécuter si aucun déclencheur n'existe.

## 8. Verdict

| Axe | PASS / FAIL / BLOCKED | Preuve / anomalie |
|---|---|---|
| Installation et intégrité | | |
| Démarrage et arrêt | | |
| Mode vierge / démonstration | | |
| Mission / session | | |
| Dossier / observation / média | | |
| Criticité / Radar / Trust | | |
| Decision Cockpit | | |
| Rapport / exports | | |
| Sauvegarde / restauration | | |
| Rôles / permissions | | |
| Robustesse | | |

Verdict global : `PASS`, `FAIL` ou `BLOCKED`  
Décision recommandée : poursuivre, corriger puis rejouer, ou suspendre  
Opérateur / date / signature :

Un `FAIL` bloquant, un risque d'intégrité, un échec de restauration ou un événement de sécurité critique suspend le pilote.

## 9. Signalement

Dupliquez [le modèle d'anomalie](FALCON-V1-DEFECT-REPORT-TEMPLATE.md), remplissez tous les champs obligatoires et retirez toute donnée sensible du diagnostic avant transmission.

