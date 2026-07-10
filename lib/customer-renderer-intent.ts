import type { ProcessedQuote } from "./processed-quote"

/**
 * Customer renderer/assembler intent (QuotePlan Milestone 2).
 *
 * The customer presentation must follow the quote's PRIMARY intent, not a `job_type`
 * that the pipeline's output normalisers may have flipped to "Hedge Planting" /
 * "retaining" once an optional planting/retaining component was calculated. These pure
 * helpers derive the stable decision, preferring the QuotePlan-derived `render_intent`
 * (recorded before that mutation) and falling back to `job_type` for hand-built quotes
 * that never went through the pipeline.
 */

export type CustomerRendererPath = "planting-presentation" | "assembly" | "legacy"

const PLANTING_JOB = /\b(planting|hedge[_\s-]?planting|plant[_\s-]?supply|plant[_\s-]?install|plant[_\s-]?options?)\b/i
// A primary trade that is a broader landscaping / structural / other job — planting is
// at most a component of these, never the reason to use the planting presentation.
const NON_PLANTING_PRIMARY =
  /\b(general[_\s-]?landscaping|landscaping|retaining|paving|paver|decking|deck|fencing|fence|garden[_\s-]?bed|maintenance|garden[_\s-]?tidy|one[_\s-]?off|tidy)\b/i

/**
 * True only when the MAIN/primary work is genuinely planting (Michelia-style), so the
 * planting presentation/assembler may be used. A mixed landscaping job with an OPTIONAL
 * hedge returns false even after its optional planting has been calculated.
 */
export function isPrimaryPlantingQuote(quote: ProcessedQuote): boolean {
  // Authoritative: the QuotePlan intent captured pre-mutation by the pipeline.
  if (quote.render_intent && typeof quote.render_intent.mainIsPlanting === "boolean") {
    return quote.render_intent.mainIsPlanting
  }
  // Fallback for hand-built quotes (no pipeline run, so job_type is un-mutated): a
  // planting primary job type that is not a broader landscaping/structural job.
  const jobType = quote.job_type ?? ""
  const primaryJobType = quote.primary_quote?.job_type ?? ""
  if (NON_PLANTING_PRIMARY.test(jobType) || NON_PLANTING_PRIMARY.test(primaryJobType)) return false
  return PLANTING_JOB.test(jobType) || PLANTING_JOB.test(primaryJobType)
}

/**
 * True when the primary trade is general/mixed landscaping — used so a mixed job whose
 * `job_type` was mutated to a planting/retaining label still routes to the general
 * landscaping assembler rather than collapsing to a planting/legacy presentation.
 */
export function isPrimaryLandscapingQuote(quote: ProcessedQuote): boolean {
  return quote.render_intent?.primaryTrade === "landscaping"
}

/**
 * The stable customer renderer path. The planting presentation is allowed ONLY when the
 * presentation is usable AND the primary work is genuinely planting; otherwise the
 * assembly (customer quote) is used, falling back to the legacy body when no assembly
 * could be built.
 */
export function selectCustomerRendererPath(input: {
  quote: ProcessedQuote
  hasUsablePlantingQuote: boolean
  hasAssembly: boolean
}): CustomerRendererPath {
  if (input.hasUsablePlantingQuote && isPrimaryPlantingQuote(input.quote)) return "planting-presentation"
  if (input.hasAssembly) return "assembly"
  return "legacy"
}
