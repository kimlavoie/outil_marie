/**
 * contract-generator/static-content.ts - The contract's static, activity-independent text blocks
 * (supplier contact info, attestation lines, cancellation clause, and the "Clauses de location"
 * appendix), reproduced verbatim from CONTRAT.xlsx. Split out of contract-generator.ts (see that
 * file for why it stays a barrel re-exporting this alongside styles.ts/sheet-builder.ts/
 * sheet-xml.ts) since this is inert reference text with no logic of its own.
 */

// Static "Information du fournisseur" block (CONTRAT.xlsx E19:J24) — the Cégep's own contact
// info, constant across every contract.
const SUPPLIER = {
  org: "Cégep de Jonquière",
  responsable: "Marie-Ève Bouchard",
  address: "2505 rue Saint-Hubert, Jonquière, Québec, G7X 7W2",
  phone: "418-547-2191 poste 6232",
  email: "servicescommunautaires@cegepjonquiere.ca"
};

// Static attestation/initials lines (CONTRAT.xlsx A27:D29).
const ATTESTATIONS = [
  "Je confirme avoir envoyé une attestation d'assurance responsabilité civile",
  "Je confirme avoir pris connaissance des actions à faire en cas d'urgence, expliqué dans le lien suivant : https://www.cegepjonquiere.ca/situations-d-urgence.html"
];

// Static cancellation/payment clause (CONTRAT.xlsx C71), reproduced verbatim.
const CANCELLATION_CLAUSE =
  "Paiement anticipé\n" +
  "Un acompte équivalant à 50 % des coûts estimés est exigible 30 jours avant la date de l’évènement. À défaut de réception de ce paiement dans les délais, la réservation sera automatiquement annulée sans préavis.\n\n" +
  "Frais d’annulation\n" +
  "En cas d’annulation par le client, les frais suivants seront facturés en fonction de la date de notification écrite de l’annulation :\n" +
  "- 31 jours ouvrables et plus avant l'activité : 25% du montant total\n" +
  "- 30 jours ouvrables avant l'activité : 50 % du montant total \n" +
  "- 15 jours ouvrables ou moins avant l'activité : 100 % du montant total\n\n" +
  "Solde final\n" +
  "Le solde de la facture est payable sur réception, sauf entente contraire convenue par écrit entre les parties.";

// Static "Clauses de location" appendix (CONTRAT.xlsx A76:A133), reproduced verbatim.
const LOCATION_CLAUSE_GROUPS: { title: string; clauses: { num: number; body: string }[] }[] = [
  {
    title: "Communication et image",
    clauses: [
      {
        num: 1,
        body: "Le locataire n’est pas autorisé à utiliser l’image du Cégep de Jonquière à des fins publicitaires ou dans toute autre forme de communication."
      },
      {
        num: 2,
        body: "Le Cégep de Jonquière n’est en aucun cas affilié aux activités du locataire. Il est donc interdit d’utiliser son nom dans toute communication, qu’elle soit écrite ou verbale. Seuls le nom de la salle et l’adresse civique peuvent être mentionnés pour indiquer le lieu de l’activité."
      },
      {
        num: 3,
        body: "Une exception à la clause 2 s’applique uniquement aux projets réalisés en partenariat officiel avec le Cégep de Jonquière."
      }
    ]
  },
  {
    title: "Utilisation des lieux",
    clauses: [
      { num: 4, body: "Le locataire doit remettre les lieux loués dans le même état qu’à leur prise de possession." },
      {
        num: 5,
        body: "Le coût de la location inclut l’usage du local ainsi que du mobilier permanent qui s’y trouve. Toute demande d’équipement supplémentaire (ex. : matériel audiovisuel, mobilier additionnel, etc.) est à la charge du locataire et doit être approuvée par le Cégep de Jonquière."
      },
      {
        num: 6,
        body: "Toute utilisation non conforme à la demande de réservation ou au contrat, toute sous-location ou cession à un tiers peut entraîner l’annulation immédiate du contrat sans remboursement du dépôt, le cas échéant."
      },
      {
        num: 7,
        body: "En cas de force majeure, le Cégep de Jonquière peut mettre fin à la location sur simple avis au locataire. Dans une telle situation, un remboursement de l’acompte versé pourra être envisagé, selon l’évaluation du contexte et des frais déjà engagés."
      },
      {
        num: 8,
        body: "Le Cégep se réserve le droit d’annuler toute location qui pourrait nuire au bon déroulement des activités étudiantes."
      },
      { num: 9, body: "En cas d’intempéries, le locataire doit vérifier sur le site du Cégep si l’établissement est ouvert." }
    ]
  },
  {
    title: "Paiement et frais",
    clauses: [
      {
        num: 10,
        body: "Le locataire accepte de payer tous les frais additionnels liés à la location, y compris ceux non prévus au contrat initial. Les coûts présentés dans le présent contrat sont fournis à titre estimatif et pourront être ajustés en fonction des besoins réels et spécifiques de l’événement."
      },
      {
        num: 11,
        body: "Le Cégep de Jonquière peut résilier le contrat si les paiements ne sont pas effectués selon les modalités convenues."
      },
      { num: 12, body: "Des frais d’administration de 50 $ seront ajoutés pour tout chèque retourné pour provision insuffisante." },
      { num: 13, body: "Les factures sont payables dès leur réception." },
      {
        num: 14,
        body: "Les paiements doivent être effectués par carte ou par chèque. Les paiements en argent comptant ne sont pas acceptés."
      }
    ]
  },
  {
    title: "Responsabilités et assurances",
    clauses: [
      {
        num: 15,
        body: "Le locataire est responsable de tout dommage causé à la propriété ou à autrui par lui-même, ses représentants, les participants ou tout tiers, et s’engage à indemniser le Cégep de Jonquière en conséquence."
      },
      {
        num: 16,
        body: "Le locataire est responsable de tout dommage causé par lui-même, ses employés, agents, représentants ou sous-traitants pendant la durée du contrat, y compris en cas de manquement à ses engagements."
      },
      {
        num: 17,
        body: "Le locataire s’engage à indemniser et défendre le Cégep, ses dirigeants, employés et représentants contre toute réclamation ou poursuite liée à des dommages causés, incluant les infractions à la Loi sur la santé publique (chapitre S-2.2)."
      },
      { num: 18, body: "Le locataire doit fournir une attestation d’assurance au Cégep au moins 20 jours ouvrables avant l’activité." },
      {
        num: 19,
        body: "Le Cégep peut résilier le contrat si le comportement du locataire, de ses représentants ou des participants compromet la sécurité physique ou psychologique des personnes présentes, ou va à l’encontre des valeurs de l’établissement."
      }
    ]
  },
  {
    title: "Règlements et conformité",
    clauses: [
      {
        num: 20,
        body: "Le Cégep de Jonquière se réserve le droit de vérifier la nature de l’activité mentionnée dans la demande de location."
      },
      {
        num: 21,
        body: "Le Cégep peut émettre des directives aux locataires, qui sont tenus de les respecter. Par exemple, il peut exiger la tenue d’un registre des inscriptions et sa transmission."
      },
      {
        num: 22,
        body: "Le locataire s’engage à respecter les lois et règlements en vigueur (fédéraux, provinciaux et municipaux) et à obtenir tous les permis nécessaires à la tenue de son activité."
      },
      {
        num: 23,
        body: "Les politiques et règlements du Cégep doivent être respectés par le locataire, ses représentants, les participants et tout tiers impliqué. En cas de non-respect, le Cégep peut résilier le contrat sans préavis. Ces documents sont disponibles sur le site officiel : https://www.cegepjonquiere.ca/politiques-et-reglements.html"
      },
      {
        num: 24,
        body: "Toutes les mesures sanitaires exigées par la santé publique et le Cégep doivent être respectées. En cas de non-respect, le contrat peut être résilié sans préavis ni remboursement."
      }
    ]
  },
  {
    title: "Services techniques et obligations liées aux droits d'auteur",
    clauses: [
      {
        num: 25,
        body: "Pour tout événement comportant une prestation musicale, la gestion des droits d’auteur (ex. SOCAN) relève entièrement du responsable de l’activité ou du producteur. Le Cégep ne peut être tenu responsable à cet égard."
      },
      {
        num: 26,
        body:
          "La location de la Salle François-Brassard ou la Salle Polyvalente comprend les services du directeur technique (DT) attitré à la salle, qui accompagne le locataire dans la coordination des aspects techniques de l’événement. Le locataire est invité à communiquer directement avec les compagnies spécialisées (sonorisation, éclairage, vidéo, etc.) afin d’obtenir des soumissions et de choisir les fournisseurs avec lesquels il souhaite collaborer.\n\n" +
          "Afin d’assurer une organisation fluide et efficace, les éléments suivants doivent être respectés :\n" +
          "- Le nom de la compagnie ou du personnel spécialisé retenu doit être transmis au Cégep de Jonquière au moins 30 jours ouvrables avant l’événement à l'adresse suivante : remihould@cegepjonquiere.ca\n" +
          "- Une rencontre ou un échange doit avoir lieu entre le directeur technique et le fournisseur ou technicien embauché, afin de finaliser les aspects techniques et logistiques de l’événement."
      }
    ]
  }
];

export { SUPPLIER, ATTESTATIONS, CANCELLATION_CLAUSE, LOCATION_CLAUSE_GROUPS };
