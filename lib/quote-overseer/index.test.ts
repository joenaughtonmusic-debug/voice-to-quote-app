import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote, type QuoteLineItem } from "../processed-quote"
import type { XeroExportLineItem } from "../export/xero/types"
import { reviewQuote } from "./index"
import type { QuoteOverseerInput } from "./types"

function labourLineItem(overrides: Partial<QuoteLineItem>): QuoteLineItem {
  return {
    item_code: "LAB-001",
    item_name: "Landscaping Labour",
    item_type: "labour",
    description: "",
    quantity: "17",
    unit: "hours",
    rate: "110",
    knowledge_base_rate: "110",
    override_rate: null,
    final_rate_used: "110",
    total: "1870",
    match_confidence: "high",
    match_reason: "",
    needs_review: false,
    warning: "",
    ...overrides,
  }
}

/**
 * Quote Overseer — deterministic post-generation review layer.
 *
 * These tests exercise each reviewer against synthetic assembled outputs (no
 * pipeline, no OpenAI). The "no false positives on the good golden quotes" test
 * lives in the golden-quotes suite, where the real projections are already
 * assembled (see lib/golden-quotes/index.test.ts).
 */

function quoteWith(overrides: Partial<ProcessedQuote>): ProcessedQuote {
  return { ...EMPTY_PROCESSED_QUOTE, ...overrides }
}

function inputWith(overrides: Partial<QuoteOverseerInput>): QuoteOverseerInput {
  return {
    quote: quoteWith({}),
    customerPreviewText: "",
    ...overrides,
  }
}

// ── O5 — customer_preview_missing_scope ──────────────────────────────────────
test("O5 flags mixed-landscaping scope that is absent from the customer preview", () => {
  const quote = quoteWith({
    job_type: "general_landscaping",
    primary_quote: {
      quote_title: "Back Lawn Levelling Quote",
      job_type: "general_landscaping",
      cadence: "",
      scope: [
        "Construct a small timber retaining wall approximately 400mm high.",
        "Install polythene along the fence to protect the fence.",
        "Import and spread topsoil across the lawn area.",
        "Sow lawn seed to establish the new lawn.",
      ],
      notes: [],
    },
  })
  // Simulates the planting-renderer takeover: real scope replaced by planting text.
  const result = reviewQuote(
    inputWith({
      quote,
      customerPreviewText:
        "Scope of Work\nSupply and plant the retaining wall hedge to the agreed planting area. Planting area approximately 16.8 metres long.",
      rendererPath: "planting-presentation",
    }),
  )

  const o5 = result.findings.filter((f) => f.check === "customer_preview_missing_scope")
  assert.ok(o5.length >= 1, `expected O5 findings, got ${JSON.stringify(result.findings)}`)
  const evidence = o5.map((f) => f.evidence).join("\n")
  assert.match(evidence, /polythene/i)
  assert.match(evidence, /topsoil/i)
  assert.equal(result.status, "review")
})

test("O5 does not flag when the preview paraphrases but keeps the distinctive scope terms", () => {
  const quote = quoteWith({
    primary_quote: {
      quote_title: "Quote",
      job_type: "general_landscaping",
      cadence: "",
      scope: ["Install polythene along the fence to protect the fence.", "Import and spread topsoil across the lawn area."],
      notes: [],
    },
  })
  const result = reviewQuote(
    inputWith({
      quote,
      customerPreviewText: "We will lay polythene against the fence and then spread fresh topsoil over the lawn.",
    }),
  )
  assert.equal(result.findings.filter((f) => f.check === "customer_preview_missing_scope").length, 0)
})

// ── O2 — customer_preview_leaks_labour ───────────────────────────────────────
test("O2 flags exposed labour hours in customer copy", () => {
  const result = reviewQuote(
    inputWith({ customerPreviewText: "Scope of Work\nRemove edging.\nLabour: 17 hours for the timber border." }),
  )
  const o2 = result.findings.filter((f) => f.check === "customer_preview_leaks_labour")
  assert.ok(o2.length >= 1, `expected O2 findings, got ${JSON.stringify(result.findings)}`)
  assert.equal(result.status, "blocked")
})

test("O2 flags the internal labour line total when labelled as labour", () => {
  const quote = quoteWith({ line_items: [labourLineItem({ total: "1870" })] })
  const result = reviewQuote(inputWith({ quote, customerPreviewText: "Materials\nTimber\nLabour $1,870" }))
  assert.ok(
    result.findings.some((f) => f.check === "customer_preview_leaks_labour"),
    `expected an O2 labour finding, got ${JSON.stringify(result.findings)}`,
  )
})

test("O2 does not flag ordinary prices with no labour context", () => {
  const result = reviewQuote(
    inputWith({ customerPreviewText: "Materials\nTopsoil — $129 for the bag\nLawn seed 5kg bag $129" }),
  )
  assert.equal(result.findings.filter((f) => f.check === "customer_preview_leaks_labour").length, 0)
})

// ── O7 — customer_copy_not_ready ─────────────────────────────────────────────
test("O7 flags internal metadata labels in customer copy", () => {
  const result = reviewQuote(inputWith({ customerPreviewText: "Title: Draft\nJob type: general_landscaping\nScope of Work" }))
  const o7 = result.findings.filter((f) => f.check === "customer_copy_not_ready")
  assert.ok(o7.length >= 1, `expected O7 findings, got ${JSON.stringify(result.findings)}`)
  assert.equal(result.status, "blocked")
})

test("O7 flags an internal note reproduced verbatim in customer copy", () => {
  const note = "Keep optional works separate from the main quote for internal pricing."
  const quote = quoteWith({ internal_notes: [note] })
  const result = reviewQuote(inputWith({ quote, customerPreviewText: `Scope of Work\nRemove edging.\n${note}` }))
  assert.ok(result.findings.some((f) => f.id === "O7-internal-note-leak"), JSON.stringify(result.findings))
})

// ── O4 — export_mapping_incomplete ───────────────────────────────────────────
test("O4 flags a supplied Xero export line missing item/account/tax mapping", () => {
  const line: XeroExportLineItem = { description: "Topsoil", quantity: 5.04 }
  const result = reviewQuote(inputWith({ xeroExportLines: [line] }))
  const o4 = result.findings.filter((f) => f.check === "export_mapping_incomplete")
  assert.ok(o4.length >= 1, `expected O4 findings, got ${JSON.stringify(result.findings)}`)
  assert.equal(result.status, "review")
})

test("O4 does not run when no Xero export lines are supplied", () => {
  const result = reviewQuote(inputWith({ customerPreviewText: "Scope of Work\nRemove edging." }))
  assert.equal(result.findings.filter((f) => f.check === "export_mapping_incomplete").length, 0)
})

test("reviewQuote returns ok on clean, customer-ready output", () => {
  const quote = quoteWith({
    primary_quote: {
      quote_title: "Quote",
      job_type: "general_landscaping",
      cadence: "",
      scope: ["Install polythene along the fence.", "Spread topsoil across the lawn."],
      notes: [],
    },
  })
  const result = reviewQuote(
    inputWith({ quote, customerPreviewText: "Scope of Work\nInstall polythene along the fence.\nSpread topsoil across the lawn." }),
  )
  assert.equal(result.status, "ok")
  assert.deepEqual(result.findings, [])
})
