import assert from "node:assert/strict"
import test from "node:test"
import { buildCustomerQuotePreview } from "../../customer-quote-preview"
import { quoteFactsFromProcessedQuote } from "../../core/quote-facts"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import { buildXeroQuotePayload } from "../../xero-quote-payload"

function steveDeckingQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Steve",
    site_address: "12 Oak Road",
    quote_title: "Decking Quote",
    job_type: "Decking",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Decking Quote",
      job_type: "Decking",
      scope: [
        "Build a 4m x 5m pine deck.",
        "Add a second deck area, decking boards only, on a 3m x 4m section where existing posts and subframe are retained.",
        "Remove old decking waste.",
      ],
    },
  }
}

test("decking end-to-end baseline runs through QuoteFacts, customer preview, and Xero export", () => {
  const quote = steveDeckingQuote()
  const facts = quoteFactsFromProcessedQuote(quote)
  const deckingFacts = facts.filter((fact) => fact.metadata?.trade === "decking")
  const areaFacts = deckingFacts.filter((fact) => fact.metadata?.fact_type === "deck_area")
  const totalArea = deckingFacts.find((fact) => fact.metadata?.fact_type === "total_deck_area")
  const wasteFact = deckingFacts.find((fact) => fact.metadata?.fact_type === "waste_removal")

  assert.equal(areaFacts.length, 2)
  assert.equal(areaFacts[0].metadata?.square_metres, 20)
  assert.equal(areaFacts[1].metadata?.square_metres, 12)
  assert.equal(areaFacts[1].metadata?.build_scope, "decking_boards_only")
  assert.equal(areaFacts[1].metadata?.existing_posts, "yes")
  assert.equal(areaFacts[1].metadata?.existing_subframe, "yes")
  assert.equal(totalArea?.metadata?.square_metres, 32)
  assert.equal(wasteFact?.category, "waste")

  const preview = buildCustomerQuotePreview(quote, { includeDeckingScope: true })
  assert.equal(preview.scopeItems.some((item) => /4m x 5m.*20m²/i.test(item)), true)
  assert.equal(preview.scopeItems.some((item) => /3m x 4m.*12m².*decking boards only/i.test(item)), true)
  assert.equal(preview.scopeItems.some((item) => /existing posts retained.*existing subframe retained/i.test(item)), true)
  assert.equal(preview.scopeItems.some((item) => /Total decking area approximately 32m²/i.test(item)), true)
  assert.equal(preview.scopeItems.some((item) => /Remove old decking waste/i.test(item)), true)

  const payload = buildXeroQuotePayload(quote, {
    now: new Date("2026-06-07T00:00:00.000Z"),
    exportMappings: [
      { category: "labour", account_code: "910", tax_type: "OUTPUT2", is_user_confirmed: true },
      { category: "materials", account_code: "911", tax_type: "OUTPUT2", is_user_confirmed: true },
      { category: "waste", account_code: "912", tax_type: "OUTPUT2", is_user_confirmed: true },
    ],
  })
  const labourLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Decking labour"))
  const materialsLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Decking materials"))
  const wasteLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Decking waste/removal"))

  assert.ok(labourLine)
  assert.ok(materialsLine)
  assert.ok(wasteLine)
  assert.equal(materialsLine.Quantity, 32)
  assert.match(materialsLine.Description, /32m2|20m2.*12m2/i)
  assert.equal(labourLine.AccountCode, "910")
  assert.equal(materialsLine.AccountCode, "911")
  assert.equal(wasteLine.AccountCode, "912")
})

test("non-decking end-to-end path does not produce decking facts, preview, or export lines", () => {
  const quote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Eli",
    site_address: "8 Light Street",
    quote_title: "Electrical Quote",
    job_type: "Electrical",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Electrical Quote",
      job_type: "Electrical",
      scope: ["Install six downlights and two power points."],
    },
  }

  const facts = quoteFactsFromProcessedQuote(quote)
  const preview = buildCustomerQuotePreview(quote, { includeDeckingScope: true })
  const payload = buildXeroQuotePayload(quote, { now: new Date("2026-06-07T00:00:00.000Z") })

  assert.equal(facts.some((fact) => fact.metadata?.trade === "decking"), false)
  assert.equal(preview.scopeItems.some((item) => /deck/i.test(item)), false)
  assert.equal(payload.quote.xeroLineItemsArray.some((item) => /deck/i.test(item.Description)), false)
})
