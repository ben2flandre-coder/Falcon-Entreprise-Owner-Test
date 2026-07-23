# Mise à jour — Falcon Enterprise RC

1. Identifier la version active et la version cible.
2. Créer une sauvegarde contrôlée de l’état courant.
3. Vérifier l’intégrité, la compatibilité et le manifeste du package cible.
4. Arrêter proprement Falcon et libérer les ressources.
5. Déployer la version cible dans un répertoire distinct.
6. Appliquer uniquement les migrations explicitement documentées.
7. Démarrer la version cible et contrôler l’état `ready`.
8. Vérifier les diagnostics, les contrats publics et l’accès aux dossiers existants.
9. Promouvoir la version uniquement après validation opérateur.

En cas d’échec, ne pas masquer l’erreur et appliquer la procédure de retour arrière.
