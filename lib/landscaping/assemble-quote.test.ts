import assert from "node:assert/strict"
import test from "node:test"
import { assembleLandscapingQuote, computeInclusiveTotals, type LandscapingQuoteInput } from "./assemble-quote"

// GST parity with the gardening build's documented answer keys.
test("GST totals match the gardening answer keys (per-line 3/23)", () => {
  assert.deepEqual(computeInclusiveTotals([720, 72.88, 6]), { total: 798.88, gst: 104.2, subtotal: 694.68 })
  assert.deepEqual(computeInclusiveTotals([440, 39.75]), { total: 479.75, gst: 62.57, subtotal: 417.18 })
})

// A real mixed driveway job: weed mat + bark + carex planting + edging.
const DRIVEWAY_JOB: LandscapingQuoteInput = {
  customer_name: "Sample Client",
  site_address: "12 Driveway Road",
  quote_title: "Driveway landscaping",
  chunks: [
    {
      title: "Weed mat",
      work_type: "weed_mat",
      source_text: "Lay weed mat along the driveway bed",
      approved: true,
      lines: [{ description: "Weed mat 1m x 30m", qty: 2, unit: "roll", unit_price: 62, price_source: "list", matched_name: "Weed mat 1m x 30m" }],
    },
    {
      title: "Bark",
      work_type: "mulch_bark",
      source_text: "4 cubes of bark on top",
      approved: true,
      lines: [{ description: "Bark mulch", qty: 4, unit: "m3", unit_price: 78, price_source: "list", cost_price: 62.4 }],
    },
    {
      title: "Planting",
      work_type: "planting",
      source_text: "Carex hedge along the driveway edge, 18m",
      approved: true,
      lines: [{ description: "Carex 2L", qty: 36, unit_price: 9.9, price_source: "list", spacing_rule: "default — 50cm", count_formula: "ceil(18m ÷ 0.5m) = 36" }],
    },
    {
      title: "Edging",
      work_type: "edging",
      source_text: "Timber edging down both sides",
      approved: true,
      lines: [{ description: "Timber edging", qty: 36, unit: "lm", unit_price: 12.5, price_source: "suggested", needs_confirm: true }],
    },
  ],
}

test("driveway job assembles priced lines with a GST-inclusive total", () => {
  const quote = assembleLandscapingQuote(DRIVEWAY_JOB)
  // Line amounts: 2×62=124, 4×78=312, 36×9.90=356.40, 36×12.50=450 -> 1242.40
  assert.equal(quote.totals.total, 1242.4)
  assert.deepEqual(computeInclusiveTotals([124, 312, 356.4, 450]), { total: 1242.4, gst: quote.totals.gst, subtotal: quote.totals.subtotal })
  assert.ok(quote.totals.gst > 0 && quote.totals.gst < quote.totals.total)
  assert.equal(round2(quote.totals.subtotal + quote.totals.gst), quote.totals.total)
})

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

test("Xero total equals the customer total (parity)", () => {
  const quote = assembleLandscapingQuote(DRIVEWAY_JOB)
  assert.equal(quote.xero.total, quote.totals.total)
  assert.equal(quote.xero.lines.length, 4)
  assert.equal(quote.internal.flags.some((f) => f.includes("does not match")), false)
})

test("three views are produced with the right content", () => {
  const quote = assembleLandscapingQuote(DRIVEWAY_JOB)
  // customer: one section per chunk, priced lines, totals lines
  assert.equal(quote.customer.sections.length, 4)
  assert.ok(quote.customer.sections[0].lines[0].includes("$124.00"))
  assert.ok(quote.customer.totals_lines.some((l) => l.startsWith("Total (incl GST)")))
  // team: instructions, no prices
  assert.equal(quote.team.sections.length, 4)
  assert.ok(quote.team.sections.every((s) => s.items.every((i) => !i.includes("$"))))
  // internal: shows cost + spacing rule + count formula
  const internalText = quote.internal.sections.flatMap((s) => s.lines).join(" ")
  assert.ok(internalText.includes("cost: $62.40"))
  assert.ok(internalText.includes("ceil(18m ÷ 0.5m) = 36"))
})

test("suggested price flags a confirm; nothing is silently sent", () => {
  const quote = assembleLandscapingQuote(DRIVEWAY_JOB)
  assert.ok(quote.review_flags.some((f) => f.includes("Timber edging") && f.includes("needs confirming")))
})

test("unapproved chunks are excluded and flagged, not merged in", () => {
  const withDraft: LandscapingQuoteInput = {
    ...DRIVEWAY_JOB,
    chunks: [...DRIVEWAY_JOB.chunks, { title: "Retaining (idea)", work_type: "retaining", approved: false, lines: [{ description: "Sleeper wall", qty: 1, unit_price: 3000 }] }],
  }
  const quote = assembleLandscapingQuote(withDraft)
  assert.equal(quote.totals.total, 1242.4) // unchanged — retaining excluded
  assert.ok(quote.review_flags.some((f) => f.includes("Retaining (idea)") && f.includes("not approved")))
})

test("unpriced line is surfaced and excluded from the total, never invented", () => {
  const withUnpriced: LandscapingQuoteInput = {
    customer_name: "X",
    chunks: [{ title: "Planting", work_type: "planting", approved: true, lines: [{ description: "Mystery shrub", qty: 5, unit_price: null }] }],
  }
  const quote = assembleLandscapingQuote(withUnpriced)
  assert.equal(quote.totals.total, 0)
  assert.ok(quote.customer.sections[0].lines[0].includes("price to be confirmed"))
  assert.ok(quote.review_flags.some((f) => f.includes("Mystery shrub") && f.includes("no price")))
})

test("deterministic across 100 runs", () => {
  const first = JSON.stringify(assembleLandscapingQuote(DRIVEWAY_JOB))
  for (let i = 0; i < 100; i++) assert.equal(JSON.stringify(assembleLandscapingQuote(DRIVEWAY_JOB)), first)
})
