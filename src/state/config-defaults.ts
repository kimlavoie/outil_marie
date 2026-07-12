/**
 * config-defaults.ts - Embedded default configuration (seed data) used the first time the
 * app runs, before any settings have been customized.
 */

// Embedded default configurations (Seed Data)
// Builds a single-parameter pricing grid (one row "Tarif" x one column per client type) from
// a flat list of {description, amount} pairs — used only to seed DEFAULT_CONFIG in the same
// shape the old flat `tarifs[]` used to produce, now expressed as a versioned pricing grid.
function buildSeedPricingGrid(gridId: string, paramId: string, tarifPairs: { description: string; amount: number }[]) {
  return {
    id: gridId,
    effective_date: "", // "" means "in effect since the beginning"
    parameters: [{ id: paramId, name: "Tarif" }],
    client_types: tarifPairs.map((t, i) => ({ id: `${gridId}-ct${i}`, name: t.description })),
    cells: tarifPairs.map((t, i) => ({ parameter_id: paramId, client_type_id: `${gridId}-ct${i}`, amount: t.amount }))
  };
}

const DEFAULT_CONFIG = {
  rooms: [
    {
      name: "Salle Polyvalente (200.2)",
      color: "#4f46e5",
      pricing_grids: [
        buildSeedPricingGrid("grid-poly", "param-poly", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Salle François-Brassard (326.1)",
      color: "#059669",
      pricing_grids: [
        buildSeedPricingGrid("grid-sfb", "param-sfb", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Hall de la salle François-Brassard (341.1)",
      color: "#d97706",
      pricing_grids: [
        buildSeedPricingGrid("grid-hall-sfb", "param-hall-sfb", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Petit salon de la salle François-Brassard (326.1)",
      color: "#db2777",
      pricing_grids: [
        buildSeedPricingGrid("grid-salon-sfb", "param-salon-sfb", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Billetterie de la salle François-Brassard (320.1)",
      color: "#0891b2",
      pricing_grids: [
        buildSeedPricingGrid("grid-billetterie", "param-billetterie", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Pas perdus (201.2)",
      color: "#7c3aed",
      pricing_grids: [
        buildSeedPricingGrid("grid-pas-perdus", "param-pas-perdus", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Cafétéria (120.2)",
      color: "#ea580c",
      pricing_grids: [
        buildSeedPricingGrid("grid-cafeteria", "param-cafeteria", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Cantine Pavillon J.-Angers (CANATM)",
      color: "#0284c7",
      pricing_grids: [
        buildSeedPricingGrid("grid-cantine-jangers", "param-cantine-jangers", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Cantine Pavillon Lionel-Gaudreault (CANPLG)",
      color: "#65a30d",
      pricing_grids: [
        buildSeedPricingGrid("grid-cantine-plg", "param-cantine-plg", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Piscine (261.1)",
      color: "#0d9488",
      pricing_grids: [
        buildSeedPricingGrid("grid-piscine", "param-piscine", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Gymnase (249.1)",
      color: "#ca8a04",
      pricing_grids: [
        buildSeedPricingGrid("grid-gymnase", "param-gymnase", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Jardin intérieur (JAR.1)",
      color: "#16a34a",
      pricing_grids: [
        buildSeedPricingGrid("grid-jardin", "param-jardin", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Terrain forêt nourricière (FON.1)",
      color: "#4d7c0f",
      pricing_grids: [
        buildSeedPricingGrid("grid-foret", "param-foret", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Terrain Piékouagami-PLG (TER-03)",
      color: "#9333ea",
      pricing_grids: [
        buildSeedPricingGrid("grid-piekouagami", "param-piekouagami", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Surface synthétique (EDU.1)",
      color: "#be185d",
      pricing_grids: [
        buildSeedPricingGrid("grid-synthetique", "param-synthetique", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Local Club social (841.0)",
      color: "#475569",
      pricing_grids: [
        buildSeedPricingGrid("grid-club-social", "param-club-social", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    },
    {
      name: "Hall de la direction générale (HALLDG)",
      color: "#0891b2",
      pricing_grids: [
        buildSeedPricingGrid("grid-halldg", "param-halldg", [
          { description: "Interne", amount: 0.0 },
          { description: "Externe", amount: 0.0 }
        ])
      ],
      linked_rooms: [] as string[],
      linked_staff: [] as { id: string; salary_id: string; count: number }[],
      linked_fees: [] as { id: string; description: string; amount: number; gl_account_code: string }[],
      linked_tasks: [] as { id: string; description: string }[]
    }
  ],
  departments: [
    "ACEECJ",
    "ANIMATION PÉDAGOGIQUE (ALEXANDRA  HÉBERT)",
    "BICQ",
    "BRI - BUREAU DE LA RECHERCHE ET DE L'INNOVATION",
    "CLIENT EXTERNE",
    "COMMUNICATION",
    "DIRECTION DES SERVICES INFORMATIONNELLES",
    "DIRECTION DES ÉTUDES (ENSEIGNANTS)",
    "DIRECTION GÉNÉRALE",
    "DRH - DIRECTION DES RESSOURCES HUMAINES",
    "DSATC",
    "FONDATION ASSELIN",
    "PARTENARIAT",
    "VIE ÉTUDIANTE (SOPHIE HUPPÉ)"
  ],
  accounts: [
    { code: "892-9020-00-849", description: "SCOLAIRE" },
    { code: "892-9020-01-849", description: "SCOLAIRE" },
    { code: "892-9020-04-849", description: "SCOLAIRE" },
    { code: "892-9020-00-851", description: "GOUV QC" },
    { code: "892-9020-01-851", description: "GOUV QC" },
    { code: "892-9020-04-851", description: "GOUV QC" },
    { code: "892-9020-00-853", description: "MUNICIPAL" },
    { code: "892-9020-01-853", description: "MUNICIPAL" },
    { code: "892-9020-04-853", description: "MUNICIPAL" },
    { code: "892-9020-00-864", description: "BAR SFB" },
    { code: "892-9020-01-864", description: "BAR POLY" },
    { code: "892-9020-00-869", description: "VESTIAIRE" },
    { code: "892-9020-01-869", description: "VESTIAIRE" },
    { code: "892-9020-00-870", description: "CIE EXTERNE (SFB, DT, HOTES)" },
    { code: "892-9020-01-870", description: "CIE EXTERNE (POLY, DT, HOTES)" },
    { code: "892-9020-04-870", description: "CIE EXTERNE (AGENT)" },
    { code: "892-9020-05-870", description: "CIE EXTERNE (PROJO CINÉ-CLUB)" },
    { code: "892-9020-06-870", description: "CIE EXTERNE (PROJO SFB)" },
    { code: "892-9020-07-870", description: "CIE EXTERNE (PROJO POLY)" },
    { code: "892-9020-00-889", description: "INTERNE (SFB, HOTES)" },
    { code: "892-9020-01-889", description: "INTERNE (POLY, HOTES)" },
    { code: "892-9020-04-889", description: "INTERNE (AGENT)" },
    { code: "892-9020-05-889", description: "INTERNE (PROJO CINÉ-CLUB)" },
    { code: "892-9020-06-889", description: "INTERNE (PROJO SFB)" },
    { code: "892-9020-07-889", description: "INTERNE (PROJO POLY)" }
  ],
  salaries: [
    {
      id: "salary-dt",
      job: "Directeur technique",
      tarifs: [
        { id: "tarif-dt", label: "", gl_account_code: "", rate_versions: [{ id: "rv-dt", effective_date: "", rate: 74, overtime_rate: 0 }] }
      ]
    },
    {
      id: "salary-tc",
      job: "Technicien contractuel",
      tarifs: [
        { id: "tarif-tc", label: "", gl_account_code: "", rate_versions: [{ id: "rv-tc", effective_date: "", rate: 57, overtime_rate: 0 }] }
      ]
    },
    {
      id: "salary-aet",
      job: "Appariteur étudiant technicien",
      tarifs: [
        {
          id: "tarif-aet",
          label: "",
          gl_account_code: "",
          rate_versions: [{ id: "rv-aet", effective_date: "", rate: 37, overtime_rate: 0 }]
        }
      ]
    },
    {
      id: "salary-hote",
      job: "Hôte",
      tarifs: [
        {
          id: "tarif-hote",
          label: "",
          gl_account_code: "",
          rate_versions: [{ id: "rv-hote", effective_date: "", rate: 27, overtime_rate: 0 }]
        }
      ]
    },
    {
      id: "salary-as",
      job: "Agent de sécurité",
      tarifs: [
        { id: "tarif-as", label: "", gl_account_code: "", rate_versions: [{ id: "rv-as", effective_date: "", rate: 50, overtime_rate: 0 }] }
      ]
    },
    {
      id: "salary-sauveteur",
      job: "Sauveteur",
      tarifs: [
        {
          id: "tarif-sauveteur",
          label: "",
          gl_account_code: "",
          rate_versions: [{ id: "rv-sauveteur", effective_date: "", rate: 42, overtime_rate: 0 }]
        }
      ]
    }
  ],
  services: [
    {
      id: "service-location-projecteur",
      name: "Location de projecteur",
      type: "hourly" as const,
      tarifs: [
        {
          id: "tarif-location-projecteur",
          label: "",
          gl_account_code: "",
          rate_versions: [{ id: "rv-location-projecteur", effective_date: "", rate: 20 }]
        }
      ]
    },
    {
      id: "service-piano-queue",
      name: "Piano à queue",
      type: "fixed" as const,
      tarifs: [
        {
          id: "tarif-piano-queue",
          label: "",
          gl_account_code: "",
          rate_versions: [{ id: "rv-piano-queue", effective_date: "", rate: 350 }]
        }
      ]
    },
    {
      id: "service-projecteur-equipement",
      name: "Projecteur / équipement informatique",
      type: "fixed" as const,
      tarifs: [
        {
          id: "tarif-projecteur-equipement",
          label: "",
          gl_account_code: "",
          rate_versions: [{ id: "rv-projecteur-equipement", effective_date: "", rate: 32 }]
        }
      ]
    }
  ],
  global_tasks: [
    { id: "global-task-dossier-serveur", description: "Créer un dossier sur le serveur" },
    { id: "global-task-dossier-outlook", description: "Créer un dossier dans Outlook" }
  ],
  schedulable_tasks: [] as any[],
  // Current Quebec/Canada rates (TPS/TVQ) as of this codebase's writing. Kept as configurable
  // settings rather than hard-coded so a future rate change doesn't require a code change — see
  // the "Taxes" settings panel.
  tax_rates: { tps: 0.05, tvq: 0.09975 }
};

export { DEFAULT_CONFIG };
