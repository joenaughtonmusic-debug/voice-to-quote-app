import assert from "node:assert/strict"
import test from "node:test"
import type { PlantCalculatorResult } from "./calculators/planting"
import { buildTemplateRenderContext, renderQuoteTemplate, type TemplateRenderLineItem } from "./template-renderer"

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

function lineItem(overrides: Partial<TemplateRenderLineItem>): TemplateRenderLineItem {
  return {
    item_name: "",
    item_type: "",
    description: "",
    quantity: null,
    unit: "",
    match_reason: "",
    ...overrides,
  }
}

test("builds render context from calculator results and matched materials", () => {
  const quote = {
    line_items: [
      lineItem({ item_name: "Garden mix", item_type: "material" }),
      lineItem({ item_name: "Hardfill / soil removal", item_type: "material" }),
    ],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
  }

  assert.deepEqual(buildTemplateRenderContext(quote), {
    plantNames: ["Ficus Tuffi"],
    plantingAreas: [
      { name: "Lower planting area", lengthM: 11.5, plantCount: 15 },
      { name: "Upper planting area", lengthM: 13.7, plantCount: 18 },
    ],
    materials: ["Garden mix"],
    spoilRemoval: true,
    tidyOnCompletion: true,
  })
})

test("renders the initial supported placeholders into customer scope", () => {
  const quote = {
    line_items: [
      lineItem({ item_name: "Garden mix", item_type: "material" }),
      lineItem({ item_name: "Hardfill", item_type: "material" }),
    ],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
  }

  const rendered = renderQuoteTemplate(quote)

  assert.deepEqual(rendered.customerScope, [
    "Plant multiple Ficus Tuffi along lower planting area.",
    "Plant multiple Ficus Tuffi along upper planting area.",
    "Supply garden mix required for planting works.",
    "Remove spoil generated during planting.",
    "Tidy the work area on completion.",
  ])
  assert.equal(rendered.xeroDescriptions.labour, "Planting labour - Plant multiple Ficus Tuffi along lower planting area")
})

test("preserves material and spoil facts even when they are not JMS line items", () => {
  const quote = {
    line_items: [],
    materials: ["6 bags garden mix", "hardfill / removal of old soil"],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
  }

  const rendered = renderQuoteTemplate(quote)

  assert.deepEqual(rendered.context, {
    plantNames: ["Ficus Tuffi"],
    plantingAreas: [
      { name: "Lower planting area", lengthM: 11.5, plantCount: 15 },
      { name: "Upper planting area", lengthM: 13.7, plantCount: 18 },
    ],
    materials: ["Garden mix"],
    spoilRemoval: true,
    tidyOnCompletion: true,
  })
  assert.deepEqual(rendered.customerScope, [
    "Plant multiple Ficus Tuffi along lower planting area.",
    "Plant multiple Ficus Tuffi along upper planting area.",
    "Supply garden mix required for planting works.",
    "Remove spoil generated during planting.",
    "Tidy the work area on completion.",
  ])
})

test("supports small template-defined placeholder ordering", () => {
  const quote = {
    line_items: [
      lineItem({ item_name: "Garden mix", item_type: "material" }),
      lineItem({ item_name: "Hardfill", item_type: "material" }),
    ],
    plant_calculator_results: [plantResult("Lower planting area", 11.5, 15)],
  }

  const rendered = renderQuoteTemplate(quote, {
    default_scope: "{{materials_scope}}\n{{cleanup_scope}}\n{{planting_scope}}",
  })

  assert.deepEqual(rendered.customerScope, [
    "Supply garden mix required for planting works.",
    "Remove spoil generated during planting.",
    "Tidy the work area on completion.",
    "Plant multiple Ficus Tuffi along lower planting area.",
  ])
})

test("does not render planting wording for non-planting quotes", () => {
  const rendered = renderQuoteTemplate({
    job_type: "Electrical",
    quote_title: "Electrical Quote",
    line_items: [lineItem({ item_name: "Garden mix", item_type: "material" })],
  })

  assert.deepEqual(rendered.customerScope, [])
  assert.equal(rendered.xeroDescriptions.labour, "Labour")
})
