# Falcon Enterprise — Owner Test Site

Ce dépôt contient uniquement le candidat navigateur nécessaire aux essais contrôlés EI-16.4 du propriétaire produit.

La source canonique et l’objectif principal restent exclusivement `ben2flandre-coder/Falcon-Entreprise`. Ce dépôt est un banc d’essai temporaire : aucune correction produit ne doit y être développée directement. Tout écart constaté doit être corrigé dans la source canonique, puis réinjecté ici par reconstruction depuis un SHA fusionné et qualifié.

Il ne s'agit ni d'une release publique, ni d'une autorisation commerciale, ni du dépôt source complet. Le déploiement Pages est temporaire et doit être retiré après les essais.

## Candidat en reconstruction

- application : `48.0.0-rc.1`
- source cible : `ben2flandre-coder/Falcon-Entreprise@2c3a0945650514a88fc7050187e6e6ea1c5f2775`
- origine : PR source #234 fusionnée
- phase : EI-16.4-P1-R1
- issue de preuve : `ben2flandre-coder/Falcon-Entreprise#233`
- données réelles : interdites
- IA externe : interdite
- synchronisation PC/téléphone : aucune ; chaque navigateur conserve son propre stockage local

Le candidat précédent fondé sur `d21cff4b42afa05e68883462862fbdcd138f1189` est obsolète. Il ne doit plus être utilisé pour rendre un verdict sur l’état actuel de Falcon Enterprise.

## Capacités à pousser

La prochaine campagne doit tester, hors démonstration puis avec scénarios avancés contrôlés :

1. création d’un dossier vierge et reprise exacte après fermeture ;
2. import/export JSON, sauvegarde, restauration et rollback ;
3. observations, médias, criticité, Radar, Trust et Decision Cockpit ;
4. rapport Prestige sur desktop et mobile ;
5. profils, autorisations, entitlements et restrictions ;
6. thème Jour/Nuit, navigation mobile, safe areas et tableaux ;
7. volumes élevés, données incomplètes et scénarios dégradés ;
8. parcours démonstration isolés, sans contamination du parcours production.

## Doctrine de qualification

- le SHA source exact doit figurer dans chaque preuve ;
- une gate technique verte ne vaut pas validation humaine ;
- aucune correction produit directe dans ce dépôt ;
- les défauts sont ouverts et corrigés dans `Falcon-Entreprise` ;
- le candidat est ensuite reconstruit depuis `main` ;
- Pages est retiré à la fin de la fenêtre de test.

## Exécution attendue

1. reconstruire le candidat depuis `Falcon-Entreprise@2c3a0945650514a88fc7050187e6e6ea1c5f2775` ;
2. recalculer `deployment-contract.json` et toutes les empreintes ;
3. qualifier le candidat localement et dans GitHub Actions ;
4. publier Pages uniquement après qualification verte ;
5. exécuter les tests PC et mobile avec données fictives ;
6. consolider les retours dans l’issue source #233 ;
7. dépublier Pages après la campagne.

## Limite de confidentialité

Une application web publique transmet nécessairement au navigateur le HTML, le CSS et le JavaScript qu'il exécute. Ce dépôt isole donc l'historique, les tickets, la configuration, la licence interne, les kits et les preuves internes, mais il ne peut pas rendre secret le code runtime servi par Pages. Le fichier d'activation publié est un contrat de test sans secret et sans droit commercial ; il ne s'agit pas de la licence interne du bundle propriétaire.
