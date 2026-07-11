import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { reviewQuote } from "./index"
import { buildOverseerInputFromReview } from "./from-review"

/**
 * Tests the review→overseer wiring seam. It drives the real customer-preview
 * render chain (no OpenAI) so it proves the assembled input reviews the same text
 * the customer would see. Per-reviewer detection is covered in index.test.ts.
 */

function landscapingQuote(): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Client A",
    site_address: "10 Willow Lane, Mount Wellington",
    quote_title: "Garden Bed Renovation",
    job_type: "general_landscaping",
    primary_quote: {
      quote_title: "Garden Bed Renovation",
      job_type: "general_landscaping",
      cadence: "",
      scope: [
        "Remove the existing keystone edging.",
        "Install new 200x50 timber garden bed borders.",
      ],
      notes: [],
    },
    optional_quotes: [],
    customer_scope: [
      "Remove the existing keystone edging.",
      "Install new 200x50 timber garden bed borders.",
    ],
    materials: ["200x50 timber", "Timber pegs"],
  }
}

test("buildOverseerInputFromReview assembles quote + rendered customer text + rendererPath", () => {
  const quote = landscapingQuote()
  const input = buildOverseerInputFromReview({ processedQuote: quote, rawTranscript: "Garden bed renovation for Client A." })

  assert.equal(input.quote, quote, "the quote is passed through unchanged (not mutated)")
  assert.ok(input.customerPreviewText.trim().length > 0, "customer preview text is rendered")
  assert.match(input.customerPreviewText, /timber/i, "rendered text contains real scope wording")
  assert.equal(typeof input.rendererPath, "string")
})

test("reviewQuote on the assembled input is clean for a customer-ready landscaping quote", () => {
  const quote = landscapingQuote()
  const result = reviewQuote(buildOverseerInputFromReview({ processedQuote: quote, rawTranscript: "Garden bed renovation." }))

  const customerPreviewFindings = result.findings.filter((f) =>
    ["customer_preview_leaks_labour", "customer_preview_missing_scope", "customer_copy_not_ready"].includes(f.check),
  )
  assert.deepEqual(
    customerPreviewFindings,
    [],
    `expected no customer-preview findings, got ${JSON.stringify(customerPreviewFindings, null, 2)}`,
  )
})

test("buildOverseerInputFromReview does not attach xeroExportLines (O4 stays dormant in the UI)", () => {
  const input = buildOverseerInputFromReview({ processedQuote: landscapingQuote(), rawTranscript: "x" })
  assert.equal(input.xeroExportLines, undefined)
  const result = reviewQuote(input)
  assert.equal(result.findings.filter((f) => f.check === "export_mapping_incomplete").length, 0)
})
