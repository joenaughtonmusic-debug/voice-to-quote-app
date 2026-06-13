import assert from "node:assert/strict"
import test from "node:test"
import { buildCustomerQuotePreview, type CustomerPreviewLineItem, type CustomerPreviewQuote } from "./customer-quote-preview"
import type { PlantCalculatorResult } from "./calculators/planting"
import type { QuoteOption } from "./quote-options"

function lineItem(overrides: Partial<CustomerPreviewLineItem>): CustomerPreviewLineItem {
  return {
    item_code: "",
    item_name: "",
    item_type: "",
    description: "",
    quantity: null,
    unit: "",
    rate: null,
    knowledge_base_rate: null,
    override_rate: null,
    final_rate_used: null,
    total: null,
    match_confidence: "",
    match_reason: "",
    needs_review: false,
    warning: "",
    ...overrides,
  }
}

function plantOption(id: string, title: string, areaLabel: string, quantity: number, subtotal: number): QuoteOption {
  return {
    id,
    label: "Option",
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
      },
    ],
    subtotal,
  }
}

function plantResult(areaLabel: string, lengthM: number, plantCount: number): PlantCalculatorResult {
  return {
    area_label: areaLabel,
    plant_name: "Ficus Tuffi",
    plant_count: plantCount,
    quantity_source: "calculated_from_spacing",
    length_m: lengthM,
    spacing_mm: 850,
    spacing_source: "plant_library",
    formula: `ceil(${lengthM} / 0.85) + 1`,
    library_match: null,
    options: [],
    option_groups: [],
    warnings: [],
  }
}

test("builds Sarah customer preview with combined plant options and clean labour/material lines", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [
      lineItem({
        item_name: "Landscaping Labour",
        item_type: "labour",
        quantity: "48 hours",
        unit: "hours",
        rate: "110",
        final_rate_used: "110",
        total: "5280.00",
      }),
      lineItem({
        item_name: "garden mix",
        item_type: "material",
        quantity: "6 bags",
        unit: "bags",
        warning: "Rate missing",
        needs_review: true,
      }),
      lineItem({
        item_name: "hardfill",
        item_type: "material",
        warning: "Quantity missing",
        needs_review: true,
      }),
    ],
    quote_options: [
      plantOption("lower-25l", "Lower planting area - Ficus Tuffi 25L", "Lower planting area", 15, 1781.25),
      plantOption("upper-25l", "Upper planting area - Ficus Tuffi 25L", "Upper planting area", 18, 2137.5),
      plantOption("lower-45l", "Lower planting area - Ficus Tuffi 45L", "Lower planting area", 15, 2625),
      plantOption("upper-45l", "Upper planting area - Ficus Tuffi 45L", "Upper planting area", 18, 3150),
    ],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
  }

  const preview = buildCustomerQuotePreview(quote)

  assert.deepEqual(preview.scopeItems, [
    "Plant multiple Ficus Tuffi along lower planting area.",
    "Plant multiple Ficus Tuffi along upper planting area.",
    "Supply garden mix required for planting works.",
    "Remove spoil generated during planting.",
    "Tidy the work area on completion.",
  ])
  assert.equal(preview.scopeItems.some((item) => /\bhours?|days?|people|access|formula|spacing\s+source/i.test(item)), false)
  assert.equal(preview.labourLine?.label, "Planting labour")
  assert.equal(preview.labourLine?.amount, "$5,280.00")
  assert.deepEqual(
    preview.plantOptions.map((option) => [option.label, option.title, option.quantityText, option.subtotalText, option.isBase]),
    [
      ["Included plant price", "Ficus Tuffi 25L", "33 plants", "$3,918.75", true],
      ["Upgrade option", "Ficus Tuffi 45L", "33 plants", "$5,775.00", false],
    ],
  )
  assert.deepEqual(
    preview.materialLines.map((line) => [line.label, line.detail, line.amount ?? ""]),
    [
      ["Garden mix", "6 bags", ""],
      ["Hardfill / soil removal", "To confirm", ""],
    ],
  )
})

test("renders single decking QuoteFacts into customer preview when enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    primary_quote: {
      scope: ["Construct a 4m x 5m pine deck."],
      notes: [],
    },
  }

  const preview = buildCustomerQuotePreview(quote, { includeDeckingScope: true })

  assert.deepEqual(preview.scopeItems, ["New deck area approximately 4m x 5m, total 20m²."])
})

test("renders multiple decking areas and total area into customer preview when enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    primary_quote: {
      scope: [
        "Build a 4m x 5m pine deck.",
        "Also replace decking boards on a 3m x 4m section where posts already exist.",
        "Remove old decking waste.",
      ],
      notes: [],
    },
  }

  const preview = buildCustomerQuotePreview(quote, { includeDeckingScope: true })

  assert.deepEqual(preview.scopeItems, [
    "New deck area approximately 4m x 5m, total 20m².",
    "Second deck area approximately 3m x 4m, total 12m², decking boards only, existing posts retained, existing subframe retained.",
    "Total decking area approximately 32m².",
    "Remove old decking waste.",
  ])
})

test("non-decking customer preview is unchanged when decking preview support is enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    customer_scope: ["Install six downlights.", "Install two power points."],
    primary_quote: {
      scope: [],
      notes: [],
    },
  }

  const standardPreview = buildCustomerQuotePreview(quote)
  const deckingEnabledPreview = buildCustomerQuotePreview(quote, { includeDeckingScope: true })

  assert.deepEqual(deckingEnabledPreview.scopeItems, standardPreview.scopeItems)
})

test("planting customer preview remains unchanged when decking preview support is enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [
      lineItem({
        item_name: "Landscaping Labour",
        item_type: "labour",
        quantity: "48 hours",
        unit: "hours",
        rate: "110",
        final_rate_used: "110",
        total: "5280.00",
      }),
      lineItem({
        item_name: "garden mix",
        item_type: "material",
        quantity: "6 bags",
        unit: "bags",
      }),
      lineItem({
        item_name: "hardfill",
        item_type: "material",
      }),
    ],
    quote_options: [
      plantOption("lower-25l", "Lower planting area - Ficus Tuffi 25L", "Lower planting area", 15, 1781.25),
      plantOption("upper-25l", "Upper planting area - Ficus Tuffi 25L", "Upper planting area", 18, 2137.5),
    ],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
  }

  const preview = buildCustomerQuotePreview(quote, { includeDeckingScope: true })

  assert.deepEqual(preview.scopeItems, [
    "Plant multiple Ficus Tuffi along lower planting area.",
    "Plant multiple Ficus Tuffi along upper planting area.",
    "Supply garden mix required for planting works.",
    "Remove spoil generated during planting.",
    "Tidy the work area on completion.",
  ])
})

test("renders single retaining QuoteFacts into customer preview when enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    primary_quote: {
      scope: ["Build a 10m long retaining wall, 600mm high."],
      notes: [],
    },
  }

  const preview = buildCustomerQuotePreview(quote, { includeRetainingScope: true })

  assert.deepEqual(preview.scopeItems, ["Build retaining wall approximately 10m long x 600mm high, total 6m²."])
})

test("renders multiple retaining wall sections and total area into customer preview when enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    primary_quote: {
      scope: ["One wall 8m long and 800mm high, second wall 4m long and 600mm high."],
      notes: [],
    },
  }

  const preview = buildCustomerQuotePreview(quote, { includeRetainingScope: true })

  assert.deepEqual(preview.scopeItems, [
    "Build retaining wall approximately 8m long x 800mm high, total 6.4m².",
    "Build retaining wall approximately 4m long x 600mm high, total 2.4m².",
    "Total retaining wall face area approximately 8.8m².",
  ])
})

test("renders replacement drainage posts and waste retaining notes when enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    primary_quote: {
      scope: [
        "Replace the old timber retaining wall, 6m long and 700mm high.",
        "Include drainage and posts.",
        "Remove old wall waste.",
      ],
      notes: [],
    },
  }

  const preview = buildCustomerQuotePreview(quote, { includeRetainingScope: true })

  assert.deepEqual(preview.scopeItems, [
    "Replace existing timber retaining wall approximately 6m long x 700mm high, total 4.2m².",
    "Include drainage behind retaining wall where specified.",
    "Include retaining posts or post holes where specified.",
    "Remove old wall waste.",
  ])
})

test("non-retaining customer preview is unchanged when retaining preview support is enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    customer_scope: ["Install six downlights.", "Install two power points."],
    primary_quote: {
      scope: [],
      notes: [],
    },
  }

  const standardPreview = buildCustomerQuotePreview(quote)
  const retainingEnabledPreview = buildCustomerQuotePreview(quote, { includeRetainingScope: true })

  assert.deepEqual(retainingEnabledPreview.scopeItems, standardPreview.scopeItems)
})

test("decking customer preview remains unchanged when retaining preview support is also enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [],
    primary_quote: {
      scope: [
        "Build a 4m x 5m pine deck.",
        "Also replace decking boards on a 3m x 4m section where posts already exist.",
        "Remove old decking waste.",
      ],
      notes: [],
    },
  }

  const preview = buildCustomerQuotePreview(quote, { includeDeckingScope: true, includeRetainingScope: true })

  assert.deepEqual(preview.scopeItems, [
    "New deck area approximately 4m x 5m, total 20m².",
    "Second deck area approximately 3m x 4m, total 12m², decking boards only, existing posts retained, existing subframe retained.",
    "Total decking area approximately 32m².",
    "Remove old decking waste.",
  ])
})

test("planting customer preview remains unchanged when retaining preview support is enabled", () => {
  const quote: CustomerPreviewQuote = {
    line_items: [
      lineItem({
        item_name: "Landscaping Labour",
        item_type: "labour",
        quantity: "48 hours",
        unit: "hours",
        rate: "110",
        final_rate_used: "110",
        total: "5280.00",
      }),
      lineItem({
        item_name: "garden mix",
        item_type: "material",
        quantity: "6 bags",
        unit: "bags",
      }),
      lineItem({
        item_name: "hardfill",
        item_type: "material",
      }),
    ],
    quote_options: [
      plantOption("lower-25l", "Lower planting area - Ficus Tuffi 25L", "Lower planting area", 15, 1781.25),
      plantOption("upper-25l", "Upper planting area - Ficus Tuffi 25L", "Upper planting area", 18, 2137.5),
    ],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
  }

  const preview = buildCustomerQuotePreview(quote, { includeRetainingScope: true })

  assert.deepEqual(preview.scopeItems, [
    "Plant multiple Ficus Tuffi along lower planting area.",
    "Plant multiple Ficus Tuffi along upper planting area.",
    "Supply garden mix required for planting works.",
    "Remove spoil generated during planting.",
    "Tidy the work area on completion.",
  ])
})
