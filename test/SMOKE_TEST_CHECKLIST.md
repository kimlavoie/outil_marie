# Checklist de smoke-test manuel

À rejouer après **chaque** étape de la migration Vite/React/TS (voir
TODO.txt), avant de merger sur main. But : détecter toute régression
visuelle ou fonctionnelle qu'aucun test automatisé ne couvre.

Raccourcis clavier des vues : Alt+1 à Alt+6.

## 1. Tableau de bord (Alt+1)
- [ ] La vue se charge sans erreur console.
- [ ] Les graphiques (Chart.js) s'affichent avec des données cohérentes.
- [ ] Les statistiques/chiffres résumés correspondent aux données réelles.

## 2. Activités (Alt+2)
- [ ] La liste des activités s'affiche, tri/filtre fonctionne.
- [ ] Créer une nouvelle activité (formulaire complet) et la sauvegarder.
- [ ] Modifier une activité existante, vérifier la persistance après reload.
- [ ] Réservations : créer une réservation, vérifier la détection de
      conflit de réservation.
- [ ] Volet financier de l'activité : montants calculés corrects.
- [ ] Historique de l'activité affiché correctement.
- [ ] Liens de fichiers : ajouter/ouvrir/retirer un lien de fichier.
- [ ] Calendrier intégré (jour/semaine/mois) navigue et affiche les
      activités aux bonnes dates.
- [ ] Datepicker s'ouvre, sélectionne une date, se ferme correctement.

## 3. Rapprochement GL (Alt+3)
- [ ] Import du grand livre (overlay de chargement visible pendant
      l'import).
- [ ] Le rapprochement fuzzy propose des correspondances plausibles.
- [ ] Accepter/rejeter une correspondance, vérifier la persistance des
      décisions après reload.
- [ ] Undo/Redo fonctionne sur les décisions de rapprochement.
- [ ] Export Excel du rapprochement (overlay de chargement visible).
- [ ] Export PDF (overlay de chargement visible).

## 4. Rapport de compte (Alt+4)
- [ ] Sélection d'un compte, la vue affiche les données attendues.

## 5. Paramètres (Alt+5)
- [ ] Modifier un paramètre (ex. config par défaut) et vérifier la
      persistance.

## 6. Sauvegarde (Alt+6)
- [ ] Export d'une sauvegarde complète.
- [ ] Import/restauration d'une sauvegarde, vérifier l'intégrité des
      données après restauration.
- [ ] Sauvegarde automatique (auto-backup db) toujours déclenchée.

## Transversal
- [ ] Recherche globale (fuzzy) retourne des résultats pertinents depuis
      n'importe quelle vue.
- [ ] Toasts non intrusifs s'affichent pour les actions (succès/erreur)
      sans bloquer l'interface.
- [ ] Modales/tiroirs : navigation clavier, focus trap, fermeture par
      Échap fonctionnent (accessibilité : role="dialog"/aria-modal).
- [ ] Thème (data-theme sur <html>) s'affiche correctement.
- [ ] Aucune erreur dans la console du navigateur sur l'ensemble du
      parcours ci-dessus.
- [ ] `npm test` — tous les tests passent.
