import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE } from "../processed-quote"
import type { ProcessedQuote } from "../processed-quote"
import { auditProcessedQuote } from "./index"
import type { AuditContext } from "./types"

// ─── Transcript constants ────────────────────────────────────────────────────

const MICHELIA_TRANSCRIPT = `Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

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

const GARDEN_BED_TRANSCRIPT = `Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

This quote is for the left-hand garden bed renovation.

Labour allowance:
Allow 7 hours to remove the keystone edging.
Allow 2 hours to remove the mandarin tree.
Allow 8 hours to install the new timber garden bed border.

Materials:
200x50 timber. Timber pegs. Bugle screws and fixings.

Optional works:
Remove weed species from the garden bed.
Replenish the garden bed with garden mix and mulch.`

// ─── Fixtures ────────────────────────────────────────────────────────────────

function micheliaCleanQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
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
    labour_allowance:
      "Allow one person for one and a half days because there are roots in the garden bed.",
    line_items: [
      {
        item_code: "LAB-001",
        item_name: "Landscaping Labour",
        item_type: "labour",
        description: "Planting labour",
        unit: "hours",
        quantity: "12",
        rate: "110",
        knowledge_base_rate: "110",
        override_rate: null,
        final_rate_used: "110",
        total: "1320",
        match_confidence: "high",
        match_reason: "Trade-aware labour",
        needs_review: false,
        warning: "",
      },
    ],
    // Correctly empty pricing_facts — no $5 from "5 bags of garden mix"
    pricing_facts: [],
    plant_calculator_results: [
      {
        plant_name: "Michelia gracipes",
        length_m: 14.2,
        spacing_mm: 500,
        spacing_source: "spoken",
        plant_count: 30,
        option_groups: [],
        warnings: [],
      },
    ],
  } as unknown as ProcessedQuote
}

function micheliaBadJmsQuote(): ProcessedQuote {
  // Simulates the live bug: AI sets unit:"days" and preferTradeAwareLabourLineItems
  // overwrites unit to "hours" but leaves quantity as "1.5 days" → "Qty 1.5 days hours"
  return {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: [],
      notes: [],
    },
    labour_allowance:
      "Allow one person for one and a half days because there are roots in the garden bed.",
    line_items: [
      {
        item_code: "LAB-001",
        item_name: "Landscaping Labour",
        item_type: "labour",
        description: "Planting labour",
        unit: "hours",       // KB overwrote to hours
        quantity: "1.5 days", // AI value still embedded
        rate: "110",
        knowledge_base_rate: "110",
        override_rate: null,
        final_rate_used: "110",
        total: "165.00",     // 1.5 × $110 (wrong — should be 12 × $110 = $1,320)
        match_confidence: "high",
        match_reason: "",
        needs_review: false,
        warning: "",
      },
    ],
    pricing_facts: [],
  } as unknown as ProcessedQuote
}

function gardenBedQuoteWithBadPricingFact(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "Garden Bed Renovation",
    job_type: "garden_bed_renovation",
    primary_quote: {
      quote_title: "Garden Bed Renovation",
      job_type: "garden_bed_renovation",
      cadence: "",
      scope: [],
      notes: [],
    },
    line_items: [],
    // $5 pricing fact extracted from "Allow 5 bags of garden mix"
    pricing_facts: [
      {
        id: "pf-1",
        type: "allowance",
        amount: 5,
        source_text: "Allow 5 bags of garden mix.",
        currency: "NZD",
        inclusions: [],
        confidence: "low",
      },
    ],
  } as unknown as ProcessedQuote
}

function gardenBedQuoteWithValidPrice(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "Lawn Levelling",
    job_type: "general_landscaping",
    primary_quote: {
      quote_title: "Lawn Levelling",
      job_type: "general_landscaping",
      cadence: "",
      scope: [],
      notes: [],
    },
    line_items: [],
    // $129 from "5kg bag, $129 for the bag" — this is a valid spoken price
    pricing_facts: [
      {
        id: "pf-2",
        type: "fixed_price",
        amount: 129,
        source_text: "I imagine a 5kg bag, $129 for the bag.",
        currency: "NZD",
        inclusions: [],
        confidence: "high",
      },
    ],
  } as unknown as ProcessedQuote
}

function greenwasteDaysQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "Garden Tidy",
    job_type: "garden_tidy",
    primary_quote: {
      quote_title: "Garden Tidy",
      job_type: "garden_tidy",
      cadence: "",
      scope: [],
      notes: [],
    },
    greenwaste: "1.5 days",
    line_items: [],
    pricing_facts: [],
  } as unknown as ProcessedQuote
}

function bogusPlantNameQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: ["Plant multiple Michelia gracipes and metres long. The along planting area 1."],
      notes: [],
    },
    line_items: [],
    pricing_facts: [],
    plant_calculator_results: [
      {
        plant_name: "metres long. The",
        length_m: 14.2,
        spacing_mm: 500,
        spacing_source: "spoken",
        plant_count: 2,
        option_groups: [],
        warnings: [],
      },
    ],
  } as unknown as ProcessedQuote
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function ctx(quote: ProcessedQuote, transcript: string): AuditContext {
  return { rawTranscript: transcript, processedQuote: quote }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("Michelia clean case: no $5 pricing issue, no bogus plant, labour panel and JMS agree", () => {
  const result = auditProcessedQuote(ctx(micheliaCleanQuote(), MICHELIA_TRANSCRIPT))

  const pricingIssues = result.issues.filter((i) => i.id === "V02-quantity-as-price")
  assert.equal(pricingIssues.length, 0, "Must not flag $5 from garden mix when no pricing fact exists")

  const bogusPlantIssues = result.issues.filter((i) => i.id === "V01-bogus-plant-name")
  assert.equal(bogusPlantIssues.length, 0, "Must not flag Michelia gracipes as a bogus plant name")

  const labourMismatch = result.issues.filter((i) => i.id === "V03-labour-total-mismatch")
  assert.equal(labourMismatch.length, 0, "Must not flag labour mismatch when JMS total = structured allowance total")

  assert.equal(result.audit_status, "pass", `Expected pass status. Issues: ${JSON.stringify(result.issues.map((i) => i.id))}`)
})

test("Michelia bad JMS case: flags V03 combined unit and labour total mismatch", () => {
  const result = auditProcessedQuote(ctx(micheliaBadJmsQuote(), MICHELIA_TRANSCRIPT))

  const combinedUnitIssue = result.issues.find((i) => i.id === "V03-combined-unit-display")
  assert.ok(combinedUnitIssue, "Must detect '1.5 days hours' combined unit in labour item")
  assert.equal(combinedUnitIssue!.severity, "error")
  assert.ok(
    /days/i.test(combinedUnitIssue!.evidence ?? "") || /days/i.test(combinedUnitIssue!.actual ?? ""),
    `V03-combined-unit evidence must mention 'days': ${combinedUnitIssue!.evidence}`,
  )

  const labourMismatch = result.issues.find((i) => i.id === "V03-labour-total-mismatch")
  assert.ok(labourMismatch, "Must detect Labour Pricing ($1,320) vs JMS total ($165) mismatch")
  assert.equal(labourMismatch!.severity, "error")
  assert.ok(
    /165/i.test(labourMismatch!.actual ?? ""),
    `V03-labour-total-mismatch must mention 165 as actual: ${labourMismatch!.actual}`,
  )
  assert.ok(
    /1320/i.test(labourMismatch!.expected ?? ""),
    `V03-labour-total-mismatch must mention 1320 as expected: ${labourMismatch!.expected}`,
  )

  assert.notEqual(result.audit_status, "pass", "Status must not be pass when labour mismatch detected")
})

test("V02 pricing guard: $5 from 5 bags of garden mix is flagged as quantity-as-price", () => {
  const result = auditProcessedQuote(ctx(gardenBedQuoteWithBadPricingFact(), GARDEN_BED_TRANSCRIPT))

  const issue = result.issues.find((i) => i.id === "V02-quantity-as-price")
  assert.ok(issue, "Must flag $5 extracted from '5 bags of garden mix' as a quantity-as-price error")
  assert.equal(issue!.severity, "error")
  assert.match(issue!.evidence ?? "", /5 bags/i)
})

test("V02 pricing guard: $129 for 5kg lawn seed bag is NOT flagged — it is a valid spoken price", () => {
  const result = auditProcessedQuote(ctx(gardenBedQuoteWithValidPrice(), "I imagine a 5kg bag, $129 for the bag."))

  const pricingIssue = result.issues.find((i) => i.id === "V02-quantity-as-price")
  assert.equal(pricingIssue, undefined, "$129 from an explicit currency sentence must not be flagged")
})

test("V01 unit sanity: green waste in 'days' is flagged", () => {
  const result = auditProcessedQuote(ctx(greenwasteDaysQuote(), "Two trailer loads green waste."))

  const issue = result.issues.find((i) => i.id === "V01-greenwaste-time-unit")
  assert.ok(issue, "Must flag green waste quantity using time unit")
  assert.equal(issue!.category, "green_waste")
})

test("V01 unit sanity: bogus plant name 'metres long. The' is flagged in calculator results", () => {
  const result = auditProcessedQuote(ctx(bogusPlantNameQuote(), MICHELIA_TRANSCRIPT))

  const bogusPlant = result.issues.find((i) => i.id === "V01-bogus-plant-name")
  assert.ok(bogusPlant, "Must flag 'metres long. The' as a bogus plant name from calculator")
  assert.equal(bogusPlant!.category, "calculator")
  assert.ok(/metres/i.test(bogusPlant!.evidence ?? ""))
})

test("V01 unit sanity: customer scope containing 'metres long. The' text is flagged", () => {
  const result = auditProcessedQuote(ctx(bogusPlantNameQuote(), MICHELIA_TRANSCRIPT))

  const scopeIssue = result.issues.find((i) => i.id === "V01-customer-scope-measurement-fragment")
  assert.ok(scopeIssue, "Must flag 'metres long. The' in customer scope")
  assert.equal(scopeIssue!.category, "customer_preview")
})

test("Michelia clean case: Michelia gracipes is not flagged as bogus plant name", () => {
  const result = auditProcessedQuote(ctx(micheliaCleanQuote(), MICHELIA_TRANSCRIPT))

  const bogusPlant = result.issues.find((i) => i.id === "V01-bogus-plant-name")
  assert.equal(bogusPlant, undefined, "Michelia gracipes must not be flagged as bogus")
})

test("Auditor handles empty quote without throwing", () => {
  const emptyQuote = { ...EMPTY_PROCESSED_QUOTE } as unknown as ProcessedQuote
  const result = auditProcessedQuote(ctx(emptyQuote, ""))
  assert.equal(result.audit_status, "pass")
  assert.equal(result.issues.length, 0)
})
