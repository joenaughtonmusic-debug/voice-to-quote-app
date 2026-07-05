import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE } from "../processed-quote"
import { processTranscriptToQuote, type ProcessTranscriptDeps } from "./process-transcript"

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
This is a planting job, not a garden tidy.`

// A per-hour landscaping labour KB item so recoverMissingLabourLineItem finds a
// $110/hr rate. Passed through as knowledge_item_context.
const KNOWLEDGE_ITEMS = [
  {
    item_code: "LAB-001",
    item_name: "Landscaping Labour",
    item_type: "labour",
    unit: "hours",
    sell_price: 110,
    aliases: ["labour", "landscaping labour"],
  },
]

// Mocked AI extraction: a planting quote with a word-form labour allowance and
// NO labour line item, so the deterministic labour-recovery path must fire.
function micheliaExtractedQuote() {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: "Stephanie",
    site_address: "10 Cotswold Lane, Mount Wellington",
    quote_title: "Planting Quote",
    job_type: "planting",
    primary_quote: {
      quote_title: "Planting Quote",
      job_type: "planting",
      cadence: "",
      scope: ["Supply and plant Michelia gracipes hedge."],
      notes: [],
    },
    customer_scope: ["Supply and plant Michelia gracipes hedge."],
    labour_allowance: "one person for one and a half days because there are roots in the garden bed",
    materials: ["5 bags of garden mix"],
    line_items: [],
  }
}

function testDeps(): ProcessTranscriptDeps {
  return {
    classify: async () => ({ specialist: "planting", reason: "test-injected classification" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractQuote: async () =>
      ({
        quote: micheliaExtractedQuote(),
        elapsedMs: 0,
        promptLength: 0,
        responseLength: 0,
        reliabilityMetric: "first_pass_success",
      }) as any,
    // Silence pipeline logs during tests.
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  }
}

test("processTranscriptToQuote runs headlessly (no NextRequest, no live OpenAI)", async () => {
  const result = await processTranscriptToQuote(
    { transcript: MICHELIA_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    testDeps(),
  )

  assert.equal(result.fallbackUsed, false)
  assert.ok(result.quote, "must return a processed quote")
  assert.equal(result.classification.specialist, "planting")
})

test("processTranscriptToQuote attaches an audit_result", async () => {
  const { quote } = await processTranscriptToQuote(
    { transcript: MICHELIA_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    testDeps(),
  )
  assert.ok(quote.audit_result, "audit_result must be attached by the pipeline")
  assert.ok(Array.isArray(quote.audit_result!.issues), "audit_result.issues must be present")
})

test("processTranscriptToQuote recovers the labour line (12 hours / 1320, no '1.5 days hours')", async () => {
  const { quote } = await processTranscriptToQuote(
    { transcript: MICHELIA_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    testDeps(),
  )

  const labour = quote.line_items.find(
    (item) => /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  assert.ok(labour, "a labour line item must be recovered")
  assert.equal(labour!.quantity, "12", "1 person × 1.5 days × 8h = 12 hours")
  assert.equal(labour!.unit, "hours")
  assert.equal(labour!.total, "1320", "12 × $110 = $1,320")

  const combined = `Qty ${labour!.quantity} ${labour!.unit}`
  assert.ok(!/1\.5\s+days\s+hours/i.test(combined), "must not produce 'Qty 1.5 days hours'")
})

test("processTranscriptToQuote does not turn '5 bags of garden mix' into a $5 line", async () => {
  const { quote } = await processTranscriptToQuote(
    { transcript: MICHELIA_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    testDeps(),
  )

  const bogus = quote.line_items.some(
    (item) => /garden mix/i.test(`${item.item_name} ${item.description}`) && (item.rate === "5" || item.total === "5"),
  )
  assert.equal(bogus, false, "5 bags must never become a $5 rate/total")
})
