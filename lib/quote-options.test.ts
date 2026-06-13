import assert from "node:assert/strict"
import test from "node:test"
import { calculatePlantingQuote, extractPlantCalculatorRequestsFromText } from "./calculators/planting"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "./plants"
import { quoteOptionsFromPlantCalculatorResults } from "./trades/planting/quote-options"

const amyFicusRows: KnowledgePlantRow[] = [
  {
    item_code: "PLANT-028",
    item_name: "Ficus Tuffi 1.2m Hedge plant",
    aliases: ["PLANT-028", "Ficus Tuffi 1.2m", "Ficus Tuffi", "1.2m", "850mm", "Ficus Tuffy", "Tuffi hedge"],
    item_type: "plant",
    category: "Hedge",
    sell_price: 34.88,
    raw_import: {
      plant_name: "Ficus Tuffi 1.2m",
      plant_size: "Hedge plant",
      pot_size: "Hedge plant",
      spacing_mm: 850,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  },
  {
    item_code: "PLANT-047",
    item_name: "Ficus Tuffi 14L Hedge plant",
    aliases: ["PLANT-047", "Ficus Tuffi 14L", "Ficus Tuffi", "14L", "850mm", "Ficus Tuffy", "Tuffi hedge"],
    item_type: "plant",
    category: "Hedge",
    sell_price: 81.25,
    raw_import: {
      plant_name: "Ficus Tuffi 14L",
      plant_size: "Hedge plant",
      pot_size: "Hedge plant",
      spacing_mm: 850,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  },
  {
    item_code: "PLANT-060",
    item_name: "Ficus Tuffi 25L Hedge plant",
    aliases: ["PLANT-060", "Ficus Tuffi 25L", "Ficus Tuffi", "25L", "850mm", "Ficus Tuffy", "Tuffi hedge"],
    item_type: "plant",
    category: "Hedge",
    sell_price: 118.75,
    raw_import: {
      plant_name: "Ficus Tuffi 25L",
      plant_size: "Hedge plant",
      pot_size: "Hedge plant",
      spacing_mm: 850,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  },
  {
    item_code: "PLANT-072",
    item_name: "Ficus Tuffi 45L Hedge plant",
    aliases: ["PLANT-072", "Ficus Tuffi 45L", "Ficus Tuffi", "45L", "850mm", "Ficus Tuffy", "Tuffi hedge"],
    item_type: "plant",
    category: "Hedge",
    sell_price: 175,
    raw_import: {
      plant_name: "Ficus Tuffi 45L",
      plant_size: "Hedge plant",
      pot_size: "Hedge plant",
      spacing_mm: 850,
      supplier: "Main Nursery",
      stock_status: "In stock",
      is_true_plant: true,
    },
  },
]

test("Amy hedge Plant Calculator results become reusable quoteOptions", () => {
  const [request] = extractPlantCalculatorRequestsFromText(`Quote for Amy at 44 Amy Street.

Install approximately 11.5 metres of Ficus Tuffi hedge along the front boundary.

Provide options for:
- 1.2 metre
- 14 litre
- 25 litre`)
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(amyFicusRows, request.plant_name ?? ""),
  })
  const quoteOptions = quoteOptionsFromPlantCalculatorResults([result])

  assert.equal(result.plant_count, 15)
  assert.equal(quoteOptions.length, 3)
  assert.equal(quoteOptions[0].source, "plant_calculator")
  assert.equal(quoteOptions[0].label, "Option A")
  assert.equal(quoteOptions[0].title, "Ficus Tuffi 1.2m")
  assert.equal(quoteOptions[0].subtotal, 523.2)
  assert.equal(quoteOptions[0].lineItems[0].itemCode, "PLANT-028")
  assert.equal(quoteOptions[0].lineItems[0].quantity, 15)
  assert.equal(quoteOptions[1].label, "Option B")
  assert.equal(quoteOptions[1].title, "Ficus Tuffi 14L")
  assert.equal(quoteOptions[1].subtotal, 1218.75)
  assert.equal(quoteOptions[1].lineItems[0].itemCode, "PLANT-047")
  assert.equal(quoteOptions[1].lineItems[0].quantity, 15)
  assert.equal(quoteOptions[2].label, "Option C")
  assert.equal(quoteOptions[2].title, "Ficus Tuffi 25L")
  assert.equal(quoteOptions[2].subtotal, 1781.25)
  assert.equal(quoteOptions[2].lineItems[0].itemCode, "PLANT-060")
  assert.equal(quoteOptions[2].lineItems[0].quantity, 15)
})

test("multi-area Plant Calculator results become independent area quoteOptions", () => {
  const requests = extractPlantCalculatorRequestsFromText(`Lower planting area:
11.5m Ficus Tuffi hedge.
Need pricing for 1.2m, 25L and 45L.

Upper planting area:
13.7m Ficus Tuffi hedge.
Need pricing for 1.2m, 25L and 45L.`)
  const results = requests.map((request) =>
    calculatePlantingQuote({
      ...request,
      plant_library_match: matchPlantRowsFromLibrary(amyFicusRows, request.plant_name ?? ""),
    }),
  )
  const quoteOptions = quoteOptionsFromPlantCalculatorResults(results)

  assert.equal(results.length, 2)
  assert.equal(results[0].area_label, "Lower planting area")
  assert.equal(results[0].plant_count, 15)
  assert.equal(results[1].area_label, "Upper planting area")
  assert.equal(results[1].plant_count, 18)
  assert.equal(quoteOptions.length, 6)
  assert.equal(quoteOptions[0].areaLabel, "Lower planting area")
  assert.equal(quoteOptions[0].label, "Option A")
  assert.equal(quoteOptions[0].title, "Lower planting area - Ficus Tuffi 1.2m")
  assert.equal(quoteOptions[0].subtotal, 523.2)
  assert.equal(quoteOptions[1].title, "Lower planting area - Ficus Tuffi 25L")
  assert.equal(quoteOptions[1].lineItems[0].itemCode, "PLANT-060")
  assert.equal(quoteOptions[1].subtotal, 1781.25)
  assert.equal(quoteOptions[2].title, "Lower planting area - Ficus Tuffi 45L")
  assert.equal(quoteOptions[2].subtotal, 2625)
  assert.equal(quoteOptions[3].areaLabel, "Upper planting area")
  assert.equal(quoteOptions[3].label, "Option A")
  assert.equal(quoteOptions[3].title, "Upper planting area - Ficus Tuffi 1.2m")
  assert.equal(quoteOptions[3].lineItems[0].quantity, 18)
  assert.equal(quoteOptions[3].subtotal, 627.84)
  assert.equal(quoteOptions[4].title, "Upper planting area - Ficus Tuffi 25L")
  assert.equal(quoteOptions[4].subtotal, 2137.5)
  assert.equal(quoteOptions[5].title, "Upper planting area - Ficus Tuffi 45L")
  assert.equal(quoteOptions[5].subtotal, 3150)
})
