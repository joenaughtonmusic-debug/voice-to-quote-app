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

const ADAM_TRANSCRIPT = `Okay, this is a quote for Adam at 20 Lemnos Street in Titirangi. So the main job is levelling the back lawn. Before we do that though, we need to construct a small timber retaining wall, approximately 400mm high, using two 200x50 retaining timbers with 100x100 timber posts along that length. And we also need to install some polythene along the fence to protect the fence. Once we've installed the retaining wall, we can then look to put down a whole bunch of topsoil. So we're looking at doing a 50mm depth across the area, and the area is approximately 6m by 16.8m. And the retaining wall is going to sit 900mm off the fence, and the length is going to be 16.8m for the retaining wall. And it would be great to also have the option for lawn mix to go on top of the area, but in the actual quote we'll use topsoil. And we also need to have a count for some lawn seed, but we'll just use the cheap lawn seed. I imagine a 5kg bag, $129 for the bag, and it would be great if you could also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the labour for that being two people one day.`

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

// Mirrors lib/golden-quotes/fixtures/adam-titirangi.ts: the current BAD output —
// misclassified as decking, suburb dropped, topsoil/lawn seed absent.
function adamBadQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Adam",
    site_address: "20 Lemnos Street",
    quote_title: "Retaining Wall Quote",
    job_type: "decking",
    primary_quote: {
      quote_title: "Retaining Wall Quote",
      job_type: "decking",
      cadence: "",
      scope: [
        "Plant multiple Deck area 1 along deck area 1.",
        "Construct small timber retaining wall approximately 400mm high.",
      ],
      notes: [],
    },
    optional_quotes: [
      {
        quote_title: "Optional Ficus Tuffi hedge",
        job_type: "planting",
        cadence: "",
        scope: ["Plant a Ficus Tuffi hedge along the fence."],
        notes: [],
      },
    ],
    customer_scope: [
      "Plant multiple Deck area 1 along deck area 1.",
      "Construct small timber retaining wall approximately 400mm high.",
    ],
    materials: ["Decking boards"],
    line_items: [
      {
        item_code: "",
        item_name: "Decking boards",
        item_type: "material",
        description: "Decking boards",
        quantity: "100.8",
        unit: "m2",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "low",
        match_reason: "Decking calculator fired — no decking in transcript.",
        needs_review: true,
        warning: "Rate missing",
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

// ── V03 missing labour export line ───────────────────────────────────────────

test("V03: labour allowance parseable but no labour line item — flags V03-missing-labour-export-line", () => {
  const quoteNoLabourLine = {
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
    labour_allowance: "one person for one and a half days because there are roots in the garden bed",
    // No labour line item — simulates the Michelia failure mode
    line_items: [
      {
        item_code: "",
        item_name: "Garden mix",
        item_type: "material",
        description: "5 bags garden mix",
        quantity: "5 bags",
        unit: "bags",
        rate: null,
        knowledge_base_rate: null,
        override_rate: null,
        final_rate_used: null,
        total: null,
        match_confidence: "low",
        match_reason: "Not found in item library",
        needs_review: true,
        warning: "Rate missing",
      },
    ],
    pricing_facts: [],
  } as unknown as ProcessedQuote

  const result = auditProcessedQuote(ctx(quoteNoLabourLine, MICHELIA_TRANSCRIPT))

  const issue = result.issues.find((i) => i.id === "V03-missing-labour-export-line")
  assert.ok(issue, "Must flag missing labour export line when allowance is parseable")
  assert.equal(issue!.severity, "error")
  assert.equal(issue!.category, "labour")
  assert.match(issue!.evidence ?? "", /one person for one and a half days/i)
  assert.match(issue!.expected ?? "", /12 hours/i)
})

test("V03: clean Michelia quote with labour line — does NOT flag missing labour export line", () => {
  const result = auditProcessedQuote(ctx(micheliaCleanQuote(), MICHELIA_TRANSCRIPT))
  const issue = result.issues.find((i) => i.id === "V03-missing-labour-export-line")
  assert.equal(issue, undefined, "Must not flag missing labour line when labour item exists")
})

test("Michelia clean case: recovered labour line has quantity 12 hours, total 1320, no quantity-missing warning", () => {
  const quote = micheliaCleanQuote()

  const labourItem = quote.line_items.find((item) => /\blabou?r\b/i.test(item.item_type))
  assert.ok(labourItem, "Must have a labour line item")
  assert.equal(labourItem!.quantity, "12", "Labour quantity must be 12 hours")
  assert.equal(labourItem!.unit, "hours")
  assert.equal(labourItem!.total, "1320")
  assert.ok(
    !labourItem!.warning || !/quantity/i.test(labourItem!.warning),
    `Labour item must not carry a quantity-missing warning, got: "${labourItem!.warning}"`,
  )
  assert.equal(labourItem!.needs_review, false, "Recovered labour item must not need review")
})

test("Michelia clean case: missing_information does not include labour quantity/hours", () => {
  const quote = micheliaCleanQuote()
  const missingInfo = (quote as unknown as Record<string, unknown>).missing_information as string[] | undefined
  const hasLabourQtyEntry = (missingInfo ?? []).some((entry) => /labour.*quantity/i.test(entry))
  assert.equal(hasLabourQtyEntry, false, "missing_information must not include labour quantity/hours when labour is recovered")
})

// ── V04 classification conflicts (Adam/Titirangi) ────────────────────────────

test("V04: flags decking output on a non-decking transcript (Adam/Titirangi)", () => {
  const result = auditProcessedQuote(ctx(adamBadQuote(), ADAM_TRANSCRIPT))

  const issue = result.issues.find((i) => i.id === "V04-decking-on-non-decking")
  assert.ok(issue, "Must flag decking output when the transcript has no decking intent")
  assert.equal(issue!.severity, "error")
  assert.equal(issue!.category, "calculator")
  assert.match(
    `${issue!.evidence ?? ""} ${issue!.actual ?? ""}`,
    /Deck area 1|Decking boards/i,
    "V04 evidence must include a decking artefact",
  )
})

test("V04: does NOT flag when the transcript genuinely mentions decking", () => {
  const result = auditProcessedQuote(
    ctx(adamBadQuote(), "Build a new deck with decking boards and joists over the patio."),
  )
  assert.equal(
    result.issues.find((i) => i.id === "V04-decking-on-non-decking"),
    undefined,
    "Decking output is legitimate when the transcript is about decking",
  )
})

// ── V06 customer preview safety (Adam/Titirangi) ─────────────────────────────

test("V06: flags 'Plant multiple Deck area 1' in customer scope", () => {
  const result = auditProcessedQuote(ctx(adamBadQuote(), ADAM_TRANSCRIPT))

  const issue = result.issues.find((i) => i.id === "V06-decking-scope-leak")
  assert.ok(issue, "Must flag decking artefacts in customer-facing scope")
  assert.equal(issue!.category, "customer_preview")
  assert.match(issue!.evidence ?? "", /deck area 1/i)
})

test("V06: flags missing topsoil/lawn establishment when transcript mentions them", () => {
  const result = auditProcessedQuote(ctx(adamBadQuote(), ADAM_TRANSCRIPT))

  const issue = result.issues.find((i) => i.id === "V06-missing-topsoil-lawn-scope")
  assert.ok(issue, "Must flag topsoil/lawn establishment missing from the customer preview")
  assert.equal(issue!.severity, "error")
  assert.equal(issue!.category, "customer_preview")
})

test("V06: flags missing lawn seed spoken in the transcript", () => {
  const result = auditProcessedQuote(ctx(adamBadQuote(), ADAM_TRANSCRIPT))
  const issue = result.issues.find((i) => i.id === "V06-missing-lawn-seed")
  assert.ok(issue, "Must flag lawn seed omitted from customer-facing output")
  assert.equal(issue!.category, "customer_preview")
})

test("V06: flags optional Ficus hedge that is present but never calculated/warned", () => {
  const result = auditProcessedQuote(ctx(adamBadQuote(), ADAM_TRANSCRIPT))
  const issue = result.issues.find((i) => i.id === "V06-optional-hedge-unwarned")
  assert.ok(issue, "Must flag an optional hedge with no plant count/spacing calc or warning")
  assert.equal(issue!.category, "customer_preview")
})

test("V06: clean planting quote does not trip customer-preview safety", () => {
  const result = auditProcessedQuote(ctx(micheliaCleanQuote(), MICHELIA_TRANSCRIPT))
  const v06 = result.issues.filter((i) => i.id.startsWith("V06-"))
  assert.equal(v06.length, 0, `Michelia must not trip V06: ${JSON.stringify(v06.map((i) => i.id))}`)
})

// ── V08 address / suburb (Adam/Titirangi) ────────────────────────────────────

test("V08: flags missing suburb Titirangi", () => {
  const result = auditProcessedQuote(ctx(adamBadQuote(), ADAM_TRANSCRIPT))

  const issue = result.issues.find((i) => i.id === "V08-suburb-missing")
  assert.ok(issue, "Must flag suburb missing from the extracted address")
  assert.equal(issue!.severity, "warning")
  assert.equal(issue!.category, "address")
  assert.match(issue!.evidence ?? "", /20 Lemnos Street in Titirangi/i)
  assert.match(issue!.expected ?? "", /Titirangi/i)
  assert.match(issue!.actual ?? "", /missing|Not captured|Lemnos/i)
})

test("V08: does NOT flag when the suburb is already in the address", () => {
  const quote = adamBadQuote()
  ;(quote as unknown as Record<string, unknown>).site_address = "20 Lemnos Street, Titirangi"
  const result = auditProcessedQuote(ctx(quote, ADAM_TRANSCRIPT))
  assert.equal(
    result.issues.find((i) => i.id === "V08-suburb-missing"),
    undefined,
    "No V08 issue when the suburb is captured",
  )
})

test("V08: does not fire on comma-form address without an 'in <suburb>' phrase", () => {
  const result = auditProcessedQuote(ctx(micheliaCleanQuote(), MICHELIA_TRANSCRIPT))
  assert.equal(
    result.issues.find((i) => i.id === "V08-suburb-missing"),
    undefined,
    "Michelia address ('10 Cotswold Lane, Mount Wellington') must not trip V08",
  )
})
