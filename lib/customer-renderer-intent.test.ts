import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import { isPrimaryLandscapingQuote, isPrimaryPlantingQuote, selectCustomerRendererPath } from "./customer-renderer-intent"

function quote(overrides: Partial<ProcessedQuote>): ProcessedQuote {
  return { ...EMPTY_PROCESSED_QUOTE, ...overrides }
}

// ── isPrimaryPlantingQuote ──────────────────────────────────────────────────
test("render_intent.mainIsPlanting is authoritative over a mutated job_type", () => {
  // A mixed landscaping job whose job_type was flipped to "Hedge Planting" by the
  // output normalisers — render_intent says the primary work is NOT planting.
  const mixed = quote({
    job_type: "Hedge Planting",
    primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote, job_type: "Hedge Planting" },
    render_intent: { primaryTrade: "landscaping", mainIsPlanting: false },
  })
  assert.equal(isPrimaryPlantingQuote(mixed), false)
  assert.equal(isPrimaryLandscapingQuote(mixed), true)

  const truePlanting = quote({
    job_type: "planting",
    render_intent: { primaryTrade: "planting", mainIsPlanting: true },
  })
  assert.equal(isPrimaryPlantingQuote(truePlanting), true)
  assert.equal(isPrimaryLandscapingQuote(truePlanting), false)
})

test("falls back to job_type when render_intent is absent (hand-built quotes)", () => {
  assert.equal(isPrimaryPlantingQuote(quote({ job_type: "planting" })), true)
  assert.equal(
    isPrimaryPlantingQuote(quote({ primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote, job_type: "planting" } })),
    true,
  )
  // General/mixed/structural primaries are never primary-planting.
  assert.equal(isPrimaryPlantingQuote(quote({ job_type: "general_landscaping" })), false)
  assert.equal(isPrimaryPlantingQuote(quote({ job_type: "retaining" })), false)
  assert.equal(isPrimaryPlantingQuote(quote({ job_type: "maintenance" })), false)
})

// ── selectCustomerRendererPath ──────────────────────────────────────────────
test("planting presentation only when usable AND primary is planting", () => {
  const planting = quote({ render_intent: { primaryTrade: "planting", mainIsPlanting: true } })
  const mixed = quote({ render_intent: { primaryTrade: "landscaping", mainIsPlanting: false } })

  assert.equal(
    selectCustomerRendererPath({ quote: planting, hasUsablePlantingQuote: true, hasAssembly: true }),
    "planting-presentation",
  )
  // Mixed job: even with a usable planting preview, must not use planting presentation.
  assert.equal(
    selectCustomerRendererPath({ quote: mixed, hasUsablePlantingQuote: true, hasAssembly: true }),
    "assembly",
  )
  // No usable planting preview → assembly.
  assert.equal(
    selectCustomerRendererPath({ quote: planting, hasUsablePlantingQuote: false, hasAssembly: true }),
    "assembly",
  )
  // No assembly either → legacy.
  assert.equal(
    selectCustomerRendererPath({ quote: mixed, hasUsablePlantingQuote: false, hasAssembly: false }),
    "legacy",
  )
})
