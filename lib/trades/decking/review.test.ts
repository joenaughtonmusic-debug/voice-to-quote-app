import assert from "node:assert/strict"
import test from "node:test"
import { quoteFactsFromProcessedQuote } from "../../core/quote-facts"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../../processed-quote"
import { deckingReviewFromQuoteFacts } from "./review"

function deckingQuote(scope: string[]): ProcessedQuote {
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
      scope,
    },
  }
}

test("derives single-area decking review data from QuoteFacts", () => {
  const facts = quoteFactsFromProcessedQuote(deckingQuote(["Construct a 4m x 5m pine deck."]))
  const review = deckingReviewFromQuoteFacts(facts)

  assert.equal(review?.detected, true)
  assert.equal(review?.areas.length, 1)
  assert.equal(review?.areas[0].dimensionsText, "4m x 5m")
  assert.equal(review?.areas[0].areaText, "20m²")
  assert.equal(review?.areas[0].buildScopeText, "Full build")
})

test("derives multiple decking areas and retained structure flags from QuoteFacts", () => {
  const facts = quoteFactsFromProcessedQuote(
    deckingQuote([
      "Build a 4m x 5m pine deck.",
      "Add a second deck area, decking boards only, on a 3m x 4m section where existing posts and subframe are retained.",
      "Remove old decking waste.",
    ]),
  )
  const review = deckingReviewFromQuoteFacts(facts)

  assert.equal(review?.areas.length, 2)
  assert.equal(review?.areas[0].dimensionsText, "4m x 5m")
  assert.equal(review?.areas[0].areaText, "20m²")
  assert.equal(review?.areas[1].dimensionsText, "3m x 4m")
  assert.equal(review?.areas[1].areaText, "12m²")
  assert.equal(review?.areas[1].buildScopeText, "Decking boards only")
  assert.equal(review?.areas[1].existingPostsRetained, true)
  assert.equal(review?.areas[1].existingSubframeRetained, true)
  assert.equal(review?.totalAreaText, "32m²")
  assert.deepEqual(review?.wasteRemovalNotes, ["Remove old decking waste"])
})

test("non-decking quote does not produce decking review data", () => {
  const quote = deckingQuote(["Install six downlights and two power points."])
  quote.job_type = "Electrical"
  quote.primary_quote.job_type = "Electrical"

  const review = deckingReviewFromQuoteFacts(quoteFactsFromProcessedQuote(quote))

  assert.equal(review, null)
})
