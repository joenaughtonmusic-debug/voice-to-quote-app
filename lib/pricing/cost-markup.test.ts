import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_COST_MARKUP_TIERS, resolveSellFromCost, tierForCost } from "./cost-markup"

// Joe's stated sanity-check rows (cost -> expected sell).
const SANITY: { name: string; cost: number; expected: number; multiplier: number }[] = [
  { name: "Star jasmine", cost: 19.9, expected: 24.88, multiplier: 1.25 },
  { name: "Ficus 14L", cost: 65, expected: 81.25, multiplier: 1.25 },
  { name: "Ilex largo 25L", cost: 95, expected: 109.25, multiplier: 1.15 },
]

for (const { name, cost, expected, multiplier } of SANITY) {
  test(`tiered markup: ${name} $${cost} -> $${expected}`, () => {
    const r = resolveSellFromCost({ cost_price: cost })
    assert.equal(r.sell_price, expected)
    assert.equal(r.source, "tiered_default")
    assert.equal(r.multiplier, multiplier)
  })
}

test("tier boundary: under $90 is x1.25, $90 and over is x1.15", () => {
  assert.equal(tierForCost(89.99, DEFAULT_COST_MARKUP_TIERS).multiplier, 1.25)
  assert.equal(tierForCost(90, DEFAULT_COST_MARKUP_TIERS).multiplier, 1.15)
  assert.equal(tierForCost(90.01, DEFAULT_COST_MARKUP_TIERS).multiplier, 1.15)
  // $90.00 exactly maps to the >=$90 tier
  assert.equal(resolveSellFromCost({ cost_price: 90 }).sell_price, 103.5)
})

test("explicit sell price always wins over the markup rule", () => {
  const r = resolveSellFromCost({ cost_price: 19.9, sell_price: 30 })
  assert.equal(r.sell_price, 30)
  assert.equal(r.source, "explicit_sell")
  assert.equal(r.multiplier, null)
})

test("per-line markup multiplier beats the default tier", () => {
  const r = resolveSellFromCost({ cost_price: 100, line_multiplier: 1.4 })
  assert.equal(r.sell_price, 140)
  assert.equal(r.source, "line_markup")
  assert.equal(r.multiplier, 1.4)
})

test("no cost and no sell -> unpriced + flag, never invents a number", () => {
  const r = resolveSellFromCost({})
  assert.equal(r.sell_price, null)
  assert.equal(r.source, "unpriced")
  assert.ok(r.warning && r.warning.length > 0)
})

test("deterministic: same cost -> same sell across 1000 runs", () => {
  for (let i = 0; i < 1000; i++) {
    assert.equal(resolveSellFromCost({ cost_price: 19.9 }).sell_price, 24.88)
    assert.equal(resolveSellFromCost({ cost_price: 95 }).sell_price, 109.25)
  }
})
