import assert from "node:assert/strict"
import test from "node:test"
import { filterPlantingCustomerTradeOptions, groupCustomerQuoteOptions } from "./customer-quote-options"
import type { QuoteOption } from "./quote-options"

function tradeOption(
  id: string,
  subtotal: number,
  warnings?: string[],
  areaLabel?: string,
): QuoteOption {
  return {
    id,
    label: "Paving area 1",
    title: areaLabel ?? "Paving area 1",
    category: "material",
    source: "trade_calculator",
    areaLabel: areaLabel ?? "Paving area 1",
    lineItems: [
      {
        itemName: "450x450 concrete pavers",
        quantity: 115,
        unit: "each",
        unitPrice: subtotal > 0 ? subtotal / 115 : 0,
        total: subtotal,
      },
    ],
    subtotal,
    warnings,
  }
}

function plantingOption(
  id: string,
  label: string,
  title: string,
  quantity: number,
  subtotal: number,
  areaLabel?: string,
): QuoteOption {
  return {
    id,
    label,
    title,
    category: "planting",
    source: "plant_calculator",
    areaLabel,
    lineItems: [
      {
        itemName: title,
        quantity,
        unit: "each",
        unitPrice: subtotal / quantity,
        total: subtotal,
        supplier: "Internal Nursery",
        stockStatus: "In stock",
      },
    ],
    subtotal,
    notes: ["Spacing source: plant_library", "Plant count formula: ceil(11.5 / 0.85) + 1"],
  }
}

test("groups Sarah messy quote options by planting area for Customer View", () => {
  const groups = groupCustomerQuoteOptions([
    plantingOption("lower-25l", "Option A", "Lower planting area - Ficus Tuffi 25L", 15, 1781.25, "Lower planting area"),
    plantingOption("lower-45l", "Option B", "Lower planting area - Ficus Tuffi 45L", 15, 2625, "Lower planting area"),
    plantingOption("upper-25l", "Option A", "Upper planting area - Ficus Tuffi 25L", 18, 2137.5, "Upper planting area"),
    plantingOption("upper-45l", "Option B", "Upper planting area - Ficus Tuffi 45L", 18, 3150, "Upper planting area"),
  ])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].areaLabel, "Lower planting area")
  assert.equal(groups[0].options[0].label, "Option A")
  assert.equal(groups[0].options[0].title, "Ficus Tuffi 25L")
  assert.equal(groups[0].options[0].quantityText, "15 plants")
  assert.equal(groups[0].options[0].subtotalText, "$1,781.25")
  assert.equal(groups[0].options[1].title, "Ficus Tuffi 45L")
  assert.equal(groups[0].options[1].subtotalText, "$2,625.00")
  assert.equal(groups[1].areaLabel, "Upper planting area")
  assert.equal(groups[1].options[0].quantityText, "18 plants")
  assert.equal(groups[1].options[0].subtotalText, "$2,137.50")
  assert.equal(groups[1].options[1].subtotalText, "$3,150.00")
})

test("groups Amy hedge options under default Planting options heading", () => {
  const groups = groupCustomerQuoteOptions([
    plantingOption("amy-12m", "Option A", "Ficus Tuffi 1.2m", 15, 523.2),
    plantingOption("amy-14l", "Option B", "Ficus Tuffi 14L", 15, 1218.75),
    plantingOption("amy-25l", "Option C", "Ficus Tuffi 25L", 15, 1781.25),
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].areaLabel, "Planting options")
  assert.deepEqual(
    groups[0].options.map((option) => [option.label, option.title, option.quantityText, option.subtotalText]),
    [
      ["Option A", "Ficus Tuffi 1.2m", "15 plants", "$523.20"],
      ["Option B", "Ficus Tuffi 14L", "15 plants", "$1,218.75"],
      ["Option C", "Ficus Tuffi 25L", "15 plants", "$1,781.25"],
    ],
  )
})

// ---------------------------------------------------------------------------
// Unpriced / warning tests
// ---------------------------------------------------------------------------

test("priced trade option has isUnpriced false and no warnings", () => {
  const groups = groupCustomerQuoteOptions([tradeOption("paving-bill-1-patio", 517.5)])
  const option = groups[0]?.options[0]
  assert.ok(option, "expected a customer option")
  assert.equal(option.subtotalText, "$517.50")
  assert.equal(option.isUnpriced, false)
  assert.deepEqual(option.warnings, [])
})

test("zero-priced trade calculator option flags isUnpriced", () => {
  const groups = groupCustomerQuoteOptions([tradeOption("paving-bill-1-patio", 0)])
  const option = groups[0]?.options[0]
  assert.ok(option, "expected a customer option for a zero-priced trade option")
  assert.equal(option.subtotalText, "$0.00")
  assert.equal(option.isUnpriced, true)
})

test("resolver warnings are propagated to CustomerQuoteOption", () => {
  const warnings = ["No match found for Base course aggregate", "No match found for Paving labour"]
  const groups = groupCustomerQuoteOptions([tradeOption("paving-bill-1-patio", 0, warnings)])
  const option = groups[0]?.options[0]
  assert.ok(option, "expected a customer option with warnings")
  assert.deepEqual(option.warnings, warnings)
})

test("zero-priced plant_calculator option does not flag isUnpriced", () => {
  // Plant options from the plant calculator are not trade_calculator — must not be flagged.
  const groups = groupCustomerQuoteOptions([plantingOption("plant-1", "Option A", "Ficus Tuffi 25L", 1, 0)])
  const option = groups[0]?.options[0]
  assert.ok(option, "expected a customer option for zero-cost planting")
  assert.equal(option.isUnpriced, false)
})

test("partially priced trade option is not flagged as unpriced", () => {
  // subtotal > 0 means at least some items matched — isUnpriced must stay false.
  const warnings = ["No match found for Paving labour"]
  const groups = groupCustomerQuoteOptions([tradeOption("paving-bill-1-patio", 517.5, warnings)])
  const option = groups[0]?.options[0]
  assert.ok(option)
  assert.equal(option.isUnpriced, false)
  assert.deepEqual(option.warnings, warnings)
})

test("existing planting group shape is unchanged after adding warnings fields", () => {
  // Regression: existing planting option tests still hold; new fields default safely.
  const groups = groupCustomerQuoteOptions([
    plantingOption("lower-25l", "Option A", "Lower planting area - Ficus Tuffi 25L", 15, 1781.25, "Lower planting area"),
  ])
  const option = groups[0]?.options[0]
  assert.ok(option)
  assert.equal(option.subtotalText, "$1,781.25")
  assert.equal(option.isUnpriced, false)
  assert.deepEqual(option.warnings, [])
})

test("filterPlantingCustomerTradeOptions hides unpriced planting material groups", () => {
  const groups = groupCustomerQuoteOptions([
    tradeOption("planting-materials", 0, ["Garden mix (bags) — not found in item library"], "Planting materials"),
    tradeOption("patio-priced", 136, [], "Main deck"),
  ])

  const filtered = filterPlantingCustomerTradeOptions(groups)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.areaLabel, "Main deck")
})

test("filterPlantingCustomerTradeOptions keeps priced planting material groups", () => {
  const groups = groupCustomerQuoteOptions([
    tradeOption("planting-materials", 90, [], "Planting materials"),
  ])

  const filtered = filterPlantingCustomerTradeOptions(groups)
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.options[0]?.subtotalText, "$90.00")
})
