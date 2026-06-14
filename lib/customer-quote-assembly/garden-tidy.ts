import type { PricingFact } from "../core/pricing-extraction"
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
      const key = value.toLowerCase().replace(/\bgreen\s*waste\b/g, "greenwaste")
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function normalizeScopeItem(value: string) {
  const cleaned = cleanLine(value).replace(/\baround\s+the\s+boundary\b/i, "around boundary")
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function mainScopeItems(input: CustomerQuoteAssemblyInput) {
  return unique([...input.quote.customer_scope, ...input.quote.primary_quote.scope])
    .filter((item) => /\b(overgrowth|cut\s+back|shrubs?|weed|garden\s+beds?|self[-\s]?seeded)\b/i.test(item))
    .map(normalizeScopeItem)
}

function serviceIncludes(input: CustomerQuoteAssemblyInput) {
  const pricingIncludes = (input.pricingFacts ?? []).flatMap((fact) => fact.inclusions)
  const greenwasteMentioned = [
    input.rawTranscript,
    input.quote.greenwaste,
    ...input.quote.primary_quote.notes,
    ...pricingIncludes,
  ].some((item) => /\bgreen\s*waste|greenwaste\b/i.test(item ?? ""))

  return unique([
    ...pricingIncludes,
    greenwasteMentioned ? "Greenwaste removal" : "",
  ]).map((item) => (/\bgreen\s*waste|greenwaste\b/i.test(item) ? "Greenwaste removal" : item))
}

function priceItems(pricingFacts: PricingFact[] | undefined) {
  return unique(
    (pricingFacts ?? [])
      .filter((fact) => fact.type === "fixed_price" && typeof fact.amount === "number")
      .map((fact) => money(fact.amount as number)),
  )
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function siteNotes(input: CustomerQuoteAssemblyInput) {
  const notes = [
    input.quote.greenwaste,
    ...input.quote.primary_quote.notes,
  ]

  return unique(
    notes
      .map((note) => cleanLine(note).replace(/^(?:note|site\s+note)\s*:\s*/i, ""))
      .filter((note) => /\bgreen\s*waste|greenwaste\b/i.test(note) && /\bremoved?\s+from\s+site\b/i.test(note))
      .map(() => "Greenwaste removed from site"),
  )
}

function section(title: string, items: string[]): CustomerQuoteAssemblySection | null {
  const cleanedItems = unique(items)
  return cleanedItems.length > 0 ? { title, items: cleanedItems } : null
}

export function assembleGardenTidyCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Main Scope", mainScopeItems(input)),
    section("Service Includes", serviceIncludes(input)),
    section("Price", priceItems(input.pricingFacts)),
    section("Site Notes", siteNotes(input)),
    section("Exclusions", input.quote.exclusions),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: "One-Off Garden Tidy",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}
