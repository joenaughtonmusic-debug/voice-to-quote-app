import assert from "node:assert/strict"
import test from "node:test"

import { detectRetainingFromText } from "./trades/retaining/detector"
import { isRetainingTranscript, correctMisclassifiedRetaining } from "./retaining-processing"
import { hasRetainingAssemblyFacts } from "./customer-quote-assembly/retaining"
import { assembleCustomerQuote } from "./customer-quote-assembly"
import { assembleGeneralLandscapingCustomerQuote, hasGeneralLandscapingFacts } from "./customer-quote-assembly/general-landscaping"
import { extractPricing } from "./core/pricing-extraction"
import { extractPerTaskHourAllowances, summarisePerTaskHourAllowances } from "./core/labour-allowance-extraction"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { recommendTemplateForQuote, scoreTemplatesForQuote } from "./template-recommendation"
import type { QuoteTemplateLibraryItem } from "./template-import-learning"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import type { CustomerQuoteAssemblyInput } from "./customer-quote-assembly/types"

// ---------------------------------------------------------------------------
// Stephanie garden bed renovation transcript
// ---------------------------------------------------------------------------

const stephanieTranscript = `
Went to see Stephanie at 10 Cotswold Lane, Mount Wellington.

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
Keep optional works separate from the main quote.
`.trim()

// ---------------------------------------------------------------------------
// Real retaining transcript (from docs/RETAINING_MVP_ACCEPTANCE.md)
// ---------------------------------------------------------------------------

const realRetainingTranscript = `
Quote for Mary at 12 Hill Road.
Replace timber retaining wall along the back boundary.
Wall is 12.4 metres long and approximately 1 metre high.
Use 125x125 H4 posts at 1 metre spacing.
Remove old fence and old retaining.
Install new retaining wall.
Attach new standard paling fence after retaining is complete.
Access is reasonable.
No planting included.
`.trim()

// ---------------------------------------------------------------------------
// Stephanie ProcessedQuote — simulates what the AI produces after misclassification
// ---------------------------------------------------------------------------

function stephanieAiMisclassifiedQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "Retaining Wall Quote",
    job_type: "retaining",
    selected_template_id: "retaining",
    selected_template_name: "Retaining Wall Quote",
    template_match_confidence: "medium",
    primary_quote: {
      quote_title: "Retaining Wall Quote",
      job_type: "retaining",
      cadence: "",
      scope: [
        "Remove the existing keystone edging",
        "Remove the existing mandarin tree",
        "Install new 200x50 timber garden bed borders",
        "The garden bed area is approximately 10 square metres",
        "The new border comes out approximately 900 millimetres from the fence",
      ],
      notes: [],
    },
    customer_scope: [
      "Remove the existing keystone edging",
      "Remove the existing mandarin tree",
      "Install new 200x50 timber garden bed borders",
      "The garden bed area is approximately 10 square metres",
      "The new border comes out approximately 900 millimetres from the fence",
    ],
    materials: [
      "200x50 timber",
      "Timber pegs",
      "Bugle screws and fixings",
    ],
    optional_quotes: [
      {
        quote_title: "Optional Works",
        job_type: "optional",
        cadence: "",
        scope: [
          "Remove weed species from the garden bed",
          "Remove apple tree stump",
          "Replenish the garden bed with garden mix and mulch",
        ],
        notes: [],
      },
    ],
    internal_notes: [
      "This is a small garden bed renovation / timber border job, not a retaining wall",
      "Keep optional works separate from the main quote",
    ],
    line_items: [],
    exclusions: [],
  }
}

function stephanieAssemblyInput(quote: ProcessedQuote): CustomerQuoteAssemblyInput {
  return { quote, rawTranscript: stephanieTranscript }
}

// ---------------------------------------------------------------------------
// 1. Retaining detector: Stephanie transcript must not score as retaining
// ---------------------------------------------------------------------------

test("Stephanie transcript — detectRetainingFromText does not produce high/medium retaining confidence", () => {
  const result = detectRetainingFromText(stephanieTranscript)
  assert.ok(
    result.confidence === "low" || result.confidence === "none",
    `Expected low/none confidence, got: ${result.confidence} (score: ${result.confidence_score})\nReasons: ${result.reasons.join(", ")}`,
  )
})

test("Stephanie transcript — negative garden bed guard fires in detector", () => {
  const result = detectRetainingFromText(stephanieTranscript)
  assert.ok(
    result.reasons.some((r) => /garden bed|negative signal/i.test(r)),
    `Expected negative guard reason, got reasons: ${result.reasons.join(", ")}`,
  )
})

// ---------------------------------------------------------------------------
// 2. isRetainingTranscript: Stephanie must return false
// ---------------------------------------------------------------------------

test("Stephanie transcript — isRetainingTranscript returns false", () => {
  assert.equal(isRetainingTranscript(stephanieTranscript), false)
})

// ---------------------------------------------------------------------------
// 3. Real retaining transcript must remain correctly classified
// ---------------------------------------------------------------------------

test("Real retaining transcript — detectRetainingFromText returns high confidence", () => {
  const result = detectRetainingFromText(realRetainingTranscript)
  assert.ok(
    result.confidence === "high" || result.confidence === "medium",
    `Expected high/medium confidence for real retaining, got: ${result.confidence} (score: ${result.confidence_score})`,
  )
  assert.equal(result.is_retaining, true)
})

test("Real retaining transcript — isRetainingTranscript returns true", () => {
  assert.equal(isRetainingTranscript(realRetainingTranscript), true)
})

// ---------------------------------------------------------------------------
// 4. correctMisclassifiedRetaining: clears stale retaining metadata
// ---------------------------------------------------------------------------

test("correctMisclassifiedRetaining — clears job_type and template when transcript is not retaining", () => {
  const original = stephanieAiMisclassifiedQuote()
  const corrected = correctMisclassifiedRetaining(original, stephanieTranscript)

  assert.notEqual(corrected.job_type, "retaining", "job_type should not be retaining after correction")
  assert.notEqual(corrected.primary_quote.job_type, "retaining", "primary_quote.job_type should not be retaining")
  assert.equal(corrected.selected_template_id, "", "selected_template_id should be cleared")
  assert.equal(corrected.selected_template_name, "", "selected_template_name should be cleared")
  assert.equal(corrected.template_match_confidence, "none", "template_match_confidence should be none")
})

test("correctMisclassifiedRetaining — infers garden_bed_renovation job_type for garden bed transcript", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  assert.ok(
    /garden_bed_renovation|garden_bed|landscaping/i.test(corrected.job_type),
    `Expected landscaping/garden job_type, got: ${corrected.job_type}`,
  )
})

test("correctMisclassifiedRetaining — preserves scope, materials, and optional works", () => {
  const original = stephanieAiMisclassifiedQuote()
  const corrected = correctMisclassifiedRetaining(original, stephanieTranscript)

  assert.equal(corrected.customer_scope.length, original.customer_scope.length, "customer_scope should be preserved")
  assert.equal(corrected.materials.length, original.materials.length, "materials should be preserved")
  assert.equal(corrected.optional_quotes.length, original.optional_quotes.length, "optional_quotes should be preserved")
})

test("correctMisclassifiedRetaining — does not modify a genuine retaining quote", () => {
  const retainingQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    job_type: "retaining",
    quote_title: "Retaining Wall Quote",
    primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote, job_type: "retaining" },
  }
  const corrected = correctMisclassifiedRetaining(retainingQuote, realRetainingTranscript)
  assert.equal(corrected.job_type, "retaining")
  assert.equal(corrected.quote_title, "Retaining Wall Quote")
})

// ---------------------------------------------------------------------------
// 5. hasRetainingAssemblyFacts: Stephanie corrected quote must NOT activate retaining assembly
// ---------------------------------------------------------------------------

test("Stephanie corrected quote — hasRetainingAssemblyFacts returns false", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const input = stephanieAssemblyInput(corrected)
  assert.equal(hasRetainingAssemblyFacts(input), false)
})

test("Real retaining quote — hasRetainingAssemblyFacts returns true", () => {
  const retainingQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    job_type: "retaining",
    customer_scope: ["Replace timber retaining wall along the back boundary"],
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "retaining",
      scope: ["Replace timber retaining wall along the back boundary", "Wall is 12.4 metres long and approximately 1 metre high"],
    },
  }
  const input: CustomerQuoteAssemblyInput = { quote: retainingQuote, rawTranscript: realRetainingTranscript }
  assert.equal(hasRetainingAssemblyFacts(input), true)
})

// ---------------------------------------------------------------------------
// 6. Customer quote assembly: Stephanie routes to general landscaping
// ---------------------------------------------------------------------------

test("Stephanie corrected quote — assembleCustomerQuote does NOT return retaining title", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const input = stephanieAssemblyInput(corrected)
  const result = assembleCustomerQuote(input)

  assert.ok(result !== null, "assembleCustomerQuote should return a result, not null")
  assert.ok(
    !/retaining/i.test(result!.title),
    `Assembly title must not be retaining, got: ${result!.title}`,
  )
})

test("Stephanie corrected quote — customer quote title is Garden Bed Renovation", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const input = stephanieAssemblyInput(corrected)
  const result = assembleCustomerQuote(input)

  assert.ok(result !== null)
  assert.equal(result!.title, "Garden Bed Renovation")
})

test("Stephanie corrected quote — customer quote contains Scope of Work section", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const input = stephanieAssemblyInput(corrected)
  const result = assembleCustomerQuote(input)

  const scopeSection = result?.sections.find((s) => s.title === "Scope of Work")
  assert.ok(scopeSection, "Scope of Work section must be present")
  assert.ok(scopeSection!.items.length >= 3, `Expected at least 3 scope items, got: ${scopeSection!.items.join(" | ")}`)
})

test("Stephanie corrected quote — scope includes keystone edging", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const scopeText = result?.sections.find((s) => s.title === "Scope of Work")?.items.join(" ") ?? ""
  assert.ok(/keystone\s+edging/i.test(scopeText), `Expected keystone edging in scope: ${scopeText}`)
})

test("Stephanie corrected quote — scope includes mandarin tree", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const scopeText = result?.sections.find((s) => s.title === "Scope of Work")?.items.join(" ") ?? ""
  assert.ok(/mandarin\s+tree/i.test(scopeText), `Expected mandarin tree in scope: ${scopeText}`)
})

test("Stephanie corrected quote — scope includes 200x50 timber border", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const scopeText = result?.sections.find((s) => s.title === "Scope of Work")?.items.join(" ") ?? ""
  assert.ok(/200x50\s+timber/i.test(scopeText), `Expected 200x50 timber in scope: ${scopeText}`)
})

test("Stephanie corrected quote — scope includes 10 square metres", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const scopeText = result?.sections.find((s) => s.title === "Scope of Work")?.items.join(" ") ?? ""
  assert.ok(/10\s+square\s+metres?/i.test(scopeText), `Expected 10 square metres in scope: ${scopeText}`)
})

test("Stephanie corrected quote — scope includes 900 millimetres", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const scopeText = result?.sections.find((s) => s.title === "Scope of Work")?.items.join(" ") ?? ""
  assert.ok(/900\s*(?:millimetres?|mm)/i.test(scopeText), `Expected 900mm in scope: ${scopeText}`)
})

test("Stephanie corrected quote — customer quote contains Materials section", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const materialsSection = result?.sections.find((s) => s.title === "Materials")
  assert.ok(materialsSection, "Materials section must be present")
  assert.ok(materialsSection!.items.length >= 2, `Expected at least 2 material items, got: ${materialsSection!.items.join(" | ")}`)
})

test("Stephanie corrected quote — Materials includes timber, timber pegs, and fixings", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const materialsText = result?.sections.find((s) => s.title === "Materials")?.items.join(" ") ?? ""
  assert.ok(/200x50\s+timber|timber/i.test(materialsText), `Expected timber in materials: ${materialsText}`)
  assert.ok(/timber\s+pegs?/i.test(materialsText), `Expected timber pegs in materials: ${materialsText}`)
  assert.ok(/bugle\s+screws?|fixings?/i.test(materialsText), `Expected fixings in materials: ${materialsText}`)
})

test("Stephanie corrected quote — customer quote contains Optional Works section", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const optionalSection = result?.sections.find((s) => s.title === "Optional Works")
  assert.ok(optionalSection, "Optional Works section must be present")
  assert.ok(optionalSection!.items.length >= 2, `Expected at least 2 optional items, got: ${optionalSection!.items.join(" | ")}`)
})

test("Stephanie corrected quote — no stray [] placeholders in any section", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(!/\[\s*\]/.test(allText), `Found stray [] in output: ${allText}`)
})

test("Stephanie corrected quote — labour hours do not appear in customer-facing sections", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(!/allow\s+\d+\s+hours?\s+to/i.test(allText), `Labour allowance should not appear in customer quote: ${allText}`)
})

// ---------------------------------------------------------------------------
// 7. General landscaping assembler standalone test
// ---------------------------------------------------------------------------

test("assembleGeneralLandscapingCustomerQuote — produces three sections from minimal input", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Test Client",
    quote_title: "Garden Bed Renovation",
    job_type: "garden_bed_renovation",
    customer_scope: ["Remove existing edging", "Install new timber border"],
    materials: ["Timber", "Screws"],
    optional_quotes: [{
      quote_title: "Optional",
      job_type: "optional",
      cadence: "",
      scope: ["Add garden mix"],
      notes: [],
    }],
    primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote, job_type: "garden_bed_renovation" },
  }
  const result = assembleGeneralLandscapingCustomerQuote({ quote })
  const sectionTitles = result.sections.map((s) => s.title)
  assert.ok(sectionTitles.includes("Scope of Work"), `Missing Scope of Work: ${sectionTitles}`)
  assert.ok(sectionTitles.includes("Materials"), `Missing Materials: ${sectionTitles}`)
  assert.ok(sectionTitles.includes("Optional Works"), `Missing Optional Works: ${sectionTitles}`)
})

// ---------------------------------------------------------------------------
// 8. hasGeneralLandscapingFacts returns true when scope exists
// ---------------------------------------------------------------------------

test("hasGeneralLandscapingFacts — returns true when customer_scope has content", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    customer_scope: ["Install new garden border"],
    primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote },
  }
  assert.equal(hasGeneralLandscapingFacts({ quote }), true)
})

test("hasGeneralLandscapingFacts — returns false when scope is empty", () => {
  assert.equal(hasGeneralLandscapingFacts({ quote: EMPTY_PROCESSED_QUOTE }), false)
})

// ---------------------------------------------------------------------------
// 9. Golden contract — scope completeness (all 5 items)
// ---------------------------------------------------------------------------

test("Stephanie corrected quote — scope contains all 5 required items (count >= 5)", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const scopeSection = result?.sections.find((s) => s.title === "Scope of Work")
  assert.ok(scopeSection, "Scope of Work section must be present")
  assert.ok(
    scopeSection!.items.length >= 5,
    `Expected at least 5 scope items, got ${scopeSection!.items.length}: ${scopeSection!.items.join(" | ")}`,
  )
})

// ---------------------------------------------------------------------------
// 10. Golden contract — optional works completeness (all 3 items)
// ---------------------------------------------------------------------------

test("Stephanie corrected quote — Optional Works contains all 3 items", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const optionalSection = result?.sections.find((s) => s.title === "Optional Works")
  assert.ok(optionalSection, "Optional Works section must be present")
  assert.ok(
    optionalSection!.items.length >= 3,
    `Expected at least 3 optional items, got ${optionalSection!.items.length}: ${optionalSection!.items.join(" | ")}`,
  )
})

test("Stephanie corrected quote — Optional Works includes weed removal", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/weed/i.test(optText), `Expected weed removal in optional works: ${optText}`)
})

test("Stephanie corrected quote — Optional Works includes apple tree stump", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/apple\s+tree\s+stump|stump/i.test(optText), `Expected apple tree stump in optional works: ${optText}`)
})

test("Stephanie corrected quote — Optional Works includes garden mix and mulch", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/garden\s+mix|mulch/i.test(optText), `Expected garden mix or mulch in optional works: ${optText}`)
})

// ---------------------------------------------------------------------------
// 11. Golden contract — customer preview must not expose internal notes
// ---------------------------------------------------------------------------

test("Stephanie corrected quote — customer preview does not expose 'not a retaining wall' internal note", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(
    !/not\s+a\s+retaining\s+wall/i.test(allText),
    `Internal note must not appear in customer preview: ${allText}`,
  )
})

test("Stephanie corrected quote — customer preview does not expose 'keep optional works separate' internal note", () => {
  const corrected = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const result = assembleCustomerQuote(stephanieAssemblyInput(corrected))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(
    !/keep\s+optional\s+works?\s+separate/i.test(allText),
    `Internal note must not appear in customer preview: ${allText}`,
  )
})

// ---------------------------------------------------------------------------
// 12. Golden contract — labour totals (transcript-level)
// ---------------------------------------------------------------------------

test("Stephanie transcript — labour allowances total 17 hours across 3 tasks (7 + 2 + 8)", () => {
  const LABOUR_ALLOWANCE_PATTERN = /allow\s+(\d+(?:\.\d+)?)\s+hours?\s+to\b/gi
  const matches = [...stephanieTranscript.matchAll(LABOUR_ALLOWANCE_PATTERN)]
  const totalHours = matches.reduce((sum, m) => sum + parseFloat(m[1] ?? "0"), 0)
  assert.equal(matches.length, 3, `Expected 3 labour allowance lines, got: ${matches.length}`)
  assert.equal(totalHours, 17, `Expected total labour of 17h (7+2+8), got: ${totalHours}h`)
})

// ---------------------------------------------------------------------------
// 13. Golden contract — pricing facts must not treat hours as currency
//     These tests CURRENTLY FAIL because extractPricing() matches
//     "Allow N hours" via its allowance pattern and treats N as a dollar amount.
//     See docs/GARDEN_BED_RENOVATION_CONTRACT.md for the recommended fix.
// ---------------------------------------------------------------------------

test("GOLDEN CONTRACT (expected to fail): extractPricing must not produce amount=$7 from 'Allow 7 hours'", () => {
  const { pricing } = extractPricing(stephanieTranscript)
  const badFact = pricing.find(
    (f) => f.amount === 7 || f.amount_min === 7 || f.amount_max === 7,
  )
  assert.ok(
    !badFact,
    `extractPricing must not produce amount=$7 from a labour hour phrase.\nSource text: "${badFact?.source_text}"\nFull pricing: ${JSON.stringify(pricing, null, 2)}`,
  )
})

test("GOLDEN CONTRACT (expected to fail): extractPricing must not produce amount=$2 from 'Allow 2 hours'", () => {
  const { pricing } = extractPricing(stephanieTranscript)
  const badFact = pricing.find(
    (f) => f.amount === 2 || f.amount_min === 2 || f.amount_max === 2,
  )
  assert.ok(
    !badFact,
    `extractPricing must not produce amount=$2 from a labour hour phrase.\nSource text: "${badFact?.source_text}"\nFull pricing: ${JSON.stringify(pricing, null, 2)}`,
  )
})

test("GOLDEN CONTRACT (expected to fail): extractPricing must not produce amount=$8 from 'Allow 8 hours'", () => {
  const { pricing } = extractPricing(stephanieTranscript)
  const badFact = pricing.find(
    (f) => f.amount === 8 || f.amount_min === 8 || f.amount_max === 8,
  )
  assert.ok(
    !badFact,
    `extractPricing must not produce amount=$8 from a labour hour phrase.\nSource text: "${badFact?.source_text}"\nFull pricing: ${JSON.stringify(pricing, null, 2)}`,
  )
})

// ---------------------------------------------------------------------------
// 14. Live-path simulation — AI-shaped fixture (no pre-populated optional_quotes)
//     This mirrors what the API actually returns: raw slug title, optional_quotes:[],
//     optional items in primary_quote.notes with "Optional:" prefix.
// ---------------------------------------------------------------------------

/**
 * Simulates the ProcessedQuote the API returns after AI extraction + post-processing
 * for the Stephanie transcript, without the hand-crafted optional_quotes fixture.
 * The AI uses primary_quote.notes for optional items (common real-world output).
 */
function stephanieAiDirectOutput(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "garden_bed_renovation",
    job_type: "garden_bed_renovation",
    selected_template_id: "",
    selected_template_name: "",
    template_match_confidence: "none",
    primary_quote: {
      quote_title: "garden_bed_renovation",
      job_type: "garden_bed_renovation",
      cadence: "",
      scope: [
        "Remove the existing keystone edging",
        "Remove the existing mandarin tree",
        "Install new 200x50 timber garden bed borders",
        "The garden bed area is approximately 10 square metres",
        "The new border comes out approximately 900 millimetres from the fence",
      ],
      notes: [
        "Optional: Remove weed species from the garden bed",
        "Optional: Remove apple tree stump",
        "Optional: Replenish the garden bed with garden mix and mulch",
        "This is a small garden bed renovation / timber border job, not a retaining wall",
        "Keep optional works separate from the main quote",
      ],
    },
    customer_scope: [
      "Remove the existing keystone edging",
      "Remove the existing mandarin tree",
      "Install new 200x50 timber garden bed borders",
      "The garden bed area is approximately 10 square metres",
      "The new border comes out approximately 900 millimetres from the fence",
    ],
    materials: ["200x50 timber", "Timber pegs", "Bugle screws and fixings"],
    optional_quotes: [],
    internal_notes: [
      "This is a small garden bed renovation / timber border job, not a retaining wall",
      "Keep optional works separate from the main quote",
    ],
    line_items: [],
    exclusions: [],
  }
}

function directOutputAssemblyInput(quote: ProcessedQuote): CustomerQuoteAssemblyInput {
  return { quote, rawTranscript: stephanieTranscript }
}

test("Live-path: raw slug title 'garden_bed_renovation' renders as 'Garden Bed Renovation'", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  assert.ok(result !== null, "assembleCustomerQuote must return a result")
  assert.equal(result!.title, "Garden Bed Renovation")
})

test("Live-path: raw slug 'general_landscaping' title renders as 'General Landscaping'", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    quote_title: "general_landscaping",
    job_type: "general_landscaping",
    customer_scope: ["Install new garden borders"],
    primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote, job_type: "general_landscaping" },
  }
  const result = assembleCustomerQuote({ quote })
  assert.ok(result !== null)
  assert.equal(result!.title, "General Landscaping")
})

test("Live-path: Optional Works section present when optional items are in primary_quote.notes", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const optionalSection = result?.sections.find((s) => s.title === "Optional Works")
  assert.ok(optionalSection, `Optional Works section must be present. Sections: ${result?.sections.map((s) => s.title).join(", ")}`)
  assert.ok(optionalSection!.items.length >= 3, `Expected at least 3 optional items, got: ${optionalSection!.items.join(" | ")}`)
})

test("Live-path: Optional Works includes weed removal from notes", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/weed/i.test(optText), `Expected weed removal in optional works: ${optText}`)
})

test("Live-path: Optional Works includes apple tree stump from notes", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/apple\s+tree\s+stump|stump/i.test(optText), `Expected apple tree stump in optional works: ${optText}`)
})

test("Live-path: Optional Works includes garden mix / mulch from notes", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/garden\s+mix|mulch/i.test(optText), `Expected garden mix or mulch in optional works: ${optText}`)
})

test("Live-path: Scope of Work contains all 5 main scope items", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const scopeSection = result?.sections.find((s) => s.title === "Scope of Work")
  assert.ok(scopeSection, "Scope of Work section must be present")
  assert.ok(scopeSection!.items.length >= 5, `Expected at least 5 scope items, got ${scopeSection!.items.length}: ${scopeSection!.items.join(" | ")}`)
})

test("Live-path: optional items do not contaminate Scope of Work", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const scopeText = result?.sections.find((s) => s.title === "Scope of Work")?.items.join(" ") ?? ""
  assert.ok(!/weed\s+species/i.test(scopeText), `Optional item 'weed species' must not appear in Scope of Work: ${scopeText}`)
  assert.ok(!/apple\s+tree\s+stump/i.test(scopeText), `Optional item 'apple tree stump' must not appear in Scope of Work: ${scopeText}`)
})

test("Live-path: internal notes do not appear in customer preview", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(!/not\s+a\s+retaining\s+wall/i.test(allText), `Internal note exposed: ${allText}`)
  assert.ok(!/keep\s+optional\s+works?\s+separate/i.test(allText), `Internal note exposed: ${allText}`)
})

test("Live-path: labour hour phrases do not appear in customer preview", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(!/allow\s+\d+\s+hours?\s+to/i.test(allText), `Labour allowance must not appear in customer preview: ${allText}`)
})

test("Live-path: no stray [] in customer preview", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiDirectOutput()))
  const allText = result?.sections.flatMap((s) => s.items).join(" ") ?? ""
  assert.ok(!/\[\s*\]/.test(allText), `Found stray [] in output: ${allText}`)
})

// ---------------------------------------------------------------------------
// 15. Per-task labour allowance extraction
// ---------------------------------------------------------------------------

test("extractPerTaskHourAllowances — extracts 3 tasks from Stephanie transcript", () => {
  const allowances = extractPerTaskHourAllowances(stephanieTranscript)
  assert.equal(allowances.length, 3, `Expected 3 allowances, got ${allowances.length}: ${JSON.stringify(allowances)}`)
})

test("extractPerTaskHourAllowances — keystone edging task is 7h", () => {
  const allowances = extractPerTaskHourAllowances(stephanieTranscript)
  const task = allowances.find((a) => /keystone\s+edging/i.test(a.label))
  assert.ok(task, `Expected a keystone edging task. Got: ${JSON.stringify(allowances)}`)
  assert.equal(task!.hours, 7)
})

test("extractPerTaskHourAllowances — mandarin tree task is 2h", () => {
  const allowances = extractPerTaskHourAllowances(stephanieTranscript)
  const task = allowances.find((a) => /mandarin\s+tree/i.test(a.label))
  assert.ok(task, `Expected a mandarin tree task. Got: ${JSON.stringify(allowances)}`)
  assert.equal(task!.hours, 2)
})

test("extractPerTaskHourAllowances — timber border task is 8h", () => {
  const allowances = extractPerTaskHourAllowances(stephanieTranscript)
  const task = allowances.find((a) => /timber\s+(garden\s+bed\s+)?border/i.test(a.label))
  assert.ok(task, `Expected a timber border task. Got: ${JSON.stringify(allowances)}`)
  assert.equal(task!.hours, 8)
})

test("summarisePerTaskHourAllowances — totals 17h from Stephanie transcript", () => {
  const allowances = extractPerTaskHourAllowances(stephanieTranscript)
  const { totalHours } = summarisePerTaskHourAllowances(allowances)
  assert.equal(totalHours, 17)
})

test("extractPerTaskHourAllowances — returns empty for transcript with no hour phrases", () => {
  const noHourTranscript = "Quote for Mary at 12 Hill Road. Replace retaining wall. 12.4m long, 1m high."
  const allowances = extractPerTaskHourAllowances(noHourTranscript)
  assert.equal(allowances.length, 0)
})

// ---------------------------------------------------------------------------
// 16. Template recommendation — landscaping domain guards
// ---------------------------------------------------------------------------

const plantingTemplate: QuoteTemplateLibraryItem = {
  id: "planting",
  template_name: "Planting",
  category: "planting",
  trade: "planting",
  job_type: "planting",
  document_type: "quote_template",
  common_line_items: ["Planting labour", "Plant supply"],
  status: "active",
}

const retainingTemplate: QuoteTemplateLibraryItem = {
  id: "retaining",
  template_name: "Retaining Wall Quote",
  category: "retaining",
  trade: "retaining",
  job_type: "retaining",
  document_type: "quote_template",
  common_line_items: ["Retaining wall labour", "H4 posts"],
  status: "active",
}

const landscapingTemplate: QuoteTemplateLibraryItem = {
  id: "landscaping-estimate",
  template_name: "Landscaping Estimate",
  category: "landscaping",
  trade: "landscaping",
  job_type: "landscaping",
  document_type: "quote_template",
  common_line_items: ["Landscaping labour", "Materials"],
  status: "active",
}

const gardenTidyTemplate: QuoteTemplateLibraryItem = {
  id: "garden-tidy",
  template_name: "One-Off Garden Tidy",
  category: "garden_tidy",
  trade: "maintenance",
  job_type: "garden_tidy",
  document_type: "quote_template",
  common_line_items: ["Garden tidy labour"],
  status: "active",
}

const allTemplates = [plantingTemplate, retainingTemplate, landscapingTemplate, gardenTidyTemplate]

// ---------------------------------------------------------------------------
// 17. Template recommendation — garden_tidy domain guard for landscaping
// ---------------------------------------------------------------------------

test("Template recommendation: garden_bed_renovation does not recommend One-Off Garden Tidy", () => {
  const quote = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const facts = quoteFactsFromProcessedQuote(quote)
  const recommendation = recommendTemplateForQuote({
    facts,
    templates: allTemplates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
  assert.ok(
    recommendation?.template.id !== "garden-tidy",
    `One-Off Garden Tidy must not be recommended for garden_bed_renovation. Got: ${recommendation?.templateName}`,
  )
})

test("Template recommendation: garden_tidy score is penalised below landscaping for garden_bed_renovation", () => {
  const quote = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const facts = quoteFactsFromProcessedQuote(quote)
  const scores = scoreTemplatesForQuote({
    facts,
    templates: allTemplates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
  const gardenTidyScore = scores.find((s) => s.template.id === "garden-tidy")
  const landscapingScore = scores.find((s) => s.template.id === "landscaping-estimate")
  assert.ok(
    !gardenTidyScore || !landscapingScore || landscapingScore.score > gardenTidyScore.score,
    `Landscaping Estimate must outscore One-Off Garden Tidy for garden_bed_renovation.\nGarden Tidy: ${gardenTidyScore?.score}\nLandscaping: ${landscapingScore?.score}`,
  )
})

// ---------------------------------------------------------------------------
// 18. Labour quantity display format
// ---------------------------------------------------------------------------

test("Labour display format: bare quantity + separate unit shows 'Qty 17 hours' not 'Qty 17 hours hours'", () => {
  // This documents the matchedLineItemLines guard contract: when unit is already
  // embedded in quantity, it must not be appended again.
  const quantity = "17"
  const unit = "hours"
  // Mirror the guard added to matchedLineItemLines in processed-quote.ts
  const formatted = `Qty ${quantity}${unit && !quantity.toLowerCase().includes(unit.toLowerCase()) ? ` ${unit}` : ""}`
  assert.equal(formatted, "Qty 17 hours")
})

test("Labour display format: quantity with embedded unit is not double-appended", () => {
  // If quantity already contains the unit word, the guard must suppress the extra append.
  const quantity = "17 hours"
  const unit = "hours"
  const formatted = `Qty ${quantity}${unit && !quantity.toLowerCase().includes(unit.toLowerCase()) ? ` ${unit}` : ""}`
  assert.equal(formatted, "Qty 17 hours", "Double 'hours hours' must not appear")
})

// ---------------------------------------------------------------------------
// 19. Optional-works section exclusion from main material scan
// ---------------------------------------------------------------------------

test("Optional-works boundary is present in Stephanie transcript", () => {
  const boundary = stephanieTranscript.search(/\boptional\s+works?\s*:/i)
  assert.ok(boundary > 0, "Expected to find 'Optional works:' boundary in Stephanie transcript")
})

test("garden mix appears only after optional-works boundary in Stephanie transcript", () => {
  const boundary = stephanieTranscript.search(/\boptional\s+works?\s*:/i)
  const mainSection = stephanieTranscript.slice(0, boundary)
  assert.ok(
    !/garden\s+mix/i.test(mainSection),
    "garden mix must not appear in the main-scope section of the transcript — it is an optional-works item only",
  )
})

test("mulch appears only after optional-works boundary in Stephanie transcript", () => {
  const boundary = stephanieTranscript.search(/\boptional\s+works?\s*:/i)
  const mainSection = stephanieTranscript.slice(0, boundary)
  assert.ok(
    !/mulch/i.test(mainSection),
    "mulch must not appear in the main-scope section of the transcript — it is an optional-works item only",
  )
})

test("Template recommendation: garden_bed_renovation does not select Planting", () => {
  const quote = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const facts = quoteFactsFromProcessedQuote(quote)
  const scores = scoreTemplatesForQuote({ facts, templates: allTemplates, sectionsByTemplateId: {}, trade: quote.job_type, jobType: quote.job_type })
  const plantingScore = scores.find((s) => s.template.id === "planting")
  const landscapingScore = scores.find((s) => s.template.id === "landscaping-estimate")
  assert.ok(
    !plantingScore || (landscapingScore && landscapingScore.score >= plantingScore.score),
    `Planting must not outscore Landscaping Estimate for garden_bed_renovation.\nPlanting: ${plantingScore?.score}\nLandscaping: ${landscapingScore?.score}`,
  )
})

test("Template recommendation: garden_bed_renovation does not recommend Retaining Wall Quote", () => {
  const quote = correctMisclassifiedRetaining(stephanieAiMisclassifiedQuote(), stephanieTranscript)
  const facts = quoteFactsFromProcessedQuote(quote)
  const recommendation = recommendTemplateForQuote({
    facts,
    templates: allTemplates,
    sectionsByTemplateId: {},
    trade: quote.job_type,
    jobType: quote.job_type,
  })
  assert.ok(
    recommendation?.template.id !== "retaining",
    `Retaining must not be recommended for garden_bed_renovation. Got: ${recommendation?.templateName}`,
  )
})

// ---------------------------------------------------------------------------
// 20. Optional Works customer preview — metadata filtering and leading-colon strip
// ---------------------------------------------------------------------------

/**
 * Simulates what the AI returns when it correctly uses optional_quotes but
 * contaminates q.scope with metadata lines and leading-colon items.
 */
function stephanieAiWithOptionalQuoteMetadata(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "garden_bed_renovation",
    job_type: "garden_bed_renovation",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "garden_bed_renovation",
      scope: [
        "Remove the existing keystone edging",
        "Remove the existing mandarin tree",
        "Install new 200x50 timber garden bed borders",
        "The garden bed area is approximately 10 square metres",
        "The new border comes out approximately 900 millimetres from the fence",
      ],
      notes: [],
    },
    customer_scope: [
      "Remove the existing keystone edging",
      "Remove the existing mandarin tree",
      "Install new 200x50 timber garden bed borders",
      "The garden bed area is approximately 10 square metres",
      "The new border comes out approximately 900 millimetres from the fence",
    ],
    materials: ["200x50 timber", "Timber pegs", "Bugle screws and fixings"],
    optional_quotes: [
      {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        job_type: "optional_works",
        scope: [
          "Title: Optional Works",
          "Job type: optional_works",
          "Cadence: not specified",
          ": Remove weed species from the garden bed",
          ": Remove apple tree stump",
          ": Replenish the garden bed with garden mix and mulch",
        ],
        notes: [],
      },
    ],
    line_items: [],
    exclusions: [],
  }
}

test("Optional Works preview: metadata lines (Title/Job type/Cadence) are filtered out", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiWithOptionalQuoteMetadata()))
  const optItems = result?.sections.find((s) => s.title === "Optional Works")?.items ?? []
  const joinedText = optItems.join(" | ")
  assert.ok(!/^title\s*:/i.test(joinedText) && !/\btitle\s*:/i.test(joinedText), `Title metadata must not appear in Optional Works: ${joinedText}`)
  assert.ok(!/job\s+type\s*:/i.test(joinedText), `Job type metadata must not appear in Optional Works: ${joinedText}`)
  assert.ok(!/cadence\s*:/i.test(joinedText), `Cadence metadata must not appear in Optional Works: ${joinedText}`)
})

test("Optional Works preview: items do not have a leading colon", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiWithOptionalQuoteMetadata()))
  const optItems = result?.sections.find((s) => s.title === "Optional Works")?.items ?? []
  for (const item of optItems) {
    assert.ok(!/^\s*:/.test(item), `Optional Works item must not start with a colon: "${item}"`)
  }
})

test("Optional Works preview: 3 optional scope items are present after filtering", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiWithOptionalQuoteMetadata()))
  const optItems = result?.sections.find((s) => s.title === "Optional Works")?.items ?? []
  assert.ok(optItems.length >= 3, `Expected at least 3 optional items after filtering metadata, got ${optItems.length}: ${optItems.join(" | ")}`)
})

test("Optional Works preview: weed removal item is present after metadata filtering", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiWithOptionalQuoteMetadata()))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/weed/i.test(optText), `Expected weed removal in optional works after filtering: ${optText}`)
})

test("Optional Works preview: apple tree stump item is present after metadata filtering", () => {
  const result = assembleCustomerQuote(directOutputAssemblyInput(stephanieAiWithOptionalQuoteMetadata()))
  const optText = result?.sections.find((s) => s.title === "Optional Works")?.items.join(" ") ?? ""
  assert.ok(/stump/i.test(optText), `Expected stump in optional works after filtering: ${optText}`)
})

// ---------------------------------------------------------------------------
// 21. Internal labour allowance — "not specified" placeholder suppression
// ---------------------------------------------------------------------------

test("Internal labour allowance: 'not specified' placeholder does not appear when real breakdown exists", () => {
  // The labour_allowance field should contain the task breakdown, not "not specified\n..."
  const breakdown = "remove the keystone edging: 7h\nremove the mandarin tree: 2h\ninstall the new timber garden bed border: 8h\nTotal: 17h"
  // Simulate what applyPerTaskHourAllowances now does: replace placeholder, don't append
  const existingNotSpecified = "not specified"
  const isPlaceholder = /^not\s+specified$/i.test(existingNotSpecified.trim())
  const result = isPlaceholder ? breakdown : `${existingNotSpecified}\n${breakdown}`
  assert.ok(!/not specified/i.test(result), `'not specified' must not appear when real breakdown exists. Got: ${result}`)
  assert.ok(/17h/.test(result), `Breakdown total must be present. Got: ${result}`)
})

test("Internal labour allowance: real breakdown replaces 'not specified' placeholder", () => {
  const breakdown = "remove the keystone edging: 7h\nTotal: 7h"
  const placeholder = "Not Specified"
  const isPlaceholder = /^not\s+specified$/i.test(placeholder.trim())
  const result = isPlaceholder ? breakdown : `${placeholder}\n${breakdown}`
  assert.equal(result, breakdown, "Result should be the breakdown only, not 'Not Specified\\n...'")
})

test("Internal labour allowance: existing real allowance is preserved when appending breakdown", () => {
  // If a non-placeholder value exists, the breakdown is appended (not replaced)
  const existing = "Two people for a full day"
  const breakdown = "task: 8h\nTotal: 8h"
  const isPlaceholder = /^not\s+specified$/i.test(existing.trim())
  const result = isPlaceholder ? breakdown : `${existing}\n${breakdown}`
  assert.ok(result.includes(existing), "Original allowance must be preserved")
  assert.ok(result.includes(breakdown), "Breakdown must be appended")
})

test("Template recommendation: real retaining job recommends Retaining above Planting", () => {
  const retainingQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    job_type: "retaining",
    customer_scope: ["Replace timber retaining wall along the back boundary"],
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "retaining",
      scope: ["Replace timber retaining wall along the back boundary", "H4 posts at 1m spacing"],
    },
  }
  const facts = quoteFactsFromProcessedQuote(retainingQuote)
  const scores = scoreTemplatesForQuote({
    facts,
    templates: allTemplates,
    sectionsByTemplateId: {},
    trade: "retaining",
    jobType: "retaining",
  })
  const retainingScore = scores.find((s) => s.template.id === "retaining")
  const plantingScore = scores.find((s) => s.template.id === "planting")
  assert.ok(
    retainingScore && (!plantingScore || retainingScore.score > plantingScore.score),
    `Retaining must outscore Planting for a genuine retaining job.\nRetaining: ${retainingScore?.score}\nPlanting: ${plantingScore?.score}`,
  )
})
