import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

function cleanLine(value: string) {
  return value
    .replace(/^\s*(?:scope|note|site\s+note|optional\s*:)\s*/i, "")
    .replace(/^\s*:\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .replace(/^\[\s*\]$/, "")
    .trim()
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map(cleanLine)
    .filter((value) => {
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function normalizeLine(value: string) {
  const cleaned = cleanLine(value)
  if (!cleaned) return ""
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function isEmptyOrPlaceholder(value: string) {
  const cleaned = cleanLine(value)
  return !cleaned || cleaned === "[]" || /^\[\s*\]$/.test(value.trim())
}

/** Labour allowance lines are internal — not shown in the customer quote. */
function isLabourLine(value: string) {
  const lower = value.toLowerCase()
  return (
    /\ballow\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i.test(value) ||
    /\b(?:\d+|one|two|three|four|five)\s+(?:people|persons?|staff|men|man)\b.*?\b(?:day|hour|hr)s?\b/i.test(value) ||
    /\bjob\s+will\s+take\b.*?\b(?:day|hour|hr)s?\b/i.test(value) ||
    /\blabour\s+allowance\b/i.test(lower)
  )
}

function isInternalNote(value: string) {
  const lower = value.toLowerCase()
  return (
    /\binternal\s+note\b/i.test(lower) ||
    /\bnot\s+a\s+retaining\s+wall\b/i.test(lower) ||
    /\bkeep\s+optional\s+works?\s+separate\b/i.test(lower)
  )
}

function isMaterialListLine(value: string) {
  // Lines that are pure material names without action context are in the Materials section.
  // But scope lines like "Install 200x50 timber" are scope, not materials.
  const lower = value.toLowerCase()
  return (
    /^(?:200x50|timber\s+pegs?|bugle\s+screws?|fixings?|nails?|bolts?|coach\s+screws?)\b/i.test(value) ||
    /^materials?\s*:/i.test(lower)
  )
}

function isOptionalLine(value: string) {
  return /^optional\s*(?:works?\s*)?:/i.test(value.trim())
}

/** Strip leading "Optional [works]: " prefix when extracting items from notes/scope. */
function stripOptionalPrefix(value: string) {
  return value.replace(/^optional\s*(?:works?\s*)?:\s*/i, "").trim()
}

function scopeOfWorkItems(input: CustomerQuoteAssemblyInput): string[] {
  return unique([
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
  ])
    .filter((item) => !isEmptyOrPlaceholder(item))
    .filter((item) => !/^(?:title|job\s+type|cadence)\s*:/i.test(item))
    .filter((item) => !isLabourLine(item))
    .filter((item) => !isInternalNote(item))
    .filter((item) => !isMaterialListLine(item))
    .filter((item) => !isOptionalLine(item))
    .map(normalizeLine)
    .filter(Boolean)
}

function materialItems(input: CustomerQuoteAssemblyInput): string[] {
  return unique(input.quote.materials)
    .filter((item) => !isEmptyOrPlaceholder(item))
    .map(normalizeLine)
    .filter(Boolean)
}

function optionalWorkItems(input: CustomerQuoteAssemblyInput): string[] {
  const fromOptionalQuotes = input.quote.optional_quotes.flatMap((q) => q.scope)

  // Fallback: scan notes and scope for lines with an "Optional [works]:" prefix — the AI
  // sometimes uses primary_quote.notes instead of optional_quotes, particularly when the
  // landscaping extractor instructions said "optional_works field" (incorrect field name).
  const optionalPrefixSources = [
    ...input.quote.primary_quote.notes,
    ...input.quote.primary_quote.scope,
    ...input.quote.customer_scope,
  ]
  const fromPrefixedLines = optionalPrefixSources
    .filter((item) => isOptionalLine(item))
    .map(stripOptionalPrefix)

  const items = unique([...fromOptionalQuotes, ...fromPrefixedLines])
    .filter((item) => !isEmptyOrPlaceholder(item))
    .filter((item) => !/^(?:title|job\s+type|cadence)\s*:/i.test(item))
    .map(normalizeLine)
    .filter(Boolean)

  return items
}

function section(title: string, items: string[]): CustomerQuoteAssemblySection | null {
  const cleaned = unique(items).filter(Boolean)
  return cleaned.length > 0 ? { title, items: cleaned } : null
}

/** Returns true when a title is a raw machine slug (e.g. "garden_bed_renovation", "landscaping"). */
function isRawJobTypeSlug(value: string) {
  // All lowercase, only word chars and underscores — never a human-readable title
  return /^[a-z][a-z0-9_]*$/.test(value)
}

function prettifyJobType(jobType: string): string {
  const jt = jobType.toLowerCase()
  if (/garden_bed_renovation|garden.bed.renov/i.test(jt)) return "Garden Bed Renovation"
  if (/garden_bed|garden.bed/i.test(jt)) return "Garden Bed Works"
  if (/general_landscaping|general.landscaping/i.test(jt)) return "General Landscaping"
  if (/^landscaping$/.test(jt)) return "Landscaping"
  return "General Landscaping"
}

function inferTitle(input: CustomerQuoteAssemblyInput): string {
  const title = input.quote.quote_title?.trim()
  // Pass through human-readable titles that aren't retaining or raw slugs
  if (title && !/\bretaining\b/i.test(title) && !isRawJobTypeSlug(title)) return title
  // Raw slug or retaining title — derive a readable label from job_type
  const jobType = input.quote.job_type?.trim() ?? ""
  if (jobType) return prettifyJobType(jobType)
  // Final fallback: prettify the raw title if it happens to be a job_type slug
  if (title && isRawJobTypeSlug(title)) return prettifyJobType(title)
  return "General Landscaping"
}

export function assembleGeneralLandscapingCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Scope of Work", scopeOfWorkItems(input)),
    section("Materials", materialItems(input)),
    section("Optional Works", optionalWorkItems(input)),
    section("Exclusions", input.quote.exclusions.map(normalizeLine).filter(Boolean)),
  ].filter((s): s is CustomerQuoteAssemblySection => s !== null)

  return {
    title: inferTitle(input),
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}

export function hasGeneralLandscapingFacts(input: CustomerQuoteAssemblyInput): boolean {
  const hasScope = [
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
  ].some((item) => item.trim().length > 3 && !isEmptyOrPlaceholder(item))

  return hasScope
}
