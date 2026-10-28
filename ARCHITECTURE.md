# Architecture

Ce document complète le [README.md](README.md) (usage) avec une vue
développeur : où vivent les données, comment l'app est structurée, et où en
est la migration vers React. Il sert de point de départ pour le transfert du
projet à l'équipe étudiante (version en ligne avec Firebase).

## 1. Couche de données (`src/state/`)

Toutes les données persistantes de l'app tiennent dans **un seul objet**,
`appState` ([store.ts](src/state/store.ts)) :

```
appState = {
  settings: { rooms, salaries, services, accounts, departments,
              global_tasks, schedulable_tasks, tax_rates, theme,
              last_backup_date, backup_reminder_days },
  activities: Activity[],
  favorites: string[],
  selected_year, selected_quarters
}
```

- `appState` est exporté comme un `let` mutable ; toute mutation est suivie
  d'un appel à `notifyAppStateChange()` (ou passe par `saveDatabase()` /
  `saveDatabaseOrRollback()` dans [state.ts](src/state/state.ts), qui le fait
  pour vous). `useAppState()` est le hook React qui s'abonne à ces
  changements (`useSyncExternalStore`).
- La persistance physique se fait entièrement dans
  [db.ts](src/state/db.ts) : tout l'objet `appState` est sérialisé et
  rangé dans IndexedDB sous une seule clé (`getAppStateFromDb` /
  `saveAppStateToDb`). Quelques stores IndexedDB séparés existent pour des
  données qui ne doivent pas être écrasées par une restauration JSON
  (historique de versions d'activité, décisions de rapprochement,
  sauvegardes de sécurité automatiques).
- **Accès aux données** : plutôt que de lire/écrire `appState.activities`
  ou `appState.settings.xxx` directement, le code passe par deux
  "repositories" :
  - [activities-repository.ts](src/state/activities-repository.ts) — seul
    point d'accès à `appState.activities` (get/add/update/replace/remove).
  - [settings-repository.ts](src/state/settings-repository.ts) — même rôle
    pour chaque sous-collection de `appState.settings` (salles, salaires,
    services, comptes, départements, tâches, taux de taxes, thème, dates de
    sauvegarde...).

  Ce ne sont **pas** des couches d'abstraction génériques — ce sont de
  simples fonctions qui lisent/écrivent le même objet en mémoire. Mais parce
  que tout le reste du code passe par elles, **le jour où IndexedDB est
  remplacé par Firestore, les seuls fichiers à toucher sont `db.ts` (et la
  boucle de chargement/sauvegarde dans `state.ts`)** — aucun écran, aucun
  composant n'a besoin de changer.

  Quelques accès directs à `appState.activities`/`appState.settings`
  subsistent volontairement dans `state.ts` et
  `services/backup/restore.ts` : ce sont les points d'entrée du
  chargement initial, de la migration de schéma et de la restauration
  JSON complète — un accès "en bloc" à tout l'état, pas une lecture/écriture
  ponctuelle qu'un écran ferait.

### Pour l'équipe Firebase

Le remplacement d'IndexedDB par Firestore demandera presque certainement de
sortir d'un modèle "un seul blob" vers un document par activité, un document
(ou une collection) par type de paramètre, etc. — `CURRENT_SCHEMA_VERSION`
dans [store.ts](src/state/store.ts) existe déjà pour anticiper ça. Le travail
se concentrera sur :
1. Remplacer le contenu de `db.ts` (les fonctions `getAppStateFromDb` /
   `saveAppStateToDb` / etc.) par des appels Firestore.
2. Adapter `activities-repository.ts` / `settings-repository.ts` si le
   découpage en documents distincts change leur signature (ex. passer d'un
   `get()` synchrone à une lecture asynchrone/temps réel).
3. Ajouter l'authentification (actuellement `src/state/permissions.ts`
   simule un seul rôle "full_access" — pas de vrai login).

## 2. Migration React — ce qui est vivant, ce qui ne l'est pas

**Le code n'est pas entièrement React.** Le projet est en migration
progressive (vocabulaire déjà utilisé dans les commentaires du code :
"Phase 2" = module TS typé mais toujours DOM-vanille, "Phase 4" = conversion
en composant React) :

- `src/components/**/*.tsx` — vues/composants React (Dashboard, Activités
  (liste), Rapprochement GL, Configuration, Sauvegarde, Rapport de compte).
- `src/activities-dom/**/*.ts` — **toujours actif**, pas du code mort : c'est
  le tiroir (drawer) d'activité et son formulaire, encore en DOM-vanille
  (manipulation directe via `document.getElementById`). `ActivityDrawer.tsx`
  (React) n'enveloppe qu'une partie des champs (responsable, gestionnaire,
  infos générales, carte de réservation) et délègue le reste — onglets,
  historique, planification, facturation, pièces jointes — aux fonctions de
  `src/activities-dom/*.ts`.

  **Seule exception documentée** : le rendu de tableau dans
  [render.ts](src/activities-dom/render.ts) (`renderActivities()` et son appel
  DOM) est mort en production — remplacé par
  [ActivitiesView.tsx](src/components/activities/ActivitiesView.tsx) — mais
  ses exports (`ACTIVITY_STATES`, `getActivityStateLabel`,
  `getPlanningProgress`, `activitiesState`, etc.) restent utilisés partout.
  Ce fichier reste donc en place tel quel ; voir son commentaire d'en-tête
  pour le détail.

- `src/services/` — logique métier sans DOM (export Excel, génération de
  contrat, sauvegarde, rapprochement GL) : consommée aussi bien par le code
  React que par le code DOM-vanille.

**À retenir pour la suite** : ne pas supposer qu'un fichier dans
`src/activities-dom/` est mort simplement parce qu'il n'est pas un composant
`.tsx` — vérifier ses appelants avant de le modifier ou de le supprimer.

## 3. Carte des dossiers

```
src/
  activities-dom/        Tiroir/formulaire d'activité (DOM-vanille, voir §2)
    file-links/         Pièces jointes liées par dossier (File System Access API)
    file-preview/        Visionneuses (PDF, image, docx, eml, texte)
    history/             Undo/redo, conflits de salle, historique de versions
    reservations/        Créneaux, cartes de réservation, tarification
    supporting-docs/     Documents justificatifs
  components/        Composants React
    activities/          Vue liste + tiroir (partiel, voir §2)
    account-report/, backup/, layout/, modals/, settings/
  services/          Logique métier sans DOM
    backup/              Sauvegarde auto, restauration, diff, rappel
    contract-generator/  Génération du contrat Excel
  state/             Couche de données (voir §1)
  types/             Types partagés (Activity, ...)
  utils/             Fonctions utilitaires génériques
```

## 4. Fichiers volumineux repérés (non traités dans cette passe)

Ces fichiers mélangent plusieurs responsabilités et sont candidats à un
découpage (prochaine étape du refactoring, pas encore faite) :

| Fichier | Lignes | Découpage envisagé |
| --- | --- | --- |
| `components/activities/ActivityDrawer.tsx` | ~1160 | Un sous-composant par section de champs (responsable, gestionnaire, infos générales) |
| `services/backup/restore.ts` | ~1127 | Validation / migration / snapshot de sécurité / application, déjà des sections distinctes dans le fichier |
| `components/reconciliation-view.tsx` | ~1099 | Drop-zone + mapping de colonnes / tableau de résultats / modal de détail |
| `services/excel-export.ts` | ~1013 | Un module par feuille générée ("ACTIVITÉS", "SALLES"), sur le modèle de `services/contract-generator/` |
| `components/activities/ActivitiesView.tsx` | ~852 | — |
| `components/settings/pricing-grid-editor.tsx` | ~736 | Séparer état du formulaire et rendu du tableau |
| `components/modals/ExcelExportModal.tsx` | ~672 | — |

## 5. Tests

`npm test` lance tous les fichiers sous `test/` (un seul dossier plat, pas
de miroir de l'arborescence `src/`). `npm run typecheck` et `npm run lint`
complètent la vérification. Voir aussi
[test/SMOKE_TEST_CHECKLIST.md](test/SMOKE_TEST_CHECKLIST.md) pour la
checklist manuelle avant de fusionner sur `main`.
