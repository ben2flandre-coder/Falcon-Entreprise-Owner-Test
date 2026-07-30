# Falcon Radar 360 — Protocole Owner Trial maximal

## Finalité

Ce protocole sert à tester Falcon comme un utilisateur découvrant le produit, tout en couvrant le maximum de capacités disponibles dans le candidat navigateur public.

Le test ne doit jamais utiliser de données réelles, personnelles, médicales, professionnelles sensibles ou confidentielles.

## Préparation

1. Ouvrir `activate.html`.
2. Choisir **Préparer un environnement neuf**.
3. Choisir **Accéder à Falcon**.
4. Ne pas chercher à interpréter un blocage : noter le libellé exact, l’écran, l’appareil, l’orientation et l’action précédente.

## Campagne A — Découverte vierge

Objectif : vérifier que Falcon se comprend sans explication orale.

- Identifier spontanément la proposition de valeur.
- Repérer comment créer ou ouvrir un dossier.
- Vérifier qu’aucun vocabulaire interne de développement n’est exposé : EI, GLOBAL, sprint, fixture, runtime, debug ou TODO.
- Relever les boutons tronqués, états vides, textes ambigus et actions sans retour visible.
- Noter le premier moment où une hésitation dure plus de dix secondes.

Verdict attendu : la fonction du produit et le prochain geste sont compréhensibles immédiatement.

## Campagne B — Dossier fictif de bout en bout

Créer un dossier intégralement fictif avec :

- établissement et mission fictifs ;
- plusieurs observations ;
- au moins une preuve ou un média fictif ;
- une donnée manquante explicitement conservée ;
- une hypothèse ;
- une recommandation ;
- une décision humaine distincte ;
- une action avec responsable et échéance fictifs.

Contrôler ensuite :

- sauvegarde ;
- fermeture ;
- rechargement de la page ;
- reprise du dossier ;
- absence de duplication ;
- absence de perte silencieuse ;
- cohérence des informations dans le Cockpit ;
- cohérence du Report V3.

## Campagne C — Six cas professionnels EKI

Tester successivement :

1. **ATEX** — dossier documenté mais intervention non automatiquement autorisée.
2. **EHPAD / manutention** — données structurantes absentes, conclusion conditionnelle.
3. **Conflit chimique** — sources contradictoires non aplaties en faux consensus.
4. **Site occupé** — risques imbriqués, outils sélectionnés ou écartés avec justification.
5. **Logistique automatisée** — expertises compétentes mais recommandations incompatibles.
6. **Électricité** — habilitation présente mais maîtrise complète non présumée.

Pour chaque cas, vérifier :

- singularité du contexte ;
- valeur EKI perceptible ;
- expertises mobilisées et non mobilisées ;
- outils justifiés ;
- faits, preuves et recommandations distincts ;
- limites visibles ;
- autorité humaine explicite ;
- même vérité dans le parcours, le Cockpit et le rapport.

## Campagne D — Robustesse et persistance

- Recharger pendant un parcours.
- Fermer puis rouvrir le navigateur.
- Tester plusieurs onglets sans modifier simultanément le même dossier.
- Exporter un dossier.
- Réinitialiser l’environnement.
- Réimporter le dossier exporté.
- Vérifier que l’import ne crée pas une seconde vérité incohérente.
- Tester sans connexion après un premier chargement complet lorsque le navigateur le permet.

## Campagne E — Rapport et restitution

- Générer le rapport avec un dossier suffisamment rempli.
- Vérifier la hiérarchie des titres, les sauts de page et la lisibilité.
- Contrôler l’absence d’enfilade de captures d’écran.
- Vérifier les références, limites, réserves et validations humaines.
- Tester l’impression ou l’enregistrement PDF en A4.
- Vérifier qu’aucune donnée absente n’est transformée en certitude.

## Campagne F — Appareils et affichage

Tester au minimum :

- ordinateur, fenêtre large ;
- ordinateur, fenêtre étroite ;
- smartphone en portrait ;
- smartphone en paysage ;
- thème clair ;
- thème sombre ;
- zoom navigateur à 125 % ou taille de police augmentée.

Chercher particulièrement :

- textes ou boutons tronqués ;
- débordements horizontaux ;
- éléments inaccessibles ;
- contraste insuffisant ;
- bascule de thème non persistante ;
- état clair/sombre incorrect après fermeture et réouverture.

## Campagne G — Test adverse cognitif

Construire volontairement des situations où :

- une donnée essentielle manque ;
- deux sources se contredisent ;
- une preuve soutient un fait sans créer un nouveau fait ;
- une recommandation ne vaut pas décision ;
- une référence générale n’est pas automatiquement applicable au dossier ;
- plusieurs expertises proposent des mesures incompatibles.

Verdict attendu : Falcon rend le problème plus lisible sans inventer la solution ni retirer l’autorité à l’utilisateur.

## Classification des constats

- **Bloquant** : perte de données, impossibilité de poursuivre, décision automatique, divergence métier entre écrans ou rapport inutilisable.
- **Majeur** : compréhension compromise, valeur EKI non perceptible, rendu professionnel insuffisant, action essentielle cachée ou ambiguë.
- **Mineur** : défaut de forme réel mais sans rupture du parcours.
- **Suggestion** : amélioration utile qui ne corrige pas une faiblesse actuelle.

## Format de remontée recommandé

Pour chaque constat :

- appareil et navigateur ;
- portrait ou paysage ;
- thème ;
- étape du protocole ;
- résultat attendu ;
- résultat observé ;
- capture d’écran si utile ;
- reproductibilité : toujours, parfois ou une seule fois ;
- sévérité proposée.

## Critère de réussite

Falcon réussit l’Owner Trial lorsque l’utilisateur peut, sans explication compensatoire :

- comprendre ce que fait le produit ;
- créer, analyser, sauvegarder et reprendre un dossier ;
- percevoir la valeur des six cas EKI ;
- distinguer faits, preuves, hypothèses, recommandations et décisions ;
- produire une restitution crédible et défendable ;
- conserver son autorité finale.
