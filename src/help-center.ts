// Content for the Help Center modal (#help-center-modal in index.html).
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
      <ol>
        <li>Cliquez sur le bouton bleu <strong>+ Nouvelle activité</strong> en haut à droite du journal.</li>
        <li>Saisissez le nom de l'activité, puis cliquez sur <strong>Créer</strong>.</li>
        <li>
          Le formulaire s'ouvre :
          <ul>
            <li><strong>Étape 1 (Formulaire)</strong> : Permet de lier le document PDF papier pour référence.</li>
            <li>
              <strong>Étape 2 (Soumission)</strong> : Saisissez le nom du client et ajoutez les réservations de salles en
              indiquant les dates, heures, tarifs et personnel requis.
            </li>
            <li>
              <strong>Étape 3 (Planification)</strong> : Suivez les tâches à faire (les tâches se génèrent d'elles-mêmes selon les
              salles réservées).
            </li>
            <li>
              <strong>Étape 4 (Facturation)</strong> : Une fois l'activité terminée, ajoutez la ventilation des comptes comptables
              (distributions).
            </li>
          </ul>
        </li>
        <li>
          Tout s'enregistre automatiquement dès que vous saisissez ou modifiez un champ. Vous pouvez fermer l'activité en toute
          sécurité.
        </li>
      </ol>
    `,
  },
  {
    icon: "⚖️",
    title: "Faire le rapprochement bancaire (Grand Livre GL)",
    contentHtml: `
      <p>
        Cette étape sert à s'assurer que les montants saisis dans l'application correspondent bien aux écritures comptables
        officielles du Cégep (le Grand Livre).
      </p>
      <ol>
        <li>Rendez-vous dans la section <strong>Rapprochement GL</strong> dans la barre latérale.</li>
        <li>Glissez-déposez le fichier Excel du Grand Livre extrait du système financier dans la zone prévue.</li>
        <li>
          L'application associe automatiquement les écritures. Regardez les pastilles de couleur :
          <ul>
            <li><span class="badge badge-success">Conforme</span> : Tout correspond. Aucune action requise.</li>
            <li>
              <span class="badge badge-danger">Écart de montant</span> : L'activité existe, mais les montants diffèrent. Vous
              pouvez cliquer sur <em>Valider</em> pour forcer la conformité ou corriger le montant dans l'onglet Facturation de
              l'activité.
            </li>
            <li>
              <span class="badge badge-warning">Non dans GL</span> : L'activité est saisie mais n'apparait pas encore dans la
              comptabilité officielle.
            </li>
            <li>
              <span class="badge badge-info">Non saisis</span> : Écriture présente dans le Grand Livre mais absente de
              l'application. Cliquez sur <strong>+ Créer activité</strong> à droite de la ligne pour l'ajouter en un clic.
            </li>
          </ul>
        </li>
      </ol>
    `,
  },
  {
    icon: "💾",
    title: "Sauvegarder et sécuriser mes données",
    contentHtml: `
      <p>Pour éviter de perdre vos données si votre ordinateur a un problème, configurez la sauvegarde automatique :</p>
      <ol>
        <li>Allez dans l'onglet <strong>Configuration</strong>.</li>
        <li>
          Dans la section <em>Sauvegarde automatique</em>, cliquez sur
          <strong>Choisir un fichier de sauvegarde automatique</strong>.
        </li>
        <li>
          Créez ou sélectionnez un fichier vide (ex: <code>sauvegarde_outil_marie.json</code>) sur votre bureau ou vos documents.
        </li>
        <li>
          <strong>Important</strong> : De temps en temps, le navigateur vous affichera une bannière jaune indiquant que la
          sauvegarde a expiré. C'est une sécurité standard de Chrome. Cliquez simplement sur le bouton
          <strong>Réactiver</strong> dans la bannière pour autoriser à nouveau l'écriture.
        </li>
      </ol>
    `,
  },
  {
    icon: "❓",
    title: "Glossaire des termes financiers",
    contentHtml: `
      <ul>
        <li>
          <strong>Poste budgétaire / Code GL</strong> : C'est le numéro de compte de comptabilité générale (ex : 4100 pour des
          locations de salles, 4200 pour du personnel).
        </li>
        <li>
          <strong>RI / Facture Réf.</strong> : C'est le numéro de référence unique de l'encaissement ou de la facture du Cégep
          (permettant d'associer la saisie au Grand Livre).
        </li>
        <li><strong>COBA</strong> : Système du cégep où sont enregistrées les réservations scolaires officielles.</li>
      </ul>
    `,
  },
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
