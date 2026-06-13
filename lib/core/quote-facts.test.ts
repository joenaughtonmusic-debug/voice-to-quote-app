import assert from "node:assert/strict"
import test from "node:test"
import type { ProcessedQuote } from "../processed-quote"
import { EMPTY_PROCESSED_QUOTE } from "../processed-quote"
import { quoteFactsFromProcessedQuote } from "./quote-facts"
import { buildTradeQuoteFacts, quoteFactContributors } from "../trades/registry"

function quoteWithScope(scope: string[], overrides: Partial<ProcessedQuote> = {}): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Steve",
    site_address: "12 Oak Road",
    quote_title: "Quote",
    job_type: "decking",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Quote",
      job_type: "decking",
      scope,
    },
    ...overrides,
  }
}

function deckingFacts(quote: ProcessedQuote) {
  return quoteFactsFromProcessedQuote(quote).filter((fact) => fact.metadata?.trade === "decking")
}

test("decking transcript produces calculated decking QuoteFacts", () => {
  const facts = deckingFacts(quoteWithScope(["Construct a 4m x 5m pine deck."]))
  const deckArea = facts.find((fact) => fact.metadata?.fact_type === "deck_area")

  assert.ok(deckArea)
  assert.equal(deckArea.category, "job_scope")
  assert.equal(deckArea.quantity, 20)
  assert.equal(deckArea.unit, "m2")
  assert.equal(deckArea.metadata?.length_m, 4)
  assert.equal(deckArea.metadata?.width_m, 5)
  assert.equal(deckArea.metadata?.square_metres, 20)
  assert.equal(deckArea.metadata?.build_scope, "full_build")
})

test("multiple decking areas produce section and total QuoteFacts", () => {
  const facts = deckingFacts(
    quoteWithScope([
      "Build a 4m x 5m pine deck.",
      "Also replace decking boards on a 3m x 4m section where posts already exist.",
      "Remove old decking waste.",
    ]),
  )
  const deckAreas = facts.filter((fact) => fact.metadata?.fact_type === "deck_area")
  const totalArea = facts.find((fact) => fact.metadata?.fact_type === "total_deck_area")
  const waste = facts.find((fact) => fact.metadata?.fact_type === "waste_removal")

  assert.equal(deckAreas.length, 2)
  assert.equal(deckAreas[0].metadata?.square_metres, 20)
  assert.equal(deckAreas[1].metadata?.square_metres, 12)
  assert.equal(deckAreas[1].metadata?.build_scope, "decking_boards_only")
  assert.equal(deckAreas[1].metadata?.existing_posts, "yes")
  assert.equal(totalArea?.metadata?.square_metres, 32)
  assert.equal(waste?.category, "waste")
  assert.match(waste?.description ?? "", /old decking waste/i)
})

test("non-decking transcript does not produce decking QuoteFacts", () => {
  const facts = deckingFacts(
    quoteWithScope(["Install six downlights and two power points."], {
      job_type: "electrical",
      primary_quote: {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        job_type: "electrical",
        scope: ["Install six downlights and two power points."],
      },
    }),
  )

  assert.equal(facts.length, 0)
})

test("trade QuoteFacts registry adds nothing for non-matching trades", () => {
  const quote = quoteWithScope(["Install six downlights and two power points."], {
    job_type: "electrical",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "electrical",
      scope: ["Install six downlights and two power points."],
    },
  })

  assert.deepEqual(buildTradeQuoteFacts(quote), [])
})

test("planting QuoteFacts are not polluted by decking facts", () => {
  const quote = quoteWithScope(["Plant multiple Ficus Tuffi along lower planting area."], {
    client_name: "Simon",
    job_type: "planting",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      job_type: "planting",
      scope: ["Plant multiple Ficus Tuffi along lower planting area."],
    },
    quote_options: [
      {
        id: "plant-option-1",
        label: "Option A",
        title: "Ficus Tuffi 25L",
        category: "planting",
        source: "plant_calculator",
        lineItems: [],
        subtotal: 0,
      },
    ],
  })
  const facts = quoteFactsFromProcessedQuote(quote)

  assert.equal(facts.some((fact) => fact.category === "plants" && /Ficus Tuffi 25L/i.test(fact.description)), true)
  assert.equal(facts.some((fact) => fact.metadata?.trade === "decking"), false)
})

test("trade QuoteFacts contributor ordering is stable after universal facts", () => {
  const quote = quoteWithScope(["Construct a 4m x 5m pine deck."])
  const facts = quoteFactsFromProcessedQuote(quote)
  const universalScopeIndex = facts.findIndex((fact) => fact.sourceField === "primary_quote.scope")
  const deckingIndex = facts.findIndex((fact) => fact.sourceField === "decking.calculator.areas")

  assert.deepEqual(quoteFactContributors.map((contributor) => contributor.tradeId), ["decking", "retaining"])
  assert.equal(universalScopeIndex >= 0, true)
  assert.equal(deckingIndex > universalScopeIndex, true)
})
