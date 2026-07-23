# Contrat de langage produit Falcon

## Objet

Empêcher l’exposition, dans les surfaces utilisateur et testeur, de vocabulaire interne de chantier ou d’indicateurs décoratifs non contextualisés.

## Vocabulaire interdit dans l’interface livrée

Les références suivantes relèvent exclusivement de la gouvernance de développement et ne doivent pas être visibles dans le produit :

- Sprint ;
- Sprint 5 ;
- S5 ;
- EI-16 et ses variantes de lot.

Elles doivent être supprimées ou remplacées par un vocabulaire métier utile.

## Indicateurs chiffrés

Un indicateur ne peut être conservé que si l’interface permet d’identifier clairement :

- sa définition ;
- sa source ;
- sa période ;
- son périmètre ;
- sa méthode de calcul.

Les valeurs historiques `94 %`, `18 actions`, `6 risques` et `+12 %` sont interdites lorsqu’elles sont utilisées comme KPI décoratifs ou ambigus.

## Preuve automatisée

Le test `tests/product-language-contract-smoke.mjs` inspecte les fichiers produit livrés et échoue lorsqu’un terme interne ou un KPI ambigu connu est détecté.

Le workflow `Product Language Contract` exécute ce contrôle sur chaque Pull Request vers `main` et après chaque push sur `main`.

Une réussite du contrôle constitue une preuve technique de non-régression. Elle ne remplace pas la revue visuelle PC et mobile exigée dans l’Issue #196.
