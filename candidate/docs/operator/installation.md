# Installation — Falcon Enterprise RC

1. Vérifier l’intégrité du package et la correspondance avec `release/release-manifest.json`.
2. Vérifier que le profil d’environnement sélectionné est `production`.
3. Vérifier que `demoMode` est désactivé.
4. Déployer les fichiers dans un répertoire dédié, sans écraser une installation active.
5. Exécuter le Falcon Engineering Gate du package source.
6. Démarrer Falcon via la séquence de bootstrap gouvernée.
7. Vérifier l’état `ready`, les diagnostics et la disponibilité de la Persistence.
8. Consigner l’opérateur, la date, la version et le résultat.

Aucune donnée utilisateur ne doit être copiée, supprimée ou restaurée implicitement pendant l’installation.
