import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

function cleanLine(value: string) {
  return value
    .replace(/^\s*(?:scope|note|site\s+note)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
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

function section(title: string, items: string[]): CustomerQuoteAssemblySection | null {
  const cleanedItems = unique(items)
  return cleanedItems.length > 0 ? { title, items: cleanedItems } : null
}

function quoteText(input: CustomerQuoteAssemblyInput) {
  return [
    input.rawTranscript,
    input.quote.quote_title,
    input.quote.job_type,
    input.quote.primary_quote.quote_title,
    input.quote.primary_quote.job_type,
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
    ...input.quote.primary_quote.notes,
    ...input.quote.materials,
    ...input.quote.exclusions,
    ...input.quote.internal_notes,
  ]
    .filter(Boolean)
    .join("\n")
}

function fenceScope(input: CustomerQuoteAssemblyInput) {
  return unique([...input.quote.customer_scope, ...input.quote.primary_quote.scope])
    .filter((item) => /\bfence|paling\b/i.test(item))
    .filter((item) => !/\bmetres?\s+(?:long|high)\b/i.test(item))
    .filter((item) => !/\bposts?|rails?|palings?\b/i.test(item) || /\bremove|replace\b/i.test(item))
}

function fenceDetails(input: CustomerQuoteAssemblyInput) {
  return unique([...input.quote.primary_quote.scope, ...input.quote.customer_scope]).filter((item) =>
    /\bmetres?\s+(?:long|high)\b/i.test(item),
  )
}

function materials(input: CustomerQuoteAssemblyInput) {
  return unique(input.quote.materials).filter((item) => /\bposts?|rails?|palings?\b/i.test(item))
}

function accessItems(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  if (/\bstraightforward\s+access\b|\baccess\s+is\s+straightforward\b/i.test(text)) return ["Straightforward access conditions"]
  if (/\breasonable\s+access\b|\baccess\s+is\s+reasonable\b/i.test(text)) return ["Reasonable access conditions"]
  if (/\btight\s+access\b|\baccess\s+is\s+tight\b/i.test(text)) return ["Tight access conditions"]
  if (/\bpoor\s+access\b|\baccess\s+is\s+poor\b/i.test(text)) return ["Poor access conditions"]
  return []
}

function exclusions(input: CustomerQuoteAssemblyInput) {
  return unique(input.quote.exclusions).map((item) => {
    if (/\bpainting\b/i.test(item)) return "Painting not included"
    if (/\bstaining\b/i.test(item)) return "Staining not included"
    return /\bnot\s+included\b/i.test(item) ? item : `${item} not included`
  })
}

export function assembleFencingCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Fence Scope", fenceScope(input)),
    section("Fence Details", fenceDetails(input)),
    section("Materials", materials(input)),
    section("Access", accessItems(input)),
    section("Exclusions", exclusions(input)),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: "Fencing Quote",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}

export function hasFencingAssemblyFacts(input: CustomerQuoteAssemblyInput) {
  return /\b(timber\s+paling\s+fence|replace\b.*\bfence|remove\s+existing\s+fence|fence\s+height|posts?,\s*rails?,?\s+and\s+palings?|boundary\s+fence)\b/i.test(
    quoteText(input),
  )
}
