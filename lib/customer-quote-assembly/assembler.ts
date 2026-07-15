import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput } from "./types"
import { assembleDeckingCustomerQuote, hasDeckingAssemblyFacts } from "./decking"
import { assembleFencingCustomerQuote, hasFencingAssemblyFacts } from "./fencing"
import { assembleGardenTidyCustomerQuote } from "./garden-tidy"
import { assembleGeneralLandscapingCustomerQuote, hasGeneralLandscapingFacts } from "./general-landscaping"
import { assembleMaintenanceCustomerQuote } from "./maintenance"
import { assemblePavingCustomerQuote, hasPavingAssemblyFacts } from "./paving"
import { assemblePlantingCustomerQuote } from "./planting"
import { assembleRetainingCustomerQuote, hasRetainingAssemblyFacts } from "./retaining"
import { isPrimaryLandscapingQuote, isPrimaryPlantingQuote } from "../customer-renderer-intent"

function isMaintenance(value: string | null | undefined) {
  return /\bmaintenance|garden\s+maintenance\b/i.test(value ?? "")
}

function isGardenTidy(value: string | null | undefined) {
  return /\bgarden[_\s-]?tidy|one[_\s-]?off[_\s-]?tidy|property[_\s-]?tidy\b/i.test(value ?? "")
}

/**
 * Returns true for job types that are subtypes of one-off garden tidy work.
 * These are not maintenance and do not have their own assembly module — they
 * should always route through the garden tidy assembler.
 */
function isGardenTidySubtype(value: string | null | undefined) {
  return /\bhedge[_\s-]?trimming|tree[_\s-]?pruning|hedge[_\s-]?reduction|pruning\b/i.test(value ?? "")
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

function isGeneralLandscaping(value: string | null | undefined) {
  return /\blandscaping|general_landscaping|garden_bed(?:_renovation)?|garden.bed.(?:works?|renov)|miscellaneous\b/i.test(value ?? "")
}

function isFencing(value: string | null | undefined) {
  return /\bfencing|fence|paling\s+fence\b/i.test(value ?? "")
}

function isPaving(value: string | null | undefined) {
  return /\bpaving|pavers?\b/i.test(value ?? "")
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
    // When deterministic extraction stores the template name on ProcessedQuote but the
    // full template object is not yet wired through the preview path.
    input.quote.selected_template_name,
  ].filter(Boolean).join(" ")
}

export function assembleCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly | null {
  const templateText = selectedTemplateText(input)

  // Manual template selection wins. When the selected template name, category, or
  // job_type indicates One-Off Garden Tidy / garden tidy / one-off tidy, always use
  // garden tidy assembly — even when the AI extracted a subtype such as hedge_trimming
  // or tree_pruning. This is the primary route for the hedge trimming + One-Off Garden
  // Tidy template scenario.
  if (isGardenTidy(templateText)) {
    return assembleGardenTidyCustomerQuote(input)
  }

  // Explicit garden tidy job types (garden_tidy, one_off_tidy, property_tidy).
  if (isGardenTidy(input.quote.job_type) || isGardenTidy(input.quote.primary_quote.job_type)) {
    return assembleGardenTidyCustomerQuote(input)
  }

  // Garden tidy-compatible subtypes: hedge_trimming, tree_pruning, hedge_reduction,
  // and pruning are inherently one-off garden work. There is no separate assembly
  // module for these — they always use the garden tidy assembler.
  if (isGardenTidySubtype(input.quote.job_type) || isGardenTidySubtype(input.quote.primary_quote.job_type)) {
    return assembleGardenTidyCustomerQuote(input)
  }

  if ((isFencing(input.quote.job_type) || isFencing(input.quote.primary_quote.job_type)) && hasFencingAssemblyFacts(input)) {
    return assembleFencingCustomerQuote(input)
  }

  if (isFencing(selectedTemplateText(input)) && hasFencingAssemblyFacts(input)) {
    return assembleFencingCustomerQuote(input)
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

  if ((isPaving(input.quote.job_type) || isPaving(input.quote.primary_quote.job_type)) && hasPavingAssemblyFacts(input)) {
    return assemblePavingCustomerQuote(input)
  }

  if (isPaving(selectedTemplateText(input)) && hasPavingAssemblyFacts(input)) {
    return assemblePavingCustomerQuote(input)
  }

  // Milestone 2 — the planting assembler is used only when the PRIMARY work is genuinely
  // planting. A mixed landscaping job whose job_type was mutated to a planting label (once
  // its OPTIONAL hedge was calculated) must not collapse into the planting quote.
  if (
    (isPlanting(input.quote.job_type) || isPlanting(input.quote.primary_quote.job_type)) &&
    hasPlantingFacts(input) &&
    isPrimaryPlantingQuote(input.quote)
  ) {
    return assemblePlantingCustomerQuote(input)
  }

  // A selected planting TEMPLATE likewise cannot force the planting assembler unless the
  // primary work is genuinely planting (template stays metadata, never hijacks the quote).
  if (isPlanting(selectedTemplateText(input)) && hasPlantingFacts(input) && isPrimaryPlantingQuote(input.quote)) {
    return assemblePlantingCustomerQuote(input)
  }

  if (isMaintenance(input.quote.job_type) || isMaintenance(input.quote.primary_quote.job_type)) {
    return assembleMaintenanceCustomerQuote(input)
  }

  // General landscaping: job types like "landscaping", "garden_bed_renovation", "general_landscaping".
  // Activates when the job_type signals general landscaping, OR when the QuotePlan's
  // primary trade is landscaping (Milestone 2) — the latter catches mixed jobs whose
  // job_type was mutated to a planting/retaining label by the output normalisers. The
  // specific-trade routes above (retaining/decking/paving/fencing/planting) run first and
  // fire on their own job_type, so a genuine single-trade job never reaches here.
  if (
    (isGeneralLandscaping(input.quote.job_type) ||
      isGeneralLandscaping(input.quote.primary_quote.job_type) ||
      isPrimaryLandscapingQuote(input.quote)) &&
    hasGeneralLandscapingFacts(input)
  ) {
    return assembleGeneralLandscapingCustomerQuote(input)
  }

  return null
}
