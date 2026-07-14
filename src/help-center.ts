// Kept as data here instead of inline HTML to keep index.html small.

interface HelpSection {
  icon: string;
  title: string;
  contentHtml: string;
  open?: boolean;
}

const HELP_SECTIONS: HelpSection[] = [
  {
    icon: "➕",
    title: "Créer et remplir une activité",
    open: true,
    contentHtml: `
      <p>Pour gérer un événement ou une réservation, suivez ces étapes :</p>
      <ol>
        <li>Cliquez sur le bouton bleu <strong>+ Nouvelle activité</strong> en haut à droite du journal.</li>
        <li>Saisissez le nom de l'activité, puis cliquez sur <strong>Créer</strong>.</li>
        <li>
          Le tiroir de détails s'ouvre sur le côté avec 6 onglets thématiques :
          <ul>
            <li><strong>Formulaire</strong> : Associez ou visualisez des documents PDF ou Excel de référence (ex: contrat, devis) directement dans l'application.</li>
            <li><strong>Soumission</strong> : Saisissez les informations du client (nom, type de client) et ajoutez les réservations de salles (dates, heures, tarifs et personnel de régie/conciergerie requis).</li>
            <li><strong>Planification</strong> : Suivez la liste des tâches à accomplir. Certaines tâches standards sont générées automatiquement en fonction des salles réservées.</li>
            <li><strong>Facturation</strong> : Ventilez les revenus dans les comptes du Grand Livre (distributions) et suivez le statut de la facturation.</li>
            <li><strong>Historique</strong> : Consultez les versions enregistrées pour cette activité et restaurez une ancienne version en un clic si nécessaire.</li>
            <li><strong>Notes</strong> : Rédigez des remarques ou des détails particuliers concernant l'activité.</li>
          </ul>
        </li>
        <li>
          Toutes vos modifications sont enregistrées automatiquement en temps réel. Vous pouvez fermer le tiroir à tout moment sans perte de données.
        </li>
      </ol>
      <p style="margin-top: 12px; padding: 10px; background: var(--bg-main); border-left: 3px solid var(--primary); border-radius: var(--radius-sm); font-size: 0.82rem;">
        💡 <strong>Action cachée — Menu contextuel (Clic droit) :</strong> 
        Faites un clic droit sur n'importe quelle ligne d'activité du journal des activités pour ouvrir un menu d'actions rapides : 
        <em>Ajouter/Retirer des accès rapides (favoris)</em>, <em>Ouvrir dans un nouvel onglet</em>, <em>Voir les détails</em>, <em>Dupliquer</em> ou <em>Supprimer</em>.
      </p>
    `
  },
  {
    icon: "⚖️",
    title: "Faire le rapprochement bancaire (Grand Livre GL)",
    contentHtml: `
      <p>
        Cette section permet de comparer les montants saisis dans l'application avec les écritures comptables officielles du Cégep (le Grand Livre externe) pour détecter les anomalies ou les oublis.
      </p>
      <ol>
        <li>Rendez-vous dans la section <strong>Rapprochement GL</strong> dans le menu de gauche.</li>
        <li>Glissez-déposez le fichier Excel d'extrait du Grand Livre dans la zone de dépôt.</li>
        <li>
          L'application associe automatiquement les écritures selon le numéro de référence unique (ex: RI ou Facture Réf).
        </li>
        <li>
          Vérifiez l'état de conformité grâce aux pastilles de couleur :
          <ul>
            <li><span class="badge badge-success">Conforme</span> : Les montants et les références correspondent parfaitement.</li>
            <li>
              <span class="badge badge-danger">Écart de montant</span> : L'activité existe dans l'application, mais le montant diffère de la ligne comptable. Vous pouvez corriger la facturation de l'activité ou forcer la validation en cliquant sur <em>Valider</em>.
            </li>
            <li>
              <span class="badge badge-warning">Manquant dans le GL</span> : L'activité est saisie dans l'application, mais n'apparaît pas encore dans l'extrait du Grand Livre comptable.
            </li>
            <li>
              <span class="badge badge-info">Manquant dans l'App</span> : L'écriture est enregistrée au Grand Livre, mais n'existe pas dans l'application. Cliquez sur <strong>+ Créer activité</strong> à droite de la ligne pour l'ajouter automatiquement.
            </li>
          </ul>
        </li>
      </ol>
    `
  },
  {
    icon: "📊",
    title: "Interpréter le Tableau de bord et les rapports",
    contentHtml: `
      <p>Le <strong>Tableau de bord</strong> présente des statistiques et des graphiques basés sur les activités de la période sélectionnée :</p>
      <ul>
        <li><strong>Revenus réels</strong> : Le montant total facturé aux clients (somme des distributions comptables).</li>
        <li>
          <strong>Valorisation gratuité interne</strong> : La valeur théorique (aux tarifs réguliers) des salles prêtées gratuitement à des départements internes (client de type <em>interne</em> et revenu à 0 $). Cela permet de quantifier la contribution de votre service au Cégep.
        </li>
        <li><strong>Activités</strong> : Le nombre total d'activités non supprimées sur la période.</li>
        <li><strong>Taux de rapprochement</strong> : Le pourcentage d'activités de la période qui ont été rapprochées avec succès et marquées comme conformes.</li>
        <li><strong>Graphiques visuels</strong> : Visualisez la répartition des revenus réels par trimestre ou la part des revenus générés par chaque salle.</li>
        <li><strong>Statistiques d'employés</strong> : Utilisez la barre de recherche des employés en bas de page pour consulter le cumul des heures régulières, des heures supplémentaires et du coût salarial total par employé pour l'année.</li>
      </ul>
      <p>💡 <em>Astuce :</em> Utilisez le sélecteur de période en haut de l'écran pour filtrer les statistiques par année financière et par trimestres (T1 à T4).</p>
    `
  },
  {
    icon: "⚙️",
    title: "Configurer l'application (Salles, Salaires & Grilles)",
    contentHtml: `
      <p>Avant de planifier des activités, définissez vos paramètres dans la section <strong>Configuration</strong> :</p>
      <ul>
        <li><strong>Salles</strong> : Configurez les espaces louables, liez des salles secondaires (qui se réservent automatiquement avec la salle principale), et définissez le personnel ou les frais requis par défaut.</li>
        <li><strong>Personnel (Salaires)</strong> : Indiquez les postes et leurs taux horaires (régulier et supplémentaire). Le système supporte un historique de taux daté pour préserver les calculs des activités passées lors d'une hausse salariale.</li>
        <li><strong>Services</strong> : Listez les services connexes offerts (ex: stationnement, café) et leurs tarifs par défaut.</li>
        <li><strong>Comptes</strong> : Créez votre plan de comptes (codes GL) nécessaires pour ventiler les factures.</li>
        <li><strong>Taxes</strong> : Éditez les taxes de vente applicables (TPS, TVQ) et gérez l'option de dispense de taxe ("Non taxable").</li>
        <li>
          <strong>Grille tarifaire (Matrix)</strong> :
          Pour chaque salle, associez des configurations de salle (lignes de la matrice) et des types de client (colonnes de la matrice) pour générer automatiquement une grille de prix journaliers. Vous pouvez y ajouter des dates d'effet pour changer les tarifs dans le temps. S'il n'y a pas de cas particulier, créez une configuration simple nommée "Standard".
        </li>
      </ul>
    `
  },
  {
    icon: "💾",
    title: "Sauvegarder, restaurer et exporter mes données",
    contentHtml: `
      <p>L'application conserve toutes vos données localement sur votre ordinateur (dans IndexedDB) pour plus de sécurité et de confidentialité.</p>
      <p><strong>Sauvegarde automatique (Recommandé) :</strong></p>
      <ol>
        <li>Rendez-vous dans la section <strong>Sauvegarde & Exportations</strong>.</li>
        <li>Cliquez sur le bouton de connexion de la sauvegarde automatique.</li>
        <li>Choisissez ou créez un fichier JSON (ex: <code>sauvegarde_marie.json</code>) dans un répertoire synchronisé (comme OneDrive ou Google Drive).</li>
        <li>L'application mettra à jour ce fichier en tâche de fond à chaque modification.</li>
        <li>Si le navigateur demande de réactiver l'autorisation d'écriture (sécurité standard Chrome/Edge après inactivité), cliquez simplement sur <strong>Réactiver</strong> dans la bannière jaune en haut.</li>
      </ol>
      <p><strong>Restaurer mes données :</strong></p>
      <p>En cas de changement d'ordinateur ou de suppression d'historique de navigateur, retournez dans <strong>Sauvegarde & Exportations</strong>, cliquez sur "Restaurer" et sélectionnez votre fichier JSON sauvegardé pour retrouver toutes vos données.</p>
      <p><strong>Exportation Excel :</strong> Vous pouvez également faire un export Excel complet de vos données à des fins d'archivage ou d'analyse externe.</p>
    `
  },
  {
    icon: "⌨️",
    title: "Navigation rapide & Raccourcis clavier",
    contentHtml: `
      <p>Naviguez instantanément dans l'application avec ces raccourcis clavier :</p>
      <table>
        <thead>
          <tr>
            <th>Raccourci</th>
            <th>Section</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Alt + 1</code></td>
            <td>Tableau de bord (Statistiques & Graphiques)</td>
          </tr>
          <tr>
            <td><code>Alt + 2</code></td>
            <td>Journal des activités (Recherche, Calendrier, Table)</td>
          </tr>
          <tr>
            <td><code>Alt + 3</code></td>
            <td>Rapprochement GL (Rapprochement bancaire Excel)</td>
          </tr>
          <tr>
            <td><code>Alt + 4</code></td>
            <td>Grand Livre local (Ventilations comptables de l'application)</td>
          </tr>
          <tr>
            <td><code>Alt + 5</code></td>
            <td>Configuration (Salles, Salaires, Comptes, Tarifs)</td>
          </tr>
          <tr>
            <td><code>Alt + 6</code></td>
            <td>Sauvegarde & Exportations (Sécurité & Fichiers)</td>
          </tr>
        </tbody>
      </table>
      <p>💡 <em>Astuce navigation :</em> Utilisez le bouton de bascule de thème en bas à gauche pour passer du mode Clair au mode Sombre selon votre confort visuel.</p>
    `
  },
  {
    icon: "❓",
    title: "Glossaire des termes financiers et systèmes",
    contentHtml: `
      <ul>
        <li>
          <strong>Poste budgétaire / Code GL</strong> : C'est le numéro de compte comptable général (ex : 4100 pour locations de salles, 4200 pour personnel) servant à ventiler les revenus.
        </li>
        <li>
          <strong>RI / Facture Réf.</strong> : C'est le numéro de référence unique de l'encaissement ou de la facture émise par le Cégep, utilisé comme clé de rapprochement avec le Grand Livre.
        </li>
        <li><strong>Grand Livre (GL)</strong> : Registre comptable officiel externe du Cégep qui recense toutes les écritures financières.</li>
        <li><strong>COBA</strong> : Système de gestion du cégep où sont enregistrées les réservations scolaires officielles.</li>
      </ul>
    `
  }
];

export function renderHelpCenter(): void {
  const container = document.getElementById("help-center-content");
  if (!container) return;

  const sectionsHtml = HELP_SECTIONS.map(
    section => `
      <details class="help-section" ${section.open ? "open" : ""}>
        <summary class="help-section-summary">
          <span>${section.icon}</span>
          <strong>${section.title}</strong>
        </summary>
        <div class="help-section-content">${section.contentHtml}</div>
      </details>
    `
  ).join("");

  container.innerHTML = `
    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0; margin-bottom: 20px">
      Bienvenue dans votre guide d'aide. Ce centre est conçu pour vous expliquer simplement comment utiliser l'application au
      quotidien.
    </p>
    <div style="display: flex; flex-direction: column; gap: 16px">${sectionsHtml}</div>
  `;
}
