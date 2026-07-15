export type QuoteStatus = "ready" | "review"

export type DraftRow = {
  id: string
  customer: string
  suburb: string
  date: string
  service: string
  estimate: string
  status: QuoteStatus
}

export const draftRows: DraftRow[] = [
  {
    id: "q-1042",
    customer: "Client A",
    suburb: "Devonport, Auckland",
    date: "Today, 9:14am",
    service: "Decking Project",
    estimate: "$6,480",
    status: "review",
  },
  {
    id: "q-1041",
    customer: "Client B",
    suburb: "Titirangi, Auckland",
    date: "Today, 7:52am",
    service: "Hedge Trimming",
    estimate: "$840",
    status: "ready",
  },
  {
    id: "q-1039",
    customer: "Client C",
    suburb: "Pukekohe, Auckland",
    date: "Yesterday",
    service: "Garden Clean-up",
    estimate: "$1,260",
    status: "ready",
  },
  {
    id: "q-1037",
    customer: "Client D",
    suburb: "Howick, Auckland",
    date: "Yesterday",
    service: "Retaining Wall",
    estimate: "$9,150",
    status: "review",
  },
  {
    id: "q-1034",
    customer: "Client E",
    suburb: "New Lynn, Auckland",
    date: "12 May",
    service: "Lawn & Edging",
    estimate: "$420",
    status: "ready",
  },
  {
    id: "q-1031",
    customer: "Client F",
    suburb: "Albany, Auckland",
    date: "11 May",
    service: "Tree Removal",
    estimate: "$2,890",
    status: "review",
  },
]

export type LineItem = {
  id: string
  label: string
  detail: string
  qty: string
  rate: string
  amount: string
  warning?: boolean
}

export const generatedQuote = {
  customer: "Client A",
  site: "15 Sample Lane, Devonport, Auckland 0624",
  phone: "021 000 0000",
  scope: [
    "Supply and install premium Vitex hardwood decking over an existing concrete patio area.",
    "Approx. 24m² deck, 5.4m x 4.4m, with concealed fixings and pre-oiled boards.",
    "Build and install two hardwood steps down to existing lawn.",
    "Form new timber substructure on adjustable jacks, H4 treated.",
    "Remove and cart away all timber offcuts and packaging.",
  ],
  internalNotes: [
    "Access is tight down the right side of house — wheelbarrow only, allow extra labour.",
    "Client mentioned wanting it done before Labour Weekend (long weekend).",
    "Confirm Vitex stock with Herbert Timber before locking dates.",
  ],
  lineItems: [
    {
      id: "li-1",
      label: "Vitex hardwood decking boards",
      detail: "90mm x 19mm, pre-oiled — 24m²",
      qty: "26 lm pack",
      rate: "$118.00/m²",
      amount: "$2,832.00",
    },
    {
      id: "li-2",
      label: "H4 treated substructure timber",
      detail: "Bearers, joists, adjustable jacks",
      qty: "1 lot",
      rate: "—",
      amount: "$680.00",
    },
    {
      id: "li-3",
      label: "Concealed fixings & fastenings",
      detail: "Stainless clips, screws, joist tape",
      qty: "1 lot",
      rate: "—",
      amount: "$245.00",
    },
    {
      id: "li-4",
      label: "Machinery Hire: Post Hole Borer",
      detail: "Confidence low — confirm if required",
      qty: "1 day",
      rate: "—",
      amount: "$0.00",
      warning: true,
    },
    {
      id: "li-5",
      label: "Labour",
      detail: "2 builders, est. 2.5 days",
      qty: "40 hrs",
      rate: "$65.00/hr",
      amount: "$2,600.00",
    },
    {
      id: "li-6",
      label: "Skip bin / waste removal",
      detail: "Rate not captured in recording",
      qty: "1",
      rate: "—",
      amount: "$0.00",
      warning: true,
    },
  ] as LineItem[],
  subtotal: "$6,357.00",
  gst: "$953.55",
  total: "$7,310.55",
}

export const transcriptDemo = `Right, this one's for Client A, 15 Sample Lane out in Devonport. He wants the old concrete patio decked over with the Vitex hardwood, the premium stuff, pre-oiled. Measured it up at roughly five point four by four point four, so call it twenty four square metres. Two steps down to the lawn. Access is a bit tight down the right hand side so it'll be wheelbarrow only. Concealed fixings, H4 framing on the jacks. He's keen to have it sorted before Labour Weekend if we can manage it...`

// Structured sections for the Quote Review screen (editable AI output)
export type ReviewSection = {
  id: string
  title: string
  scope?: "both" | "internal" | "customer"
  kind: "field" | "list" | "warnings"
  value?: string
  items?: string[]
  warnings?: { label: string; detail: string }[]
}

export const reviewSections: ReviewSection[] = [
  {
    id: "customer",
    title: "Customer details",
    kind: "field",
    scope: "both",
    value: "Client A\n021 000 0000\nclient@example.com",
  },
  {
    id: "site",
    title: "Site address",
    kind: "field",
    scope: "both",
    value: "15 Sample Lane, Devonport, Auckland 0624",
  },
  {
    id: "jobtype",
    title: "Job type",
    kind: "field",
    scope: "both",
    value: "Decking Project — Vitex hardwood over existing patio",
  },
  {
    id: "scope",
    title: "Customer-facing scope",
    kind: "list",
    scope: "customer",
    items: [
      "Supply and install premium Vitex hardwood decking over the existing concrete patio (approx. 24m²).",
      "Concealed fixings throughout with pre-oiled boards for a clean, finished look.",
      "Build and install two hardwood steps down to the existing lawn.",
      "Remove and cart away all timber offcuts and packaging on completion.",
    ],
  },
  {
    id: "internal",
    title: "Internal notes",
    kind: "list",
    scope: "internal",
    items: [
      "Access tight down right side of house — wheelbarrow only, allow extra labour.",
      "Client wants it done before Labour Weekend.",
      "Confirm Vitex stock with Herbert Timber before locking dates.",
    ],
  },
  {
    id: "labour",
    title: "Labour allowance",
    kind: "field",
    scope: "internal",
    value: "2 builders × 2.5 days (40 hrs) @ $65/hr — allow 4 extra hrs for tight access.",
  },
  {
    id: "materials",
    title: "Materials / green waste",
    kind: "list",
    scope: "internal",
    items: [
      "Vitex decking 90×19mm pre-oiled — 24m² (26 lm packs).",
      "H4 treated substructure: bearers, joists, adjustable jacks.",
      "Stainless concealed clips, screws, joist tape.",
      "Green waste: nil — hardscape job, packaging only.",
    ],
  },
  {
    id: "exclusions",
    title: "Exclusions",
    kind: "list",
    scope: "both",
    items: [
      "Resource consent or engineering sign-off.",
      "Concrete foundations or piling.",
      "Electrical for deck lighting.",
    ],
  },
  {
    id: "followup",
    title: "Follow-up tasks",
    kind: "list",
    scope: "internal",
    items: [
      "Ring Herbert Timber to confirm Vitex stock + lead time.",
      "Send client deck oil maintenance sheet with quote.",
      "Book skip bin once start date confirmed.",
    ],
  },
  {
    id: "missing",
    title: "Missing information",
    kind: "list",
    scope: "internal",
    items: [
      "Skip bin / waste removal rate not captured in recording.",
      "Confirm whether post hole borer hire is actually required.",
      "Preferred start date not stated — only 'before Labour Weekend'.",
    ],
  },
  {
    id: "warnings",
    title: "Confidence warnings",
    kind: "warnings",
    scope: "both",
    warnings: [
      { label: "Machinery Hire: Post Hole Borer — $0.00", detail: "Low confidence — mentioned but no rate or quantity given." },
      { label: "Skip bin / waste removal — $0.00", detail: "Rate not captured in the recording." },
    ],
  },
]

// Professional customer-facing quote (Quote Draft preview)
export const quoteDraft = {
  quoteNo: "Q-1042",
  date: "31 May 2026",
  validDays: 30,
  business: {
    name: "Kauri & Co. Property Maintenance",
    abn: "GST 122-445-908",
    phone: "09 000 0000",
    email: "jobs@example.com",
  },
  client: {
    name: "Client A",
    address: "15 Sample Lane, Devonport, Auckland 0624",
  },
  intro:
    "Thank you for the opportunity to quote on your new hardwood deck. Please find the details of the work below. We'd love to have this completed before Labour Weekend.",
  lineItems: [
    { label: "Premium Vitex hardwood decking — supply & install (24m²)", amount: "$2,832.00" },
    { label: "H4 treated substructure & adjustable jacks", amount: "$680.00" },
    { label: "Concealed stainless fixings & fastenings", amount: "$245.00" },
    { label: "Two hardwood steps to lawn", amount: "$360.00" },
    { label: "Labour — 2 builders, 2.5 days", amount: "$2,600.00" },
  ],
  inclusions: [
    "Pre-oiled boards with concealed fixings",
    "Removal of all offcuts and packaging",
    "Workmanship guarantee — 5 years",
  ],
  exclusions: ["Resource consent / engineering", "Concrete foundations", "Deck lighting electrical"],
  subtotal: "$6,717.00",
  gst: "$1,007.55",
  total: "$7,724.55",
}

export type UploadFile = {
  name: string
  size: string
  status: "complete" | "analysing"
  insights?: { tone: string; structure: string; pricing: string; suggestion: string }
}

export const uploadFiles: UploadFile[] = [
  {
    name: "Sample_RetainingWall_Quote.pdf",
    size: "248 KB",
    status: "complete",
    insights: {
      tone: "Warm, plain-English, first-person ('we'll')",
      structure: "Intro → scope bullets → itemised pricing → inclusions/exclusions",
      pricing: "Line-item with GST shown separately, 30-day validity",
      suggestion: "Reusable template: 'Retaining Wall — Timber'",
    },
  },
  {
    name: "Sample_HedgeTrim_Invoice.pdf",
    size: "112 KB",
    status: "complete",
    insights: {
      tone: "Brief, friendly, casual sign-off",
      structure: "Single scope paragraph → total → payment terms",
      pricing: "Per-lineal-metre rate, no GST breakdown",
      suggestion: "Reusable template: 'Hedge Trimming — Residential'",
    },
  },
]

export const suggestedTemplates = [
  "Retaining Wall — Timber",
  "Hedge Trimming — Residential",
  "Deck Maintenance & Re-oil",
]

export type ServiceTemplate = {
  id: string
  name: string
  rate: string
  baseline: string
  inclusions: string[]
  exclusions: string[]
}

export const serviceTemplates: ServiceTemplate[] = [
  {
    id: "hedge",
    name: "Hedge Trimming",
    rate: "$45 / lineal metre",
    baseline: "Min. charge $180 · green waste to 2m³ incl.",
    inclusions: ["Trim & shape to agreed height", "Green waste to 2m³", "Site tidy & blow-down"],
    exclusions: ["Green waste removal over 2m³", "Stump or root removal", "Powerline clearance work"],
  },
  {
    id: "decking",
    name: "Decking Project",
    rate: "$118 / m² (hardwood)",
    baseline: "Pine from $95/m² · hardwood from $118/m²",
    inclusions: ["Supply & install boards", "Concealed fixings", "Offcut & packaging removal"],
    exclusions: ["Resource consent / engineering", "Concrete foundations", "Electrical for deck lighting"],
  },
  {
    id: "cleanup",
    name: "Garden Clean-up",
    rate: "$65 / hour per person",
    baseline: "Half-day min. · trailer load $90",
    inclusions: ["Weeding & pruning", "Lawn mow & edge", "1 trailer load green waste"],
    exclusions: ["Hazardous waste disposal", "Spraying / herbicide application", "Pest or possum control"],
  },
  {
    id: "lawn",
    name: "Lawn & Edging",
    rate: "$0.85 / m² mowing",
    baseline: "Min. charge $60 · edging $1.20/lm",
    inclusions: ["Mow, catch & edge", "Path & driveway blow-down", "Clippings removed"],
    exclusions: ["Lawn renovation / re-sow", "Fertiliser programme", "Irrigation repairs"],
  },
  {
    id: "tree",
    name: "Tree & Stump Removal",
    rate: "Priced per job",
    baseline: "Day rate $1,450 + chipper/skip",
    inclusions: ["Felling & limbing", "Chipping on site", "Stump grind to 200mm"],
    exclusions: ["Arborist report / consent", "Powerline proximity work", "Protected tree applications"],
  },
  {
    id: "retaining",
    name: "Retaining Wall",
    rate: "From $420 / m²",
    baseline: "Timber from $420/m² · block from $560/m²",
    inclusions: ["Excavation & posts", "H5 timber / blocks", "Drainage metal & filter cloth"],
    exclusions: ["Engineering / consent (walls >1.5m)", "Surveying", "Disposal of contaminated soil"],
  },
]

export const knowledgeFiles = [
  { name: "Sample_RetainingWall_Quote.pdf", size: "248 KB" },
  { name: "Sample_HedgeTrim_Invoice.pdf", size: "112 KB" },
]

export const jmsOptions = ["Tradify", "Jobber", "Xero", "ServiceM8"]
