import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput } from "./types"
import { assembleGardenTidyCustomerQuote } from "./garden-tidy"
import { assembleMaintenanceCustomerQuote } from "./maintenance"

function isMaintenance(value: string | null | undefined) {
  return /\bmaintenance|garden\s+maintenance\b/i.test(value ?? "")
}

function isGardenTidy(value: string | null | undefined) {
  return /\bgarden[_\s-]?tidy|one[_\s-]?off[_\s-]?tidy|property[_\s-]?tidy\b/i.test(value ?? "")
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

  if (isMaintenance(input.quote.job_type) || isMaintenance(input.quote.primary_quote.job_type)) {
    return assembleMaintenanceCustomerQuote(input)
  }

  return null
}
