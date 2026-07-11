import {
  calculatePlantingQuote,
  extractPlantCalculatorRequestsFromText,
} from "../../calculators/planting"
import { recoverMissingLabourLineItem } from "../../export/labour-line-builder"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "../../plants"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import { quoteOptionsFromPlantCalculatorResults } from "../../trades/planting/quote-options"
import type { GoldenQuoteFixture } from "../contracts"

const TRANSCRIPT = `Went to see Client A at 10 Willow Lane, Mount Wellington.

This is a planting quote for the front garden bed.

The planting area is approximately 14.2 metres long.

The plant she wanted was Michelia gracipes.

She does not want the biggest size, but please show both size options if available.

Plant spacing should be 50 centimetres.

Allow one person for one and a half days because there are roots in the garden bed.

Allow 5 bags of garden mix.

Optional work:
Install a 150x50 timber board border around the planting area.

Internal notes:
This is a planting job, not a garden tidy.
Use the spoken 50 centimetre spacing.
Keep the timber board border as optional work.`

// A minimal in-memory plant library standing in for the KB. 14L is priced so
// 30 plants × $68.75 = $2,062.50 (matches the golden preview). Library spacing
// is 600mm so the 500mm spoken spacing produces the expected review warning.
const MICHELIA_ROWS: KnowledgePlantRow[] = [
  plantRow("PLANT-114", "Michelia 'Gracepies' 14L", "14L", 68.75, 600),
  plantRow("PLANT-125", "Michelia 'Gracepies' 25L", "25L", 95.0, 600),
]

function plantRow(
  itemCode: string,
  itemName: string,
  size: string,
  sellPrice: number,
  spacingMm: number,
): KnowledgePlantRow {
  return {
    item_code: itemCode,
    item_name: itemName,
    aliases: [itemCode, itemName, "Michelia gracipes", size],
    item_type: "plant",
    category: "Hedge",
    sell_price: sellPrice,
    raw_import: {
      plant_name: "Michelia gracipes",
      plant_size: size,
      pot_size: size,
      spacing_mm: spacingMm,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  }
}

/**
 * MOCKED BOUNDARY: the AI-extracted classification/scope/materials fields and
 * the KB plant rows are stubbed. Everything downstream is REAL:
 *  - plant count / spacing / options: real calculatePlantingQuote + real library match
 *  - labour line (12h / $1,320): real recoverMissingLabourLineItem parsing the allowance
 *  - customer preview / audit / JMS: real projection functions in runner.ts
 */
function buildProcessedQuote(): ProcessedQuote {
  const [request] = extractPlantCalculatorRequestsFromText(TRANSCRIPT)
  if (!request) throw new Error("Michelia transcript must produce a planting calculator request")

  const libraryMatch = matchPlantRowsFromLibrary(MICHELIA_ROWS, request.plant_name ?? "")
  const result = calculatePlantingQuote({ ...request, plant_library_match: libraryMatch })
  const quoteOptions = quoteOptionsFromPlantCalculatorResults([result])

  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Client A",
    site_address: "10 Willow Lane, Mount Wellington",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: [
        "Supply and plant Michelia gracipes hedge to the agreed planting area.",
        "Planting area approximately 14.2 metres long.",
        "Plants to be spaced at approximately 50cm centres.",
      ],
      notes: [],
    },
    optional_quotes: [
      {
        quote_title: "Optional timber board border",
        job_type: "planting",
        cadence: "",
        scope: ["Install a 150x50 timber board border around the planting area."],
        notes: [],
      },
    ],
    customer_scope: [
      "Supply and plant Michelia gracipes hedge to the agreed planting area.",
      "Planting area approximately 14.2 metres long.",
      "Plants to be spaced at approximately 50cm centres.",
    ],
    materials: ["Garden mix — 5 bags"],
    labour_allowance:
      "Allow one person for one and a half days because there are roots in the garden bed.",
    plant_calculator_results: [result],
    quote_options: quoteOptions,
  }

  // Real labour recovery: parses the word-form allowance into a 12h / $1,320 line.
  recoverMissingLabourLineItem(quote, TRANSCRIPT, "110")

  return quote
}

// ── Pipeline-backed inputs (QA-5) ────────────────────────────────────────────
// Raw knowledge-item context as the API route receives it: plant fields are at
// the TOP level (the pipeline's getKnowledgeItemContext reads them there, unlike
// the KnowledgePlantRow.raw_import shape used by the fixture path above). Includes
// a per-hour labour item so recoverMissingLabourLineItem finds the $110 rate.
const MICHELIA_KNOWLEDGE_ITEMS = [
  {
    item_code: "PLANT-114",
    item_name: "Michelia 'Gracepies' 14L",
    item_type: "plant",
    category: "Hedge",
    sell_price: 68.75,
    plant_name: "Michelia gracipes",
    plant_size: "14L",
    pot_size: "14L",
    spacing_mm: 600,
    aliases: ["Michelia gracipes", "14L"],
    supplier: "Main Nursery",
    stock_status: "In stock",
  },
  {
    item_code: "PLANT-125",
    item_name: "Michelia 'Gracepies' 25L",
    item_type: "plant",
    category: "Hedge",
    sell_price: 95.0,
    plant_name: "Michelia gracipes",
    plant_size: "25L",
    pot_size: "25L",
    spacing_mm: 600,
    aliases: ["Michelia gracipes", "25L"],
    supplier: "Main Nursery",
    stock_status: "In stock",
  },
  {
    item_code: "LAB-001",
    item_name: "Landscaping Labour",
    item_type: "labour",
    unit: "hours",
    sell_price: 110,
    aliases: ["labour", "landscaping labour"],
  },
]

// Mocked AI extraction (raw output, BEFORE deterministic post-processing).
// Deliberately imperfect: no plant_calculator_results and NO labour line item —
// so the real pipeline must run the planting calculator and recover the labour.
function micheliaExtractedQuote() {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Client A",
    site_address: "10 Willow Lane, Mount Wellington",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: [
        "Supply and plant Michelia gracipes hedge to the agreed planting area.",
        "Planting area approximately 14.2 metres long.",
        "Plants to be spaced at approximately 50cm centres.",
      ],
      notes: [],
    },
    optional_quotes: [
      {
        quote_title: "Optional timber board border",
        job_type: "planting",
        cadence: "",
        scope: ["Install a 150x50 timber board border around the planting area."],
        notes: [],
      },
    ],
    customer_scope: [
      "Supply and plant Michelia gracipes hedge to the agreed planting area.",
      "Planting area approximately 14.2 metres long.",
      "Plants to be spaced at approximately 50cm centres.",
    ],
    materials: ["5 bags of garden mix"],
    labour_allowance: "one person for one and a half days because there are roots in the garden bed",
    line_items: [],
  }
}

export const micheliaPlanting: GoldenQuoteFixture = {
  name: "Golden Quote 1 — Michelia planting",
  transcript: TRANSCRIPT,
  mockingNotes:
    "AI classification/scope/materials and KB plant rows are stubbed. Plant maths, labour maths, customer preview, audit, and JMS formatting are all real code under test.",
  expectedClassification: /planting/i,
  customerPreviewContains: ["Michelia", "Supply and plant", "Scope of Work"],
  customerPreviewMustNotContain: [
    "long hedge",
    "metres long. The",
    "Job type:",
    "Planting Quote planting",
  ],
  internalFacts: [
    {
      label: "plant count is 30",
      assert: (p) => p.quote.plant_calculator_results?.[0]?.plant_count === 30,
      actual: (p) => `plant_count=${p.quote.plant_calculator_results?.[0]?.plant_count}`,
    },
    {
      label: "spacing is 500mm from spoken value",
      assert: (p) =>
        p.quote.plant_calculator_results?.[0]?.spacing_mm === 500 &&
        p.quote.plant_calculator_results?.[0]?.spacing_source === "spoken",
      actual: (p) =>
        `spacing_mm=${p.quote.plant_calculator_results?.[0]?.spacing_mm} source=${p.quote.plant_calculator_results?.[0]?.spacing_source}`,
    },
    {
      label: "labour line is 12 hours",
      assert: (p) => p.labourLine?.quantity === "12" && p.labourLine?.unit === "hours",
      actual: (p) => `quantity=${p.labourLine?.quantity} unit=${p.labourLine?.unit}`,
    },
    {
      label: "labour total is 1320",
      assert: (p) => p.labourLine?.total === "1320",
      actual: (p) => `total=${p.labourLine?.total}`,
    },
    {
      label: "garden mix carried as material, not a $5 pricing fact",
      assert: (p) => p.quote.materials.some((m) => /garden mix/i.test(m)),
      actual: (p) => `materials=${JSON.stringify(p.quote.materials)}`,
    },
    {
      label: "no stale labour quantity/hours in missing_information",
      assert: (p) => !p.quote.missing_information.some((m) => /labour.*quantity/i.test(m)),
      actual: (p) => `missing_information=${JSON.stringify(p.quote.missing_information)}`,
    },
  ],
  expectedMatchedLineItems: [
    {
      label: "labour JMS line",
      mustContain: ["Qty 12 hours", "Total 1320"],
      mustNotContain: ["1.5 days hours", "Total 165", "Qty 1.5"],
    },
  ],
  expectedAudit: {
    kind: "issues",
    mustNotInclude: [
      "V03-labour-total-mismatch",
      "V03-combined-unit-display",
      "V03-missing-labour-export-line",
      "V01-bogus-plant-name",
      "V02-quantity-as-price",
    ],
  },
  knownFailures: [
    "Customer preview text does not currently surface '14.2 metres' or '50cm centres' verbatim (they are routed to internal review notes, not the customer scope text). Golden doc expects them in the customer scope.",
  ],
  buildProcessedQuote,
  pipeline: {
    extractedQuote: micheliaExtractedQuote(),
    knowledgeItems: MICHELIA_KNOWLEDGE_ITEMS,
    classification: { specialist: "planting", reason: "test-injected planting classification" },
  },
}
