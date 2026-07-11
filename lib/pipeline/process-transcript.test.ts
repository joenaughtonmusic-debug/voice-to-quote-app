import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE } from "../processed-quote"
import { processTranscriptToQuote, type ProcessTranscriptDeps } from "./process-transcript"
import { buildQuotePlan } from "../quote-plan/build-plan"

const MICHELIA_TRANSCRIPT = `Went to see Client A at 10 Willow Lane, Mount Wellington.

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
    client_name: "Client A",
    site_address: "10 Willow Lane, Mount Wellington",
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

// ── QuotePlan Slice 4: a retaining/topsoil measurement must never be fabricated into
//    a planting option, via either the transcript or a mis-typed "plant" line item. ──
const RETAINING_FABRICATION_TRANSCRIPT =
  "Landscaping quote for Dan at 9 Test Lane. Build a small timber retaining wall; the length is going to be 16.8m for the retaining wall. " +
  "Import topsoil over the 6m by 16.8m area at 50mm. And do an optional price for planting a Griselinia hedge along the boundary."

function retainingFabricationDeps(): ProcessTranscriptDeps {
  return {
    classify: async () => ({ specialist: "landscaping", reason: "test-injected classification" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractQuote: async () =>
      ({
        quote: {
          ...EMPTY_PROCESSED_QUOTE,
          client_name: "Dan",
          site_address: "9 Test Lane",
          quote_title: "Landscaping Quote",
          job_type: "general_landscaping",
          primary_quote: {
            quote_title: "Landscaping Quote",
            job_type: "general_landscaping",
            cadence: "",
            scope: ["Build a small timber retaining wall.", "Import and spread topsoil."],
            notes: [],
          },
          optional_quotes: [
            {
              quote_title: "Optional Griselinia hedge",
              job_type: "planting",
              cadence: "",
              scope: ["Plant a Griselinia hedge along the boundary."],
              notes: [],
            },
          ],
          customer_scope: ["Build a small timber retaining wall.", "Import and spread topsoil."],
          // The live fabrication vector: the AI mis-types the retaining wall as a
          // "plant" line item with a quantity — this previously seeded a plant
          // calculator request named "Retaining wall".
          line_items: [
            {
              item_code: "",
              item_name: "Retaining wall 16.8m",
              item_type: "plant",
              description: "Retaining wall length",
              quantity: "1",
              unit: "each",
              rate: null,
              knowledge_base_rate: null,
              override_rate: null,
              final_rate_used: null,
              total: null,
              match_confidence: "none",
              match_reason: "",
              needs_review: true,
              warning: "",
            },
          ],
        },
        elapsedMs: 0,
        promptLength: 0,
        responseLength: 0,
        reliabilityMetric: "first_pass_success",
      }) as any,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  }
}

test("processTranscriptToQuote never fabricates a 'retaining wall' plant option from a retaining/topsoil measurement", async () => {
  const { quote } = await processTranscriptToQuote(
    { transcript: RETAINING_FABRICATION_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    retainingFabricationDeps(),
  )

  const q = quote as typeof quote & {
    plant_calculator_results?: Array<{ plant_name?: string; length_m?: number | null }>
    quote_options?: Array<{ title?: string; label?: string }>
  }

  const calcResults = q.plant_calculator_results ?? []
  assert.ok(
    !calcResults.some((r) => /retaining\s*wall/i.test(r.plant_name ?? "")),
    `no plant calculator result may be named after the retaining wall, got ${JSON.stringify(calcResults)}`,
  )
  assert.ok(
    !calcResults.some((r) => r.length_m === 16.8 || r.length_m === 6),
    `retaining/topsoil dimensions must not become a planting length, got ${JSON.stringify(calcResults)}`,
  )
  assert.ok(
    !(q.quote_options ?? []).some((o) => /retaining\s*wall/i.test(`${o.title ?? ""} ${o.label ?? ""}`)),
    `no quote option may be named after the retaining wall, got ${JSON.stringify(q.quote_options)}`,
  )
  assert.ok(
    !quote.line_items.some((i) => i.item_type === "plant" && /retaining\s*wall/i.test(i.item_name)),
    `no plant line item may be named after the retaining wall, got ${JSON.stringify(quote.line_items.map((i) => i.item_name))}`,
  )
})

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

  // QuotePlan Slice 3a — optional labour is priceable on optional_priced_works,
  // and must NOT be pushed onto quote_options (which feeds customer preview / Xero).
  const priced = quote.optional_priced_works ?? []
  const buxusOption = priced.find((o) => /buxus/i.test(`${o.label} ${o.title}`))
  assert.ok(buxusOption, `optional Buxus labour must be a priceable optional work, got ${JSON.stringify(priced)}`)
  assert.equal(buxusOption!.category, "labour")
  assert.equal(buxusOption!.lineItems[0]?.quantity, 16)
  assert.ok(
    !(quote.quote_options ?? []).some((o) => o.category === "labour" || /buxus/i.test(`${o.label} ${o.title}`)),
    "optional labour must not leak into quote_options",
  )
})

// ── QuotePlan Milestone 3: the dormant draftPlanner seam is validated & safe ──
test("processTranscriptToQuote: an injected draftPlanner producing a VALID plan is used (accepted)", async () => {
  let calls = 0
  const deps: ProcessTranscriptDeps = {
    ...optionalLabourDeps(),
    // A valid draft plan (the deterministic plan itself) → resolveQuotePlan accepts it.
    draftPlanner: (input) => {
      calls += 1
      return buildQuotePlan(input)
    },
  }
  const { quote } = await processTranscriptToQuote(
    { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    deps,
  )

  assert.ok(calls >= 1, "the draftPlanner seam must be invoked")
  // Behaviour is correct: optional hedge labour still stays out of the main labour line.
  const labourLine = quote.line_items.find(
    (item) => /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  assert.equal(labourLine, undefined, "optional labour must not become a main labour line")
})

test("processTranscriptToQuote: an injected draftPlanner producing INVALID output falls back safely", async () => {
  let calls = 0
  const deps: ProcessTranscriptDeps = {
    ...optionalLabourDeps(),
    // Garbage draft (no main bucket) → resolveQuotePlan falls back to buildQuotePlan;
    // raw AI output can never corrupt the quote.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    draftPlanner: () => {
      calls += 1
      return { bogus: true, main: null } as any
    },
  }
  const { quote } = await processTranscriptToQuote(
    { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    deps,
  )

  assert.ok(calls >= 1, "the draftPlanner seam must be invoked")
  // Fallback to the deterministic plan keeps the correct behaviour.
  const labourLine = quote.line_items.find(
    (item) => /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  assert.equal(labourLine, undefined, "fallback plan must still keep optional labour out of the main line")
  const optionalNote = quote.internal_notes.find((note) => /optional works labour/i.test(note) && /buxus/i.test(note))
  assert.ok(optionalNote, "fallback plan must still surface the optional Buxus labour internally")
})

// ── QuotePlan Milestone 4: shadow-mode AI planner never drives output ─────────
test("processTranscriptToQuote: an injected shadowPlanner reports but never changes the quote", async () => {
  const input = { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS }

  // Baseline: no shadow planner.
  const baseline = await processTranscriptToQuote(input, optionalLabourDeps())

  // A DIFFERENT (but valid) shadow draft — divergent from the deterministic plan.
  const divergentDraft = {
    quoteType: "planting",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Different main",
      kind: "main",
      scope: ["totally", "different", "scope"],
      labour: [{ raw: "one person one day", people: 1, days: 1, hours: 8, determinacy: "explicit" }],
      materials: [],
      sourceText: "different",
    },
    optional: [
      { id: "optional-1", title: "Extra", kind: "optional", scope: ["x"], labour: [], materials: [], sourceText: "x" },
      { id: "optional-2", title: "Extra 2", kind: "optional", scope: ["y"], labour: [], materials: [], sourceText: "y" },
    ],
    exclusions: [],
    uncertainties: [],
  }

  let reportCount = 0
  let lastReport: import("../quote-plan/shadow").ShadowPlannerReport | null = null
  const withShadow = await processTranscriptToQuote(input, {
    ...optionalLabourDeps(),
    shadowPlanner: () => divergentDraft,
    onShadowReport: (report) => {
      reportCount += 1
      lastReport = report
    },
  })

  assert.ok(reportCount >= 1, "the shadow planner must be invoked and reported")
  assert.equal(lastReport!.usedForOutput, false, "the shadow candidate must never be used for output")
  assert.ok(lastReport!.diff && lastReport!.diff.divergent, "this shadow draft diverges from the deterministic plan")

  // The report is attached to the quote as internal telemetry (for the review UI).
  assert.ok(withShadow.quote.shadow_report, "the shadow report is attached to the quote")
  assert.equal(withShadow.quote.shadow_report!.usedForOutput, false)

  // The divergent shadow draft must NOT have altered any customer-driving field.
  assert.deepEqual(withShadow.quote.line_items, baseline.quote.line_items, "line items must be unaffected by shadow")
  assert.deepEqual(withShadow.quote.quote_options, baseline.quote.quote_options, "quote options must be unaffected by shadow")
  assert.deepEqual(withShadow.quote.render_intent, baseline.quote.render_intent, "render intent must be unaffected by shadow")
})

test("processTranscriptToQuote: a throwing shadowPlanner is swallowed and recorded as 'failed'", async () => {
  let lastReport: import("../quote-plan/shadow").ShadowPlannerReport | null = null
  const { quote, fallbackUsed } = await processTranscriptToQuote(
    { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS },
    {
      ...optionalLabourDeps(),
      shadowPlanner: () => {
        throw new Error("shadow boom")
      },
      onShadowReport: (r) => {
        lastReport = r
      },
    },
  )

  assert.equal(fallbackUsed, false, "a shadow failure must not force the quote into fallback")
  assert.equal(lastReport!.status, "failed", "a planner failure is recorded as a 'failed' report")
  assert.equal(quote.shadow_report!.status, "failed")
  const labourLine = quote.line_items.find(
    (item) => /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  assert.equal(labourLine, undefined, "the deterministic result is unchanged by the shadow failure")
})

test("processTranscriptToQuote: shadow report is persisted, and a persistence failure never fails the quote", async () => {
  const saved: import("../quote-plan/shadow-report-store").ShadowReportRecord[] = []
  const okResult = await processTranscriptToQuote(
    { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS, userId: "user-42" },
    {
      ...optionalLabourDeps(),
      shadowPlanner: (i) => buildQuotePlan(i), // valid draft → accepted
      shadowReportStore: { save: async (r) => void saved.push(r) },
    },
  )
  assert.equal(okResult.fallbackUsed, false)
  assert.equal(saved.length, 1, "one shadow report row is persisted")
  assert.equal(saved[0].user_id, "user-42")
  assert.equal(saved[0].used_for_output, false, "persisted row records shadow output was NOT used")
  assert.ok(["accepted", "normalised"].includes(saved[0].resolve_status), `status ${saved[0].resolve_status}`)

  // A store that throws must not fail quote generation.
  const failResult = await processTranscriptToQuote(
    { transcript: OPTIONAL_LABOUR_TRANSCRIPT, knowledgeItemContext: KNOWLEDGE_ITEMS, userId: "user-42" },
    {
      ...optionalLabourDeps(),
      shadowPlanner: (i) => buildQuotePlan(i),
      shadowReportStore: {
        save: async () => {
          throw new Error("db down")
        },
      },
    },
  )
  assert.equal(failResult.fallbackUsed, false, "persistence failure must not fail the quote")
  assert.ok(failResult.quote.shadow_report, "the quote still carries the shadow report")
})
