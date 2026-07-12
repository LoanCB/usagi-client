# Instructions projet — usagi-client

## Gestionnaire de paquets

Ce projet utilise **pnpm** (jamais npm).

## Conventions de code

- **Commentaires** : rédiger les commentaires **en anglais**, utiles et concis. Éviter les commentaires verbeux ou inutiles (qui paraphrasent le code) ; n'écrire un commentaire que pour expliquer un _pourquoi_ non évident (invariant, contournement, décision).
- **Types** : placer les types dans leur propre fichier. Exception : les props d'un composant qui ne sont pas partagées restent dans le fichier du composant.

## Fin de tâche (obligatoire)

À la fin de **toute tâche** qui a modifié du code, avant d'annoncer que le travail est terminé :

1. **Lancer le skill `react-doctor`** et corriger **uniquement les diagnostics apparus à cause du travail en cours** (ne pas traiter les problèmes préexistants sans rapport avec la tâche).
   - Prérequis d'environnement : react-doctor plante sur son binding natif si l'environnement n'est pas préparé. Avant de le lancer : `nvm use 22.22.2` puis purger le cache npx (`rm -rf ~/.npm/_npx`).
2. **Lancer `pnpm run lint:fix`** pour corriger le formatage et les indentations (Biome).

Ces deux étapes font partie de la définition de « tâche terminée ».
