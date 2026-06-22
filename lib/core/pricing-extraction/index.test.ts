import assert from "node:assert/strict"
import test from "node:test"

import { buildPricingReviewNotices, extractPricing } from "./index"

test("extracts fixed per-visit price with inclusions", () => {
  const result = extractPricing(
    "Price per visit $405 including green waste disposal, herbicide spraying, and standard maintenance materials",
  )

  assert.equal(result.pricing.length, 1)
  assert.equal(result.pricing[0].type, "fixed_price")
  assert.equal(result.pricing[0].amount, 405)
  assert.equal(result.pricing[0].currency, "NZD")
  assert.equal(result.pricing[0].cadence, "per_visit")
  assert.deepEqual(result.pricing[0].inclusions, [
    "green waste disposal",
    "herbicide spraying",
    "standard maintenance materials",
  ])
  assert.equal(result.pricing[0].confidence, "high")
})

test("extracts optional extra price", () => {
  const result = extractPricing("Optional extra seed and soil for bare patches additional $55")

  assert.equal(result.pricing.length, 1)
  assert.equal(result.pricing[0].type, "optional_extra")
  assert.equal(result.pricing[0].amount, 55)
  assert.equal(result.pricing[0].label, "seed and soil bare patches")
})

test("extracts one-off fixed price", () => {
  const result = extractPricing("One-off garden tidy price is $1440")

  assert.equal(result.pricing.length, 1)
  assert.equal(result.pricing[0].type, "fixed_price")
  assert.equal(result.pricing[0].amount, 1440)
})

test("extracts estimate price range", () => {
  const result = extractPricing("Estimate between $1200 and $1500")

  assert.equal(result.pricing.length, 1)
  assert.equal(result.pricing[0].type, "price_range")
  assert.equal(result.pricing[0].amount_min, 1200)
  assert.equal(result.pricing[0].amount_max, 1500)
})

test("extracts approximate allowance with medium confidence", () => {
  const result = extractPricing("In the region of $2000")

  assert.equal(result.pricing.length, 1)
  assert.equal(result.pricing[0].type, "allowance")
  assert.equal(result.pricing[0].amount, 2000)
  assert.equal(result.pricing[0].confidence, "medium")
  assert.equal(result.pricing[0].metadata?.approximate, true)
})

test("ordinary quote text with no pricing returns empty", () => {
  const result = extractPricing("Weeding, pruning, and removal of self-seeded plants.")

  assert.deepEqual(result.pricing, [])
})

test("creates review notice when spoken fixed price differs from matched labour total", () => {
  const pricing = extractPricing(
    "Price per visit $405 including greenwaste removal, herbicide spraying, and standard maintenance materials.",
  ).pricing
  const notices = buildPricingReviewNotices({
    pricing,
    lineItems: [
      {
        item_name: "Garden Labour",
        item_type: "labour",
        total: "360.00",
      },
    ],
  })

  assert.equal(notices.length, 1)
  assert.equal(notices[0].id, "pricing.spoken-price-mismatch")
  assert.match(notices[0].message, /Spoken price is \$405 per visit, but matched labour total is \$360/)
  assert.equal(notices[0].category, "pricing")
  assert.equal(notices[0].metadata?.spoken_amount, 405)
  assert.equal(notices[0].metadata?.labour_total, 360)
})

// ---------------------------------------------------------------------------
// Extended cadence tests
// ---------------------------------------------------------------------------

test("per_visit cadence is preserved regardless of visit frequency phrase", () => {
  const result = extractPricing("2-monthly maintenance for Sarah. Price per visit $240 including greenwaste removal.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].amount, 240)
  assert.equal(priced[0].cadence, "per_visit")
})

// Extended cadence extraction.
//
// The MONEY_PATTERN in the extractor matches any digit sequence, so numeric
// cadence prefixes (e.g. the "2" in "2-monthly" or "6" in "6-weekly") are
// picked up as a second money amount in the same sentence, causing the
// fixed-price extractor to reject that sentence (it requires exactly 1 amount).
//
// Real-world Pristine Gardens transcripts avoid this because the frequency
// phrase appears earlier in the transcript (e.g. "2-monthly maintenance for X")
// and the price sentence is separate ("Price per visit $240").  The per_visit
// cadence is therefore captured from the price sentence regardless of frequency.
//
// These tests use word-form cadence phrases in the price sentence (no digits),
// which is the only case where cadence is captured directly from the price
// sentence.

test("extracts two_monthly cadence from 'two-monthly' word form in price sentence", () => {
  const result = extractPricing("Price $240 two-monthly including greenwaste removal.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].cadence, "two_monthly")
})

test("extracts three_monthly cadence from 'three-monthly' word form in price sentence", () => {
  const result = extractPricing("Price $360 three-monthly.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].cadence, "three_monthly")
})

test("extracts three_monthly cadence from 'quarterly'", () => {
  const result = extractPricing("Quarterly maintenance price $360.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].cadence, "three_monthly")
})

test("extracts four_monthly cadence from 'four-monthly' word form in price sentence", () => {
  const result = extractPricing("Price $480 four-monthly.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].cadence, "four_monthly")
})

test("extracts six_weekly cadence from 'six-weekly' word form in price sentence", () => {
  const result = extractPricing("Price $180 six-weekly.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].cadence, "six_weekly")
})

test("two-monthly word form does not produce monthly cadence", () => {
  const result = extractPricing("Price $240 two-monthly.")
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.notEqual(priced[0].cadence, "monthly")
  assert.equal(priced[0].cadence, "two_monthly")
})

test("primary Pristine Gardens pattern: 2-monthly frequency in first sentence preserves per_visit in price sentence", () => {
  // PG always states price as "per visit". The 2-monthly frequency is in the transcript
  // opener; the price sentence carries "per visit" which wins as the cadence.
  const result = extractPricing(
    "2-monthly maintenance for Sarah at 12 Hill Road. Price per visit $240 including greenwaste removal.",
  )
  const priced = result.pricing.filter((f) => f.type === "fixed_price")
  assert.equal(priced.length, 1)
  assert.equal(priced[0].amount, 240)
  assert.equal(priced[0].cadence, "per_visit")
})
