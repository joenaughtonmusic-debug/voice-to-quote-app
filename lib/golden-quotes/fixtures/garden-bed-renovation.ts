import { extractPerTaskHourAllowances, summarisePerTaskHourAllowances } from "../../core/labour-allowance-extraction"
import { extractPricing } from "../../core/pricing-extraction"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import type { GoldenQuoteFixture } from "../contracts"

const TRANSCRIPT = `Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

This quote is for the left-hand garden bed renovation.

Scope of work:
Remove the existing keystone edging.
Remove the existing mandarin tree.
Install new 200x50 timber garden bed borders.
The garden bed area is approximately 10 square metres.
The new border comes out approximately 900 millimetres from the fence.

Labour allowance:
Allow 7 hours to remove the keystone edging.
Allow 2 hours to remove the mandarin tree.
Allow 8 hours to install the new timber garden bed border.

Materials:
200x50 timber.
Timber pegs.
Bugle screws and fixings.

Optional works:
Remove weed species from the garden bed.
Remove apple tree stump.
Replenish the garden bed with garden mix and mulch.

Internal notes:
This is a small garden bed renovation / timber border job, not a retaining wall.
Keep optional works separate from the main quote.`

const LABOUR_RATE = 110

/**
 * MOCKED BOUNDARY: AI classification/scope/materials/optional fields are stubbed.
 * REAL under test: per-task hour extraction (7+2+8 = 17h via
 * extractPerTaskHourAllowances), the labour line total, and all projection layers.
 * The labour LINE ITEM assembly is done here because the route's
 * applyPerTaskHourAllowances is not yet extracted from route.ts (see extraction plan).
 */
function buildProcessedQuote(): ProcessedQuote {
  const summary = summarisePerTaskHourAllowances(extractPerTaskHourAllowances(TRANSCRIPT))
  const totalHours = summary.totalHours

  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "Garden Bed Renovation",
    job_type: "general_landscaping",
    primary_quote: {
      quote_title: "Garden Bed Renovation",
      job_type: "general_landscaping",
      cadence: "",
      scope: [
        "Remove the existing keystone edging.",
        "Remove the existing mandarin tree.",
        "Install new 200x50 timber garden bed borders.",
        "Garden bed area approximately 10 square metres.",
        "New border comes out approximately 900mm from the fence.",
      ],
      notes: [],
    },
    optional_quotes: [
      {
        quote_title: "Optional works",
        job_type: "general_landscaping",
        cadence: "",
        scope: [
          "Remove weed species from the garden bed.",
          "Remove apple tree stump.",
          "Replenish the garden bed with garden mix and mulch.",
        ],
        notes: [],
      },
    ],
    customer_scope: [
      "Remove the existing keystone edging.",
      "Remove the existing mandarin tree.",
      "Install new 200x50 timber garden bed borders.",
    ],
    materials: ["200x50 timber", "Timber pegs", "Bugle screws and fixings"],
    labour_allowance: summary.breakdownText,
    line_items: [
      {
        item_code: "LAB-001",
        item_name: "Landscaping Labour",
        item_type: "labour",
        description: `Garden bed renovation labour — ${summary.allowances
          .map((a) => `${a.label} (${a.hours}h)`)
          .join(", ")}`,
        quantity: String(totalHours),
        unit: "hours",
        rate: String(LABOUR_RATE),
        knowledge_base_rate: String(LABOUR_RATE),
        override_rate: null,
        final_rate_used: String(LABOUR_RATE),
        total: String(totalHours * LABOUR_RATE),
        match_confidence: "high",
        match_reason: "Per-task hour allowances summed deterministically.",
        needs_review: false,
        warning: "",
      },
    ],
  }

  return quote
}

// Real pricing extraction over the transcript — used to prove the hour allowances
// ("Allow 7 hours…") are NOT mis-read as $7 / $2 / $8 pricing facts.
function extractedPriceAmounts(): number[] {
  return extractPricing(TRANSCRIPT)
    .pricing.map((fact) => fact.amount)
    .filter((amount): amount is number => typeof amount === "number")
}

export const gardenBedRenovation: GoldenQuoteFixture = {
  name: "Golden Quote 2 — Garden bed renovation",
  transcript: TRANSCRIPT,
  mockingNotes:
    "AI classification/scope/materials/optional fields are stubbed. Per-task hour extraction (17h), pricing extraction (no $7/$2/$8), and all projection layers are real code under test.",
  expectedClassification: /general_landscaping|garden_bed_renovation/i,
  customerPreviewContains: ["timber", "Remove"],
  customerPreviewMustNotContain: [
    "Title:",
    "Job type:",
    "Cadence:",
    "$7",
    "$2 ",
    "$8",
    "retaining wall",
  ],
  internalFacts: [
    {
      label: "labour total hours is 17 (7+2+8)",
      assert: (p) => p.labourLine?.quantity === "17",
      actual: (p) => `quantity=${p.labourLine?.quantity}`,
    },
    {
      label: "labour total is 1870 (17 × $110)",
      assert: (p) => p.labourLine?.total === "1870",
      actual: (p) => `total=${p.labourLine?.total}`,
    },
    {
      label: "not classified as retaining",
      assert: (p) => !/retain/i.test(p.quote.job_type),
      actual: (p) => `job_type=${p.quote.job_type}`,
    },
    {
      label: "real pricing extraction yields no $7/$2/$8 facts",
      assert: () => {
        const amounts = extractedPriceAmounts()
        return ![7, 2, 8].some((n) => amounts.includes(n))
      },
      actual: () => `pricing amounts=${JSON.stringify(extractedPriceAmounts())}`,
    },
    {
      label: "garden mix/mulch only in optional works, not required materials",
      assert: (p) =>
        !p.quote.materials.some((m) => /garden mix|mulch/i.test(m)) &&
        p.quote.optional_quotes.some((o) => o.scope.some((s) => /garden mix|mulch/i.test(s))),
      actual: (p) => `materials=${JSON.stringify(p.quote.materials)}`,
    },
  ],
  expectedMatchedLineItems: [
    {
      label: "labour JMS line",
      mustContain: ["Qty 17 hours", "Total 1870"],
    },
  ],
  expectedAudit: {
    kind: "issues",
    mustNotInclude: ["V02-quantity-as-price", "V03-labour-total-mismatch", "V03-missing-labour-export-line"],
  },
  knownFailures: [],
  buildProcessedQuote,
}
