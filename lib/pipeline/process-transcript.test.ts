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

// ── QuotePlan Slice 2: optional-only labour must not become main labour ───────
const OPTIONAL_LABOUR_TRANSCRIPT =
  "Quote for a garden at 12 Test Road. The main job is to lay a new lawn across the back garden. " +
  "And it would be great if you could also do an optional price for planting a Buxus hedge along the fence, and the labour for that being two people one day."

function optionalLabourDeps(): ProcessTranscriptDeps {
  return {
    classify: async () => ({ specialist: "landscaping", reason: "test-injected classification" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractQuote: async () =>
      ({
        quote: {
          ...EMPTY_PROCESSED_QUOTE,
          client_name: "Test",
          site_address: "12 Test Road",
          quote_title: "Landscaping Quote",
          job_type: "general_landscaping",
          primary_quote: {
            quote_title: "Landscaping Quote",
            job_type: "general_landscaping",
            cadence: "",
            scope: ["Lay a new lawn across the back garden."],
            notes: [],
          },
          optional_quotes: [
            {
              quote_title: "Optional Buxus hedge",
              job_type: "planting",
              cadence: "",
              scope: ["Plant a Buxus hedge along the fence."],
              notes: [],
            },
          ],
          customer_scope: ["Lay a new lawn across the back garden."],
          labour_allowance: "",
          line_items: [],
        },
        elapsedMs: 0,
        promptLength: 0,
        responseLength: 0,
        reliabilityMetric: "first_pass_success",
      }) as any,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  }
}

test("processTranscriptToQuote does not turn optional hedge labour into a main labour line", async () => {
  const { quote } = await processTranscriptToQuote(
    { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    optionalLabourDeps(),
  )

  const labourLine = quote.line_items.find(
    (item) => /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  assert.equal(labourLine, undefined, `optional hedge labour must not become a main labour line, got ${JSON.stringify(labourLine)}`)

  const optionalNote = quote.internal_notes.find(
    (note) => /optional works labour/i.test(note) && /buxus/i.test(note),
  )
  assert.ok(optionalNote, `optional hedge labour must be surfaced in internal_notes, got ${JSON.stringify(quote.internal_notes)}`)
  assert.match(optionalNote!, /2 people × 1 day = 16h/)
})
