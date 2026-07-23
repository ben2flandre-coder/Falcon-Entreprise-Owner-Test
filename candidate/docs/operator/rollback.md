# Retour arrière — Falcon Enterprise RC

1. Qualifier l’échec et suspendre toute écriture.
2. Conserver les diagnostics et créer une sauvegarde de l’état dégradé si possible.
3. Arrêter proprement la version cible.
4. Réactiver la dernière version validée sans écraser son répertoire.
5. Restaurer une sauvegarde uniquement après validation d’intégrité et confirmation opérateur.
6. Démarrer la version précédente et contrôler l’état `ready`.
7. Vérifier les dossiers, la Persistence, les diagnostics et les capacités critiques.
8. Documenter la cause, les impacts, les actions et le résultat.

Aucun retour arrière ne doit supprimer silencieusement des données ni produire un faux succès.
