import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput } from "./types"
import { assembleDeckingCustomerQuote, hasDeckingAssemblyFacts } from "./decking"
import { assembleGardenTidyCustomerQuote } from "./garden-tidy"
import { assembleMaintenanceCustomerQuote } from "./maintenance"
import { assemblePlantingCustomerQuote } from "./planting"
import { assembleRetainingCustomerQuote, hasRetainingAssemblyFacts } from "./retaining"

function isMaintenance(value: string | null | undefined) {
  return /\bmaintenance|garden\s+maintenance\b/i.test(value ?? "")
}

function isGardenTidy(value: string | null | undefined) {
  return /\bgarden[_\s-]?tidy|one[_\s-]?off[_\s-]?tidy|property[_\s-]?tidy\b/i.test(value ?? "")
}

function isPlanting(value: string | null | undefined) {
  return /\bplanting|hedge\s+planting|plant\s+supply|plant\s+install|plant\s+options?\b/i.test(value ?? "")
}

function isDecking(value: string | null | undefined) {
  return /\bdeck(?:ing)?\b/i.test(value ?? "")
}

function isRetaining(value: string | null | undefined) {
  return /\bretaining|retaining\s+wall\b/i.test(value ?? "")
}

function hasPlantingFacts(input: CustomerQuoteAssemblyInput) {
  return (
    (input.quote.quote_options ?? []).some((option) => option.category === "planting" && option.lineItems.length > 0) ||
    (input.quote.plant_calculator_results ?? []).some((result) => result.plant_name || result.plant_count || result.length_m) ||
    [...input.quote.customer_scope, ...input.quote.primary_quote.scope].some((item) =>
      /\bplant\s+\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\s+of\b|\bficus\s+tuffi\b|\bplanting\s+options?\b/i.test(item),
    )
  )
}

function selectedTemplateText(input: CustomerQuoteAssemblyInput) {
  const template = input.selectedTemplate
  const content = template?.template_content
  const contentText =
    content && typeof content === "object"
      ? [
          (content as Record<string, unknown>).template_name,
          (content as Record<string, unknown>).name,
          (content as Record<string, unknown>).category,
          (content as Record<string, unknown>).job_type,
          (content as Record<string, unknown>).trade,
        ].filter(Boolean).join(" ")
      : ""

  return [
    template?.name,
    template?.template_name,
    template?.category,
    template?.job_type,
    template?.trade,
    contentText,
  ].filter(Boolean).join(" ")
}

export function assembleCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly | null {
  if (isGardenTidy(input.quote.job_type) || isGardenTidy(input.quote.primary_quote.job_type)) {
    return assembleGardenTidyCustomerQuote(input)
  }

  if (isGardenTidy(selectedTemplateText(input))) {
    return assembleGardenTidyCustomerQuote(input)
  }

  if ((isRetaining(input.quote.job_type) || isRetaining(input.quote.primary_quote.job_type)) && hasRetainingAssemblyFacts(input)) {
    return assembleRetainingCustomerQuote(input)
  }

  if (isRetaining(selectedTemplateText(input)) && hasRetainingAssemblyFacts(input)) {
    return assembleRetainingCustomerQuote(input)
  }

  if ((isDecking(input.quote.job_type) || isDecking(input.quote.primary_quote.job_type)) && hasDeckingAssemblyFacts(input)) {
    return assembleDeckingCustomerQuote(input)
  }

  if (isDecking(selectedTemplateText(input)) && hasDeckingAssemblyFacts(input)) {
    return assembleDeckingCustomerQuote(input)
  }

  if ((isPlanting(input.quote.job_type) || isPlanting(input.quote.primary_quote.job_type)) && hasPlantingFacts(input)) {
    return assemblePlantingCustomerQuote(input)
  }

  if (isPlanting(selectedTemplateText(input)) && hasPlantingFacts(input)) {
    return assemblePlantingCustomerQuote(input)
  }

  if (isMaintenance(input.quote.job_type) || isMaintenance(input.quote.primary_quote.job_type)) {
    return assembleMaintenanceCustomerQuote(input)
  }

  return null
}
