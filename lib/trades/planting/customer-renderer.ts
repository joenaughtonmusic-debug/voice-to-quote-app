import type { TemplateRenderContext, TemplateRenderLineItem, TemplateRenderQuote } from "../../template-renderer"

type UniqueFn = (values: string[]) => string[]

function plantNameFromOptionTitle(title: string, areaLabel?: string) {
  const withoutArea = areaLabel
    ? title.replace(new RegExp(`^${areaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+-\\s+`, "i"), "")
    : title

  return withoutArea
    .replace(/\b\d+(?:\.\d+)?\s*(?:m|l|litre|litres|liter|liters)\b/gi, "")
    .replace(/\b(?:hedge|screen)\s+plants?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function lineItemText(item: TemplateRenderLineItem) {
  return [item.item_name, item.item_type, item.description, item.match_reason].join(" ")
}

function quoteFactText(quote: TemplateRenderQuote) {
  return [
    ...(quote.materials ?? []),
    quote.greenwaste ?? "",
    ...(quote.customer_scope ?? []),
    ...(quote.internal_notes ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.line_items ?? []).map(lineItemText),
  ].join(" ")
}

function materialNames(quote: TemplateRenderQuote, unique: UniqueFn) {
  const materials: string[] = []

  for (const item of quote.materials ?? []) {
    if (/\bgarden\s+mix\b/i.test(item)) materials.push("Garden mix")
  }

  for (const item of quote.line_items ?? []) {
    if (/\bgarden\s+mix\b/i.test(lineItemText(item))) materials.push("Garden mix")
  }

  return unique(materials)
}

function hasSpoilRemoval(quote: TemplateRenderQuote) {
  return /\bhardfill|old\s+soil|soil\s+removal|removal\s+of\s+old\s+soil|spoil\b/i.test(quoteFactText(quote))
}

function contextFromCalculatorResults(quote: TemplateRenderQuote, unique: UniqueFn): Pick<TemplateRenderContext, "plantNames" | "plantingAreas"> {
  const results = quote.plant_calculator_results ?? []
  const plantNames = unique(results.map((result) => result.plant_name ?? "").filter(Boolean))
  const plantingAreas = results
    .filter((result) => result.plant_name || result.area_label || result.plant_count !== null || result.length_m !== null)
    .map((result, index) => ({
      name: result.area_label || `Planting area ${index + 1}`,
      lengthM: result.length_m,
      plantCount: result.plant_count,
    }))

  if (plantNames.length > 0 || plantingAreas.length > 0) {
    return { plantNames, plantingAreas }
  }

  const optionPlantNames = unique((quote.quote_options ?? []).map((option) => plantNameFromOptionTitle(option.title, option.areaLabel)))
  const optionAreas = unique((quote.quote_options ?? []).map((option) => option.areaLabel ?? "").filter(Boolean))

  return {
    plantNames: optionPlantNames,
    plantingAreas: optionAreas.map((name) => ({
      name,
      lengthM: null,
      plantCount: null,
    })),
  }
}

export function buildPlantingTemplateRenderContext(quote: TemplateRenderQuote, unique: UniqueFn): TemplateRenderContext {
  const calculatorContext = contextFromCalculatorResults(quote, unique)
  const materials = materialNames(quote, unique)
  const spoilRemoval = hasSpoilRemoval(quote)
  const hasPlanting = calculatorContext.plantNames.length > 0 || calculatorContext.plantingAreas.length > 0

  return {
    ...calculatorContext,
    materials,
    spoilRemoval,
    tidyOnCompletion: hasPlanting || materials.length > 0 || spoilRemoval,
  }
}

function plantingScope(context: TemplateRenderContext) {
  if (context.plantNames.length === 0) return []

  const plantName = context.plantNames.join(" and ")
  if (context.plantingAreas.length === 0) {
    return [`Plant multiple ${plantName}.`]
  }

  return context.plantingAreas.map((area) => `Plant multiple ${plantName} along ${area.name.toLowerCase()}.`)
}

export function plantingMaterialsScope(context: TemplateRenderContext) {
  return context.materials.map((material) => `Supply ${material.toLowerCase()} required for planting works.`)
}

export function plantingCleanupScope(context: TemplateRenderContext) {
  return [
    context.spoilRemoval ? "Remove spoil generated during planting." : "",
    context.tidyOnCompletion ? "Tidy the work area on completion." : "",
  ].filter(Boolean)
}

export function renderPlantingKnownPlaceholders(template: string, context: TemplateRenderContext) {
  return template
    .replaceAll("{{planting_scope}}", plantingScope(context).join("\n"))
    .replaceAll("{{materials_scope}}", plantingMaterialsScope(context).join("\n"))
    .replaceAll("{{cleanup_scope}}", plantingCleanupScope(context).join("\n"))
}

export function plantingXeroDescriptions(context: TemplateRenderContext, customerScope: string[]) {
  return {
    labour: customerScope.length ? `Planting labour - ${customerScope[0].replace(/\.$/, "")}` : "Planting labour",
    plants: customerScope.find((item) => /^Plant\b/i.test(item)),
    materials: plantingMaterialsScope(context),
    cleanup: plantingCleanupScope(context),
  }
}
