import assert from "node:assert/strict"
import test from "node:test"
import { quoteFactsFromProcessedQuote } from "../../core/quote-facts"
import { buildCustomerQuotePreview, type CustomerPreviewQuote } from "../../customer-quote-preview"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import { buildXeroQuotePayload } from "../../xero-quote-payload"

function retainingProcessedQuote(scope: string[]): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Renee",
    site_address: "22 Bank Street",
    quote_title: "Retaining Quote",
    job_type: "Retaining",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      scope,
      notes: [],
    },
  }
}

function retainingPreviewQuote(scope: string[]): CustomerPreviewQuote {
  return {
    line_items: [],
    client_name: "Renee",
    site_address: "22 Bank Street",
    quote_title: "Retaining Quote",
    job_type: "Retaining",
    primary_quote: {
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      scope,
      notes: [],
    },
  } as CustomerPreviewQuote
}

const retainingScope = [
  "Replace existing timber retaining wall.",
  "One wall 8m long and 800mm high, second wall 4m long and 600mm high.",
  "Include drainage behind wall.",
  "Remove old wall waste.",
  "Access is difficult.",
]

test("retaining end-to-end baseline runs through QuoteFacts, customer preview, and Xero export", () => {
  const facts = quoteFactsFromProcessedQuote(retainingProcessedQuote(retainingScope))
  const retainingFacts = facts.filter((fact) => fact.metadata?.trade === "retaining")
  const wallFacts = retainingFacts.filter((fact) => fact.metadata?.fact_type === "retaining_wall_section")
  const totalFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "total_retaining_face_area")
  const drainageFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "drainage_note")
  const wasteFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "waste_removal")
  const accessFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "access_note")

  assert.equal(wallFacts.length, 2)
  assert.equal(wallFacts[0].metadata?.square_metres, 6.4)
  assert.equal(wallFacts[1].metadata?.square_metres, 2.4)
  assert.equal(totalFact?.metadata?.square_metres, 8.8)
  assert.equal(wallFacts[0].metadata?.replacement, true)
  assert.equal(wallFacts[0].metadata?.wall_type, "timber_retaining")
  assert.equal(wallFacts[0].metadata?.drainage, true)
  assert.equal(wallFacts[0].metadata?.waste_removal, true)
  assert.equal(wallFacts[0].metadata?.access_difficulty, true)
  assert.equal(drainageFact?.metadata?.drainage, true)
  assert.equal(wasteFact?.metadata?.waste_removal, true)
  assert.equal(accessFact?.metadata?.access_difficulty, true)

  const preview = buildCustomerQuotePreview(retainingPreviewQuote(retainingScope), { includeRetainingScope: true })
  assert.deepEqual(preview.scopeItems, [
    "Replace existing timber retaining wall approximately 8m long x 800mm high, total 6.4m².",
    "Replace existing timber retaining wall approximately 4m long x 600mm high, total 2.4m².",
    "Total retaining wall face area approximately 8.8m².",
    "Include drainage behind retaining wall where specified.",
    "Allow for noted access constraints.",
    "Remove old wall waste.",
  ])

  const payload = buildXeroQuotePayload(
    {
      client_name: "Renee",
      site_address: "22 Bank Street",
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      line_items: [],
      primary_quote: {
        quote_title: "Retaining Quote",
        scope: retainingScope,
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "960", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "961", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "waste", account_code: "962", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.AccountCode, item.TaxType]),
    [
      [
        "Retaining labour / installation - Wall 1: 8m x 0.8m (6.4m2), replacement; Wall 2: 4m x 0.6m (2.4m2), replacement",
        1,
        0,
        "960",
        "OUTPUT2",
      ],
      [
        "Retaining materials - Wall 1: 8m x 0.8m (6.4m2), replacement; Wall 2: 4m x 0.6m (2.4m2), replacement",
        8.8,
        0,
        "961",
        "OUTPUT2",
      ],
      ["Retaining drainage materials", 1, 0, "961", "OUTPUT2"],
      ["Retaining waste/removal - Remove old wall waste", 1, 0, "962", "OUTPUT2"],
    ],
  )
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes("No export mapping set")), false)
})

test("non-retaining end-to-end path does not produce retaining facts, preview, or export lines", () => {
  const scope = ["Install six downlights and two power points."]
  const facts = quoteFactsFromProcessedQuote({
    ...retainingProcessedQuote(scope),
    job_type: "Electrical",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Electrical Quote",
      job_type: "Electrical",
      scope,
      notes: [],
    },
  })
  const standardPreview = buildCustomerQuotePreview(retainingPreviewQuote(scope))
  const preview = buildCustomerQuotePreview(retainingPreviewQuote(scope), { includeRetainingScope: true })
  const payload = buildXeroQuotePayload({
    client_name: "Eli",
    site_address: "3 Light Lane",
    quote_title: "Electrical Quote",
    job_type: "Electrical",
    line_items: [],
    customer_scope: ["Install six downlights and two power points."],
    primary_quote: {
      quote_title: "Electrical Quote",
      scope,
      notes: [],
    },
  })

  assert.equal(facts.some((fact) => fact.metadata?.trade === "retaining"), false)
  assert.deepEqual(preview.scopeItems, standardPreview.scopeItems)
  assert.equal(payload.quote.xeroLineItemsArray.some((item) => /retaining/i.test(item.Description)), false)
})
