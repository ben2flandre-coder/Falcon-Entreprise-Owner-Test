# Falcon Enterprise V1 — Modèle de signalement

Copiez ce modèle dans une issue ou un dossier de suivi autorisé. Ne joignez aucune donnée client réelle, clé, secret ou information personnelle.

## Titre

`[EI-16.3][gravité][zone] résumé factuel`

## Contexte obligatoire

- Date et heure :
- Opérateur :
- Version Falcon :
- SHA source du `release-manifest.json` :
- Empreinte du paquet :
- Système d'exploitation :
- Navigateur et version :
- Profil Falcon actif :
- Mode : vierge ou démonstration :
- Mission / session / dossier fictifs concernés :

## Classification

Gravité :

- `blocking` : démarrage impossible, risque d'intégrité, restauration impossible ou événement de sécurité critique ;
- `major` : flux critique inutilisable sans solution de contournement sûre ;
- `minor` : défaut circonscrit avec contournement sûr ;
- `feedback` : amélioration de compréhension ou d'ergonomie.

Zone : installation, démarrage, mission, session, dossier, observation, média, criticité, Radar, Trust, Cockpit, rapport, export, sauvegarde, restauration, rôles, licence ou documentation.

## Reproduction

### Préconditions

Décrivez l'état initial et la provenance des données fictives.

### Étapes exactes

1. 
2. 
3. 

### Résultat attendu

Décrivez le comportement attendu de façon observable.

### Résultat obtenu

Décrivez le comportement constaté sans interprétation non prouvée.

### Fréquence

Première occurrence, systématique, intermittente ou non reproductible.

## Impact et protection appliquée

- Impact sur le travail :
- État des données avant et après :
- Écritures stoppées : oui / non / sans objet :
- Sauvegarde de sécurité créée : oui / non / impossible :
- Retour arrière déclenché : oui / non :
- Contournement essayé et résultat :

## Preuves

- diagnostic exporté et expurgé ;
- captures sans données sensibles ;
- heure précise et étapes ;
- noms, tailles et empreintes des exports concernés ;
- message utilisateur exact ;
- logs autorisés ;
- identifiant du scénario du protocole terrain.

N'incluez pas de secret, clé, jeton, fichier de licence, donnée client ou archive de sauvegarde réelle. Fournissez une reproduction minimale avec données fictives.

## Analyse et recommandation

- Cause supposée, clairement marquée comme hypothèse :
- Régression connue : oui / non / inconnu :
- Risque d'intégrité ou de sécurité :
- Recommandation : corriger avant reprise, corriger puis rejouer, amélioration V1 ou post-V1 :
- Critère de vérification du correctif :

## Clôture

- Correctif / PR :
- SHA qualifié :
- Tests rejoués :
- Preuves CI :
- Verdict de non-régression :
- Date et responsable de clôture :

