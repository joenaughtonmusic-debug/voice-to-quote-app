import assert from "node:assert/strict"
import test from "node:test"
import { calculatePlantingQuote, extractPlantCalculatorRequestsFromText } from "../calculators/planting"
import { classifyPlantCatalogItem } from "../plant-item-classification"
import { matchPlantRowsFromLibrary, type KnowledgePlantRow } from "./index"

const plantRows: KnowledgePlantRow[] = [
  {
    id: "ficus-12",
    item_code: "FT-12",
    item_name: "Ficus Tuffi 1.2m",
    aliases: ["Ficus Tuffi", "Ficus Tuffy", "Tuffi hedge"],
    sell_price: 42,
    source_category: "Supplier A",
    raw_import: {
      plant_name: "Ficus Tuffi",
      botanical_name: "Ficus macrocarpa Tuffi",
      common_name: "Tuffi",
      plant_size: "1.2m",
      pot_size: "1.2m",
      spacing_mm: 800,
      supplier: "Supplier A",
      stock_status: "In stock",
    },
  },
  {
    id: "ficus-25l",
    item_code: "FT-25",
    item_name: "Ficus Tuffi 25L",
    aliases: ["Ficus Tuffi", "Tuffi hedge", "25L"],
    sell_price: 68,
    source_category: "Supplier A",
    raw_import: {
      plant_name: "Ficus Tuffi",
      botanical_name: "Ficus macrocarpa Tuffi",
      common_name: "Tuffi",
      plant_size: "25L",
      pot_size: "25L",
      spacing_mm: 800,
      supplier: "Supplier A",
      stock_status: "Low stock",
    },
  },
]

const multiPlantRows: KnowledgePlantRow[] = [
  {
    id: "ficus-hedge",
    item_code: "FT-HEDGE",
    item_name: "Ficus Tuffi",
    aliases: ["Ficus Tuffi", "Tuffi hedge"],
    sell_price: 42,
    raw_import: {
      plant_name: "Ficus Tuffi",
      plant_size: "Hedge grade",
      pot_size: "Hedge grade",
      spacing_mm: 850,
    },
  },
  {
    id: "lomandra-small",
    item_code: "LLT-SMALL",
    item_name: "Lomandra Lime Tuff Small",
    aliases: ["Lomandra Lime Tuff", "Lime Tuff"],
    sell_price: 12,
    raw_import: {
      plant_name: "Lomandra Lime Tuff",
      plant_size: "Small",
      pot_size: "Small",
      spacing_mm: 450,
    },
  },
]

const ficusSizeOptionRows: KnowledgePlantRow[] = [
  {
    id: "ficus-12m",
    item_code: "FT-12M",
    item_name: "Ficus Tuffi 1.2m Hedge Plant",
    aliases: ["Ficus Tuffi", "Tuffi hedge"],
    sell_price: 42,
    raw_import: {
      plant_name: "Ficus Tuffi",
      plant_size: "1.2m Hedge Plant",
      pot_size: "1.2 metre hedge",
      spacing_mm: 850,
      supplier: "Supplier A",
      stock_status: "In stock",
    },
  },
  {
    id: "ficus-14l",
    item_code: "FT-14L",
    item_name: "Ficus Tuffi 14L PB",
    aliases: ["Ficus Tuffi", "Tuffi hedge"],
    sell_price: 55,
    raw_import: {
      plant_name: "Ficus Tuffi",
      plant_size: "14L PB",
      pot_size: "14L Pot",
      spacing_mm: 850,
      supplier: "Supplier B",
      stock_status: "In stock",
    },
  },
  {
    id: "ficus-25l-options",
    item_code: "FT-25L",
    item_name: "Ficus Tuffi 25L Pot",
    aliases: ["Ficus Tuffi", "Tuffi hedge"],
    sell_price: 68,
    raw_import: {
      plant_name: "Ficus Tuffi",
      plant_size: "25L Hedge Plant",
      pot_size: "25L Pot",
      spacing_mm: 850,
      supplier: "Supplier C",
      stock_status: "Low stock",
    },
  },
  {
    id: "ficus-45l",
    item_code: "FT-45L",
    item_name: "Ficus Tuffi 45L",
    aliases: ["Ficus Tuffi", "Tuffi hedge"],
    sell_price: 120,
    raw_import: {
      plant_name: "Ficus Tuffi",
      plant_size: "45L",
      pot_size: "45L",
      spacing_mm: 850,
      supplier: "Supplier D",
      stock_status: "In stock",
    },
  },
]

const plantRowsWithProducts: KnowledgePlantRow[] = [
  ...plantRows,
  {
    id: "plant-soap",
    item_type: "plant",
    item_code: "CARE-SOAP",
    item_name: "Plant Soap",
    aliases: ["Plant Soap", "plant care soap"],
    sell_price: 18,
    category: "plant_care",
    raw_import: {
      plant_name: "Plant Soap",
      plant_size: "500ml",
      supplier: "Supplier A",
      stock_status: "In stock",
      quote_app_notes: "Plant care spray product",
    },
  },
]

const ficusUnstructuredSizeRows: KnowledgePlantRow[] = [
  {
    item_code: "FT-1200",
    item_name: "Ficus Tuffi 1.2m Hedge Plant",
    aliases: ["Ficus Tuffi", "Ficus Tuffi 1200mm"],
    item_type: "plant",
    sell_price: 42,
    category: "hedging",
    source_category: "Supplier A",
    raw_import: {
      Supplier: "Supplier A",
      "Stock Status": "In stock",
    },
  },
  {
    item_code: "FT-14",
    item_name: "Ficus Tuffi 14L PB",
    aliases: ["Ficus Tuffi", "14 litre grade"],
    item_type: "plant",
    sell_price: 55,
    category: "hedging",
    source_category: "Supplier B",
    raw_import: {
      Supplier: "Supplier B",
      "Stock Status": "In stock",
    },
  },
  {
    item_code: "FT-25",
    item_name: "Ficus Tuffi 25L Pot",
    aliases: ["Ficus Tuffi", "25 litre grade"],
    item_type: "plant",
    sell_price: 68,
    category: "hedging",
    source_category: "Supplier C",
    raw_import: {
      Supplier: "Supplier C",
      "Stock Status": "Low stock",
    },
  },
]

test("finds Ficus Tuffi from Plant Library aliases", () => {
  const match = matchPlantRowsFromLibrary(plantRows, "Ficus Tuffy")

  assert.equal(match.plant_name, "Ficus Tuffi")
  assert.equal(match.match_confidence, "high")
  assert.equal(match.default_spacing_mm, 800)
})

test("classifies plant-care products as non-plant nursery items", () => {
  const classification = classifyPlantCatalogItem({
    itemName: "Plant Soap",
    plantName: "Plant Soap",
    category: "Plant care",
    notes: "Spray onto foliage as a plant treatment.",
  })

  assert.equal(classification.is_true_plant, false)
  assert.notEqual(classification.item_type, "plant")
  assert.equal(classification.category, "plant_care")
})

test("does not return plant-care products as Plant Calculator options", () => {
  const match = matchPlantRowsFromLibrary(plantRowsWithProducts, "Ficus Tuffi")

  assert.equal(match.plant_name, "Ficus Tuffi")
  assert.equal(match.options?.some((option) => option.plant_name === "Plant Soap"), false)
})

test("does not match Plant Soap as a live plant", () => {
  const match = matchPlantRowsFromLibrary(plantRowsWithProducts, "Plant Soap")

  assert.equal(match.match_confidence, "none")
  assert.equal(match.options?.length, 0)
})

test("returns multiple size options for a matched plant", () => {
  const match = matchPlantRowsFromLibrary(plantRows, "Ficus Tuffi")

  assert.equal(match.options?.length, 2)
  assert.deepEqual(match.options?.map((option) => option.pot_size), ["1.2m", "25L"])
})

test("calculator uses library spacing when spoken spacing is absent", () => {
  const match = matchPlantRowsFromLibrary(plantRows, "Ficus Tuffi")
  const result = calculatePlantingQuote({
    plant_name: "Ficus Tuffi",
    length_m: 11,
    plant_library_match: match,
  })

  assert.equal(result.plant_count, 15)
  assert.equal(result.spacing_mm, 800)
  assert.equal(result.spacing_source, "plant_library")
  assert.equal(result.options.length, 2)
  assert.equal(result.options[0].total_price, 630)
})

test("spoken spacing overrides library spacing", () => {
  const match = matchPlantRowsFromLibrary(plantRows, "Ficus Tuffi")
  const result = calculatePlantingQuote({
    plant_name: "Ficus Tuffi",
    length_m: 11,
    spoken_spacing_mm: 500,
    plant_library_match: match,
  })

  assert.equal(result.spacing_mm, 500)
  assert.equal(result.spacing_source, "spoken")
  assert.equal(result.plant_count, 23)
})

test("debug integration creates request, matches library, and calculates count", () => {
  const [request] = extractPlantCalculatorRequestsFromText("11.5m Ficus Tuffi hedge")
  const match = matchPlantRowsFromLibrary(plantRows, request.plant_name ?? "")
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: match,
  })

  assert.equal(request.plant_name, "Ficus Tuffi")
  assert.equal(request.length_m, 11.5)
  assert.equal(match.match_confidence, "high")
  assert.equal(result.spacing_source, "plant_library")
  assert.equal(result.plant_count, 16)
})

test("multi-plant extraction keeps length and quantity requests separate", () => {
  const requests = extractPlantCalculatorRequestsFromText(
    "Plant 12m of Ficus Tuffi hedge. Also plant 20 Lomandra Lime Tuff along the driveway.",
  )
  const results = requests.map((request) =>
    calculatePlantingQuote({
      ...request,
      plant_library_match: matchPlantRowsFromLibrary(multiPlantRows, request.plant_name ?? ""),
    }),
  )

  assert.equal(requests.length, 2)
  assert.equal(requests.filter((request) => request.plant_name === "Lomandra Lime Tuff").length, 1)
  assert.equal(results.find((result) => result.plant_name === "Ficus Tuffi")?.plant_count, 16)
  assert.equal(results.find((result) => result.plant_name === "Lomandra Lime Tuff")?.plant_count, 20)
  assert.equal(results.find((result) => result.plant_name === "Ficus Tuffi")?.spacing_mm, 850)
  assert.equal(results.find((result) => result.plant_name === "Lomandra Lime Tuff")?.spacing_mm, 450)
})

test("requested plant sizes filter Plant Library options without treating hedge length as a size option", () => {
  const [request] = extractPlantCalculatorRequestsFromText(`Install approximately 11.5 metres of Ficus Tuffi hedge.

Provide options for:
- 1.2 metre
- 14 litre
- 25 litre`)
  const match = matchPlantRowsFromLibrary(ficusSizeOptionRows, request.plant_name ?? "")
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: match,
  })

  assert.equal(request.plant_name, "Ficus Tuffi")
  assert.equal(request.length_m, 11.5)
  assert.deepEqual(request.requested_option_sizes, ["1.2m", "14l", "25l"])
  assert.equal(result.plant_count, 15)
  assert.equal(result.spacing_source, "plant_library")
  assert.deepEqual(
    result.option_groups.map((option) => option.option_name),
    ["Ficus Tuffi 1.2m Hedge Plant", "Ficus Tuffi 14L PB", "Ficus Tuffi 25L Hedge Plant"],
  )
  assert.deepEqual(
    result.option_groups.map((option) => option.unit_sell_price),
    [42, 55, 68],
  )
  assert.deepEqual(
    result.option_groups.map((option) => option.plant_total),
    [630, 825, 1020],
  )
  assert.equal(result.warnings.some((warning) => warning.message.includes("11.5m")), false)
})

test("inline requested plant sizes are preserved as calculator request sizes", () => {
  const [request] = extractPlantCalculatorRequestsFromText(
    "Install approximately 11.5 metres of Ficus Tuffi hedge. Provide options for 1.2 metre, 14 litre and 25 litre grades.",
  )
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(ficusSizeOptionRows, request.plant_name ?? ""),
  })

  assert.deepEqual(request.requested_option_sizes, ["1.2m", "14l", "25l"])
  assert.equal(result.plant_count, 15)
  assert.deepEqual(
    result.option_groups.map((option) => option.option_name),
    ["Ficus Tuffi 1.2m Hedge Plant", "Ficus Tuffi 14L PB", "Ficus Tuffi 25L Hedge Plant"],
  )
})

test("requested plant sizes match item names and aliases when structured size fields are missing", () => {
  const [request] = extractPlantCalculatorRequestsFromText(`11.5m Ficus Tuffi hedge

Provide options for:
- 1.2 metre
- 14 litre
- 25 litre`)
  const result = calculatePlantingQuote({
    ...request,
    library_spacing_mm: 850,
    plant_library_match: matchPlantRowsFromLibrary(ficusUnstructuredSizeRows, request.plant_name ?? ""),
  })

  assert.equal(result.plant_count, 15)
  assert.deepEqual(
    result.option_groups.map((option) => option.option_name),
    ["Ficus Tuffi 1.2m Hedge Plant", "Ficus Tuffi 14L PB", "Ficus Tuffi 25L Pot"],
  )
  assert.deepEqual(
    result.option_groups.map((option) => option.unit_sell_price),
    [42, 55, 68],
  )
  assert.equal(result.warnings.some((warning) => /size option/.test(warning.message)), false)
})

test("requested plant sizes match options when imported plant_name includes size text", () => {
  const [request] = extractPlantCalculatorRequestsFromText(
    "Install approximately 11.5 metres of Ficus Tuffi hedge. Provide options for 1.2 metre, 14 litre and 25 litre grades.",
  )
  const importedRowsWithSizedPlantNames: KnowledgePlantRow[] = [
    {
      item_code: "PLANT-028",
      item_name: "Ficus Tuffi 1.2m",
      aliases: ["Ficus Tuffi", "1.2 metre hedge"],
      item_type: "plant",
      sell_price: 34.88,
      category: "hedging",
      raw_import: {
        plant_name: "Ficus Tuffi 1.2m",
        plant_size: "1.2m",
        pot_size: "1.2m",
        spacing_mm: 850,
        supplier: "Nursery",
        stock_status: "In stock",
      },
    },
    {
      item_code: "PLANT-047",
      item_name: "Ficus Tuffi 14L",
      aliases: ["Ficus Tuffi", "14 litre grade"],
      item_type: "plant",
      sell_price: 81.25,
      category: "hedging",
      raw_import: {
        plant_name: "Ficus Tuffi 14L",
        plant_size: "14L",
        pot_size: "14L",
        spacing_mm: 850,
        supplier: "Nursery",
        stock_status: "In stock",
      },
    },
    {
      item_code: "PLANT-060",
      item_name: "Ficus Tuffi 25L",
      aliases: ["Ficus Tuffi", "25 litre grade"],
      item_type: "plant",
      sell_price: 118.75,
      category: "hedging",
      raw_import: {
        plant_name: "Ficus Tuffi 25L",
        plant_size: "25L",
        pot_size: "25L",
        spacing_mm: 850,
        supplier: "Nursery",
        stock_status: "In stock",
      },
    },
  ]
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(importedRowsWithSizedPlantNames, request.plant_name ?? ""),
  })

  assert.equal(result.plant_count, 15)
  assert.deepEqual(
    result.option_groups.map((option) => option.option_name),
    ["Ficus Tuffi 1.2m", "Ficus Tuffi 14L", "Ficus Tuffi 25L"],
  )
  assert.deepEqual(
    result.option_groups.map((option) => option.unit_sell_price),
    [34.88, 81.25, 118.75],
  )
  assert.deepEqual(
    result.option_groups.map((option) => option.plant_total),
    [523.2, 1218.75, 1781.25],
  )
  assert.equal(result.warnings.some((warning) => /size option/.test(warning.message)), false)
})

test("missing requested plant size creates a warning without inventing an option", () => {
  const [request] = extractPlantCalculatorRequestsFromText(`Install 11.5 metres of Ficus Tuffi hedge.

Provide options for:
- 14 litre
- 75 litre`)
  const result = calculatePlantingQuote({
    ...request,
    plant_library_match: matchPlantRowsFromLibrary(ficusSizeOptionRows, request.plant_name ?? ""),
  })

  assert.deepEqual(
    result.option_groups.map((option) => option.option_name),
    ["Ficus Tuffi 14L PB"],
  )
  assert.equal(result.warnings.some((warning) => warning.message.includes("75l")), true)
})


test("generates quote-ready planting option groups with totals", () => {
  const match = matchPlantRowsFromLibrary(plantRows, "Ficus Tuffi")
  const result = calculatePlantingQuote({
    spoken_quantity: 15,
    plant_library_match: match,
  })

  assert.equal(result.option_groups.length, 2)
  assert.equal(result.option_groups[0].option_label, "Option A")
  assert.equal(result.option_groups[0].option_name, "Ficus Tuffi 1.2m")
  assert.equal(result.option_groups[0].plant_count, 15)
  assert.equal(result.option_groups[0].unit_sell_price, 42)
  assert.equal(result.option_groups[0].plant_total, 630)
  assert.equal(result.option_groups[0].supplier, "Supplier A")
  assert.equal(result.option_groups[0].stock_status, "In stock")
  assert.equal(result.option_groups[1].option_label, "Option B")
  assert.equal(result.option_groups[1].plant_total, 1020)
})

test("quote-ready option groups preserve missing price warnings", () => {
  const match = matchPlantRowsFromLibrary(
    [
      {
        item_name: "Ficus Tuffi 45L",
        aliases: ["Ficus Tuffi"],
        sell_price: null,
        raw_import: {
          plant_name: "Ficus Tuffi",
          plant_size: "45L",
          pot_size: "45L",
          spacing_mm: 800,
        },
      },
    ],
    "Ficus Tuffi",
  )
  const result = calculatePlantingQuote({ spoken_quantity: 15, plant_library_match: match })

  assert.equal(result.option_groups[0].plant_total, null)
  assert.equal(result.option_groups[0].warnings.some((warning) => warning.code === "missing_price"), true)
})

test("calculator exposes stock warnings for review UI", () => {
  const match = matchPlantRowsFromLibrary(
    [
      {
        item_name: "Ficus Tuffi 45L",
        aliases: ["Ficus Tuffi"],
        sell_price: 120,
        raw_import: {
          plant_name: "Ficus Tuffi",
          plant_size: "45L",
          pot_size: "45L",
          spacing_mm: 800,
          stock_status: "Out of stock",
        },
      },
    ],
    "Ficus Tuffi",
  )
  const result = calculatePlantingQuote({ spoken_quantity: 15, plant_library_match: match })

  assert.equal(result.options[0].warnings.some((warning) => warning.code === "out_of_stock"), true)
})

test("returns unresolved warning when plant is missing", () => {
  const match = matchPlantRowsFromLibrary(plantRows, "Imaginary Hedge")
  const result = calculatePlantingQuote({
    plant_name: "Imaginary Hedge",
    length_m: 11,
    plant_library_match: match,
  })

  assert.equal(match.match_confidence, "none")
  assert.equal(result.warnings.some((warning) => warning.code === "unresolved_plant"), true)
  assert.equal(result.warnings.some((warning) => warning.code === "missing_spacing"), true)
})
