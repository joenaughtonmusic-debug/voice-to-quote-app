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
