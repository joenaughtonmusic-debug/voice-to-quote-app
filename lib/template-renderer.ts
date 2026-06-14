import type { PlantCalculatorResult } from "./calculators/planting"
import type { QuoteOption } from "./quote-options"
import {
  buildPlantingTemplateRenderContext,
  plantingCleanupScope,
  plantingMaterialsScope,
  renderPlantingKnownPlaceholders,
  plantingXeroDescriptions,
} from "./trades/planting/customer-renderer"

export type TemplateRenderLineItem = {
  item_name?: string
  item_type?: string
  description?: string
  quantity?: string | null
  unit?: string
  match_reason?: string
}

export type SelectedQuoteTemplate = {
  name?: string | null
  template_name?: string | null
  category?: string | null
  job_type?: string | null
  trade?: string | null
  template_content?: unknown
  default_scope?: string | null
}

export type TemplateRenderQuote = {
  job_type?: string
  quote_title?: string
  line_items?: TemplateRenderLineItem[]
  materials?: string[]
  greenwaste?: string
  customer_scope?: string[]
  internal_notes?: string[]
  primary_quote?: {
    scope?: string[]
    notes?: string[]
  }
  quote_options?: QuoteOption[]
  plant_calculator_results?: PlantCalculatorResult[]
}

export type PlantingRenderArea = {
  name: string
  lengthM: number | null
  plantCount: number | null
}

export type TemplateRenderContext = {
  plantNames: string[]
  plantingAreas: PlantingRenderArea[]
  materials: string[]
  spoilRemoval: boolean
  tidyOnCompletion: boolean
}

export type TemplateRenderOutput = {
  context: TemplateRenderContext
  customerScope: string[]
  customerLineItems: string[]
  xeroDescriptions: {
    labour?: string
    plants?: string
    materials?: string[]
    cleanup?: string[]
  }
}

const DEFAULT_TEMPLATE = "{{planting_scope}}\n{{materials_scope}}\n{{cleanup_scope}}"

function unique(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim()
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }

  return result
}

export function buildTemplateRenderContext(quote: TemplateRenderQuote): TemplateRenderContext {
  return buildPlantingTemplateRenderContext(quote, unique)
}

function selectedTemplateText(template?: SelectedQuoteTemplate | null) {
  const content = template?.template_content
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>
    if (typeof record.customer_scope_template === "string") return record.customer_scope_template
    if (typeof record.render_template === "string") return record.render_template
  }

  return template?.default_scope?.includes("{{") ? template.default_scope : DEFAULT_TEMPLATE
}

function renderKnownPlaceholders(template: string, context: TemplateRenderContext) {
  return renderPlantingKnownPlaceholders(template, context)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function shouldUsePlantingRenderer(quote: TemplateRenderQuote, context: TemplateRenderContext) {
  const text = [quote.job_type, quote.quote_title].filter(Boolean).join(" ")
  return (
    /\b(planting|hedge\s+planting|plant\s+install|plant\s+supply|plants?)\b/i.test(text) ||
    context.plantNames.length > 0 ||
    context.plantingAreas.length > 0
  )
}

export function renderQuoteTemplate(
  quote: TemplateRenderQuote,
  selectedTemplate?: SelectedQuoteTemplate | null,
): TemplateRenderOutput {
  const context = buildTemplateRenderContext(quote)
  const usePlantingRenderer = shouldUsePlantingRenderer(quote, context)
  const customerScope = usePlantingRenderer
    ? unique(renderKnownPlaceholders(selectedTemplateText(selectedTemplate), context))
    : []

  return {
    context,
    customerScope,
    customerLineItems: customerScope,
    xeroDescriptions: usePlantingRenderer ? plantingXeroDescriptions(context, customerScope) : { labour: "Labour" },
  }
}

export { plantingCleanupScope, plantingMaterialsScope }
