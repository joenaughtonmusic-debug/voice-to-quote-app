import assert from "node:assert/strict"
import test from "node:test"
import { quoteFactsFromProcessedQuote } from "../../core/quote-facts"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import { retainingReviewFromQuoteFacts } from "./review"

function retainingQuote(scope: string[], jobType = "Retaining"): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Renee",
    site_address: "22 Bank Street",
    quote_title: "Retaining Quote",
    job_type: jobType,
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      quote_title: "Retaining Quote",
      job_type: jobType,
      scope,
    },
  }
}

test("derives single-wall retaining review data from QuoteFacts", () => {
  const facts = quoteFactsFromProcessedQuote(retainingQuote(["Build a 10m long retaining wall, 600mm high."]))
  const review = retainingReviewFromQuoteFacts(facts)

  assert.equal(review?.detected, true)
  assert.equal(review?.sections.length, 1)
  assert.equal(review?.sections[0].dimensionsText, "10m x 600mm")
  assert.equal(review?.sections[0].areaText, "6m²")
  assert.equal(review?.totalAreaText, undefined)
  assert.equal(review?.wallKindText, "New retaining wall")
})

test("derives multiple retaining wall sections from QuoteFacts", () => {
  const facts = quoteFactsFromProcessedQuote(
    retainingQuote(["One wall 8m long and 800mm high, second wall 4m long and 600mm high."]),
  )
  const review = retainingReviewFromQuoteFacts(facts)

  assert.equal(review?.sections.length, 2)
  assert.equal(review?.sections[0].dimensionsText, "8m x 800mm")
  assert.equal(review?.sections[0].areaText, "6.4m²")
  assert.equal(review?.sections[1].dimensionsText, "4m x 600mm")
  assert.equal(review?.sections[1].areaText, "2.4m²")
  assert.equal(review?.totalAreaText, "8.8m²")
})

test("derives replacement drainage waste access and posts flags from QuoteFacts", () => {
  const facts = quoteFactsFromProcessedQuote(
    retainingQuote([
      "Replace existing timber retaining wall.",
      "One wall 8m long and 800mm high, second wall 4m long and 600mm high.",
      "Include drainage and posts.",
      "Remove old wall waste.",
      "Access is difficult.",
    ]),
  )
  const review = retainingReviewFromQuoteFacts(facts)

  assert.equal(review?.wallKindText, "Replacement retaining wall")
  assert.equal(review?.timberRetaining, true)
  assert.equal(review?.drainageMentioned, true)
  assert.equal(review?.postsMentioned, true)
  assert.equal(review?.accessDifficulty, true)
  assert.deepEqual(review?.wasteRemovalNotes, ["Remove old wall waste"])
})

test("non-retaining quote does not produce retaining review data", () => {
  const review = retainingReviewFromQuoteFacts(
    quoteFactsFromProcessedQuote(retainingQuote(["Install six downlights and two power points."], "Electrical")),
  )

  assert.equal(review, null)
})
