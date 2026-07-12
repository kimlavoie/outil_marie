# Outil Marie

Outil de gestion des activités, de la facturation et du rapprochement comptable.

L'application fonctionne entièrement dans le navigateur : toutes les données
(salles, personnel, tarifs, activités, réservations) sont conservées sur
l'ordinateur (IndexedDB), sans serveur ni compte à créer.

## Démarrage

1. Ouvrir l'application dans un navigateur **Chrome** ou **Edge** (voir la
   section [Sauvegarde automatique](#sauvegarde-automatique-et-restauration)
   ci-dessous — cette fonctionnalité ne fonctionne que sur ces navigateurs).
2. Les six sections principales sont accessibles depuis le menu de gauche ou
   avec les raccourcis clavier **Alt+1** à **Alt+6** :

   | Raccourci | Section              |
   | --------- | --------------------- |
   | Alt+1     | Tableau de bord       |
   | Alt+2     | Journal des activités |
   | Alt+3     | Rapprochement GL      |
   | Alt+4     | Rapport de compte     |
   | Alt+5     | Configuration         |
   | Alt+6     | Sauvegarde            |

## Configuration initiale

Avant de créer des activités, il faut configurer les données de base dans
**Configuration** (Alt+5) :

- **Salles** : les espaces qui peuvent être réservés, avec leurs salles
  liées (réservées automatiquement avec la salle principale), le personnel
  et les frais associés.
- **Personnel** (salaires) : les postes et leurs taux horaires.
- **Services** : les prestations offertes et leurs tarifs.
- **Comptes** : le plan de comptes du grand livre utilisé pour la
  facturation et le rapprochement.
- **Taxes** : les taux de taxes applicables.

Les tarifs (salles, personnel, services) supportent un historique de taux
daté : on peut ajouter une nouvelle version de tarif avec une date d'entrée
en vigueur, sans perdre les taux précédents (utile pour les activités déjà
passées).

## Sauvegarde automatique et restauration

L'application utilise la **File System Access API** du navigateur pour
sauvegarder automatiquement les données dans un fichier choisi par
l'utilisatrice. Cette API n'est disponible que sur **Chrome** et **Edge**
(pas sur Firefox ni Safari).

Dans la section **Sauvegarde** (Alt+6) :

1. Cliquer sur le bouton de connexion du fichier de sauvegarde automatique
   et choisir (ou créer) un fichier, par exemple
   `compta_marie_autosave.json`, sur un support fiable (disque local,
   OneDrive, clé USB, etc.).
2. Une fois connecté, l'application réécrit ce fichier automatiquement à
   chaque modification importante des données. Il n'y a rien d'autre à
   faire.
3. Il est recommandé de garder ce fichier sur un emplacement synchronisé
   (OneDrive, Google Drive, etc.) pour se protéger d'une panne de
   l'ordinateur.

### Restaurer une sauvegarde

En cas de problème (données corrompues, mauvaise manipulation, changement
d'ordinateur) :

1. Ouvrir l'application sur l'ordinateur où elle doit être restaurée.
2. Aller dans **Sauvegarde** (Alt+6).
3. Utiliser l'option de restauration à partir d'un fichier et sélectionner
   le fichier de sauvegarde (`compta_marie_autosave.json` ou un export
   manuel précédent).
4. Vérifier que les données affichées (salles, activités, personnel)
   correspondent à ce qui est attendu avant de continuer à travailler.

Il est aussi possible d'exporter manuellement les données en Excel depuis
cette section, pour un archivage ponctuel indépendant de la sauvegarde
automatique.

### Si le navigateur n'est pas supporté

Si l'application signale que la sauvegarde automatique n'est pas
disponible, c'est que le navigateur utilisé (Firefox, Safari) ne supporte
pas la File System Access API. Utiliser Chrome ou Edge pour bénéficier de
la sauvegarde automatique ; l'export manuel en Excel reste disponible dans
tous les cas comme filet de sécurité.

## Développement

```bash
npm install
npm run dev        # serveur de développement
npm run build       # build de production
npm test             # suite de tests
npm run test:coverage # couverture de tests
npm run typecheck    # vérification des types
npm run lint          # analyse statique
```

Voir [test/SMOKE_TEST_CHECKLIST.md](test/SMOKE_TEST_CHECKLIST.md) pour la
liste de vérifications manuelles à effectuer avant de fusionner sur `main`.
