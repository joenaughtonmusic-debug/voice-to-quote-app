import assert from "node:assert/strict"
import test from "node:test"
import { detectPlantMapping, resolvePlantRowSellPrice, type PlantColumnMapping } from "./plant-library-import"

// Botanic Creations shape: Product Label | Price | Availability
// Price is Joe's COST; sell is computed via the default markup rule.
const BOTANIC_HEADERS = ["Product Label", "Price", "Availability"]
const BOTANIC_ROWS = [
  { "Product Label": "Star jasmine 2L", Price: 19.9, Availability: "In stock" },
  { "Product Label": "Ficus tuffi 14L", Price: 65, Availability: "In stock" },
  { "Product Label": "Ilex largo 25L", Price: 95, Availability: "Low stock" },
]

test("Botanic headers: Product Label -> plant_name, lone Price -> cost, Availability -> stock_status", () => {
  const mapping = detectPlantMapping(BOTANIC_HEADERS)
  assert.equal(mapping.plant_name, "Product Label")
  assert.equal(mapping.stock_status, "Availability")
  // Lone "Price" (no separate cost column) is treated as COST so markup computes sell.
  assert.equal(mapping.cost_price, "Price")
  assert.equal(mapping.sell_price, "")
})

test("Botanic rows priced right: Price(cost) -> sell via markup rule", () => {
  const mapping: PlantColumnMapping = detectPlantMapping(BOTANIC_HEADERS)
  const expected = [
    { name: "Star jasmine 2L", cost: 19.9, sell: 24.88 },
    { name: "Ficus tuffi 14L", cost: 65, sell: 81.25 },
    { name: "Ilex largo 25L", cost: 95, sell: 109.25 },
  ]
  BOTANIC_ROWS.forEach((row, i) => {
    const r = resolvePlantRowSellPrice(row, mapping)
    assert.equal(r.sell_price, expected[i].sell, `${expected[i].name}: cost ${expected[i].cost} -> expected ${expected[i].sell}`)
    assert.equal(r.source, "tiered_default")
  })
})

test("an explicit sell column, when present, overrides the markup rule", () => {
  // Distinct cost + sell columns (e.g. a list that carries both).
  const mapping: PlantColumnMapping = detectPlantMapping(["Plant Name", "Nursery Price", "Retail Price"])
  assert.equal(mapping.cost_price, "Nursery Price")
  assert.equal(mapping.sell_price, "Retail Price")
  const r = resolvePlantRowSellPrice({ "Plant Name": "Whatever", "Nursery Price": 19.9, "Retail Price": 40 }, mapping)
  assert.equal(r.sell_price, 40)
  assert.equal(r.source, "explicit_sell")
})
