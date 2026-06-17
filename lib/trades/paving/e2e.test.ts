import assert from "node:assert/strict"
import test from "node:test"
import { quoteFactsFromProcessedQuote } from "../../core/quote-facts"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"

function pavingProcessedQuote(scope: string[]): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Lisa",
    site_address: "5 Garden Lane",
    quote_title: "Paving Quote",
    job_type: "Paving",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Paving Quote",
      job_type: "Paving",
      scope,
      notes: [],
    },
  }
}

const pavingScope = [
  "Lay 450x450 concrete pavers over a 3.5m x 6m patio.",
  "Top up basecourse and compact.",
  "Remove old pavers.",
]

test("paving end-to-end QuoteFacts pipeline produces paving area fact with correct calculator outputs", () => {
  const facts = quoteFactsFromProcessedQuote(pavingProcessedQuote(pavingScope))
  const pavingFacts = facts.filter((f) => f.metadata?.trade === "paving")
  const areaFact = pavingFacts.find((f) => f.metadata?.fact_type === "paving_area")

  assert.ok(pavingFacts.length > 0, "Expected paving facts to be produced")
  assert.ok(areaFact, "Expected a paving_area fact")
  assert.equal(areaFact.category, "job_scope")
  assert.equal(areaFact.quantity, 21)
  assert.equal(areaFact.unit, "m2")
  assert.equal(areaFact.metadata?.paved_area_m2, 21)
  assert.equal(areaFact.metadata?.paver_count, 115)
  assert.equal(areaFact.metadata?.base_course_volume_m3, 2.1)
  assert.equal(areaFact.metadata?.bedding_sand_volume_m3, 0.63)
  assert.equal(areaFact.metadata?.estimated_labour_hours, 31.5)
  assert.equal(areaFact.metadata?.paver_length_mm, 450)
  assert.equal(areaFact.metadata?.paver_width_mm, 450)
})

test("paving end-to-end produces a waste_removal fact when removal is mentioned", () => {
  const facts = quoteFactsFromProcessedQuote(pavingProcessedQuote(pavingScope))
  const wasteFact = facts.find((f) => f.metadata?.trade === "paving" && f.metadata?.fact_type === "waste_removal")

  assert.ok(wasteFact, "Expected a waste_removal fact")
  assert.equal(wasteFact.category, "waste")
})

test("non-paving quote does not produce paving facts", () => {
  const quote = pavingProcessedQuote(["Install six downlights and two power points."])
  const facts = quoteFactsFromProcessedQuote({ ...quote, job_type: "Electrical" })

  assert.equal(facts.some((f) => f.metadata?.trade === "paving"), false)
})

test("paving facts do not pollute decking or retaining facts", () => {
  const facts = quoteFactsFromProcessedQuote(pavingProcessedQuote(pavingScope))

  assert.equal(facts.some((f) => f.metadata?.trade === "decking"), false)
  assert.equal(facts.some((f) => f.metadata?.trade === "retaining"), false)
})
