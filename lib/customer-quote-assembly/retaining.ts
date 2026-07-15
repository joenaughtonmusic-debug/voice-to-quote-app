import { detectRetainingFromText } from "../trades/retaining"
import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

const RETAINING_NEGATION_PATTERN = /\bnot\s+a\s+retaining\s+wall\b|\bgarden\s+bed\s+renovation\b|\btimber\s+(?:border|edging)\s+job\b/i

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

function retainingScope(input: CustomerQuoteAssemblyInput) {
  const items = [...input.quote.customer_scope, ...input.quote.primary_quote.scope]
  return unique(items).filter((item) => /\bretaining\b/i.test(item) && !/\bfence|paling\b/i.test(item))
}

function fenceReinstatement(input: CustomerQuoteAssemblyInput) {
  const items = [...input.quote.customer_scope, ...input.quote.primary_quote.scope]
  return unique(items).filter((item) => /\bremove\s+old\s+fence\b|\battach\s+new\s+standard\s+paling\s+fence\b/i.test(item))
}

function materials(input: CustomerQuoteAssemblyInput) {
  return unique(input.quote.materials).filter((item) => /\bposts?|paling|fence|H4\b/i.test(item))
}

function accessItems(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  if (/\breasonable\s+access\b|\baccess\s+is\s+reasonable\b/i.test(text)) return ["Reasonable access conditions"]
  if (/\btight\s+access\b|\baccess\s+is\s+tight\b/i.test(text)) return ["Tight access conditions"]
  if (/\bpoor\s+access\b|\baccess\s+is\s+poor\b/i.test(text)) return ["Poor access conditions"]
  return []
}

function exclusions(input: CustomerQuoteAssemblyInput) {
  return unique(input.quote.exclusions).map((item) => {
    if (/\bplanting\b/i.test(item)) return "Planting not included"
    return /\bnot\s+included\b/i.test(item) ? item : `${item} not included`
  })
}

export function assembleRetainingCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Retaining Wall Scope", retainingScope(input)),
    section("Fence Reinstatement", fenceReinstatement(input)),
    section("Materials", materials(input)),
    section("Access", accessItems(input)),
    section("Exclusions", exclusions(input)),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: "Retaining Wall Quote",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}

export function hasRetainingAssemblyFacts(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  if (RETAINING_NEGATION_PATTERN.test(text)) return false
  if (/\bretaining\s+wall\b/i.test(text)) return true
  const detection = detectRetainingFromText(text)
  // Require at least medium confidence — "low" confidence from timber-only detection
  // is not sufficient to route a quote through the retaining assembler.
  return detection.is_retaining && detection.confidence !== "low"
}
