import assert from "node:assert/strict"
import test from "node:test"
import { detectPlantMapping, parsePlantPrice, plantPriceMappingWarnings } from "./plant-library-import"

test("maps generic nursery Price column to sell_price", () => {
  const mapping = detectPlantMapping(["SKU", "Plant Name", "Price", "Nursery Price"])

  assert.equal(mapping.item_code, "SKU")
  assert.equal(mapping.plant_name, "Plant Name")
  assert.equal(mapping.sell_price, "Price")
  assert.equal(mapping.cost_price, "Nursery Price")
})

test("maps retail-style price columns to sell_price", () => {
  assert.equal(detectPlantMapping(["Retail Price"]).sell_price, "Retail Price")
  assert.equal(detectPlantMapping(["RRP"]).sell_price, "RRP")
  assert.equal(detectPlantMapping(["Unit Price"]).sell_price, "Unit Price")
  assert.equal(detectPlantMapping(["Unit Sell"]).sell_price, "Unit Sell")
  assert.equal(detectPlantMapping(["Customer Price"]).sell_price, "Customer Price")
  assert.equal(detectPlantMapping(["Sale Price"]).sell_price, "Sale Price")
})

test("maps marked-up nursery sell price header without treating nursery price as sell price", () => {
  const mapping = detectPlantMapping(["Nursery Price (GST Inc)", "Markup %", "Sell Price (+25%)"])

  assert.equal(mapping.cost_price, "Nursery Price (GST Inc)")
  assert.equal(mapping.markup_percent, "Markup %")
  assert.equal(mapping.sell_price, "Sell Price (+25%)")
  assert.equal(plantPriceMappingWarnings(mapping).some((warning) => warning.includes("No sell price column detected")), false)
})

test("maps sell price headers with any markup percentage note", () => {
  assert.equal(detectPlantMapping(["Sell Price (+10%)"]).sell_price, "Sell Price (+10%)")
  assert.equal(detectPlantMapping(["Sell Price (+15%)"]).sell_price, "Sell Price (+15%)")
  assert.equal(detectPlantMapping(["Sell Price (+25%)"]).sell_price, "Sell Price (+25%)")
  assert.equal(detectPlantMapping(["Sell Price +25%"]).sell_price, "Sell Price +25%")
})

test("parses currency and numeric price strings", () => {
  assert.equal(parsePlantPrice("$42.50"), 42.5)
  assert.equal(parsePlantPrice("NZ$1,234.56 incl GST"), 1234.56)
  assert.equal(parsePlantPrice(" 68 "), 68)
})

test("does not parse markup percentages as prices", () => {
  assert.equal(parsePlantPrice("35%"), null)
})

test("notes that sell is computed from cost via the markup rule when no sell column exists", () => {
  const warnings = plantPriceMappingWarnings(detectPlantMapping(["SKU", "Plant Name", "Nursery Price"]))

  // Behaviour change (L0b): cost is now USED — sell is computed from it via the
  // default markup rule, editable per line — rather than dropped.
  assert.equal(warnings.some((warning) => warning.includes("computed from cost")), true)
  assert.equal(warnings.some((warning) => warning.includes("markup rule")), true)
})
