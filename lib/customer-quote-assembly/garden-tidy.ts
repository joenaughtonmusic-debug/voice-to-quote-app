import type { PricingFact } from "../core/pricing-extraction"
import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

/** Temporary runtime marker — remove after Shirley live-path verification. */
export const GARDEN_TIDY_RUNTIME_MARKER = "SHIRLEY_DEBUG_2026_06_22_A"
export const GARDEN_TIDY_SOURCE_VERSION = "lib/customer-quote-assembly/garden-tidy.ts@v2026-06-22-shirley-debug"

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

const LABOUR_PATTERN =
  /\b(?:\d+|one|two|three|four|five)\s+(?:people|persons?|staff|men|man)\b.*?\b(?:day|hour|hr)s?\b|\b(?:one|two|three|four|five|\d+)\s+(?:and\s+a\s+(?:half|quarter|third))\s+(?:day|hour|hr)s?\b|\bjob\s+will\s+take\b.*?\b(?:day|hour|hr)s?\b/i

const TRAILER_PATTERN =
  /\btrailer\s+loads?|(?:\d+|one|two|three|four|five|half|quarter|third)\s+(?:of\s+a\s+)?trailer/i

function isLabourAllowanceLine(value: string) {
  return LABOUR_PATTERN.test(cleanLine(value))
}

function isGreenwasteQuantityLine(value: string) {
  const cleaned = cleanLine(value)
  return (
    TRAILER_PATTERN.test(cleaned) ||
    (/\bgreen\s*waste|greenwaste\b/i.test(cleaned) &&
      /\b(?:load|loads|trailer|skip|bin|tip|m³|m3|cubic)\b/i.test(cleaned))
  )
}

function isServiceIncludeBoilerplate(value: string) {
  const cleaned = cleanLine(value).toLowerCase()
  return (
    /^one-off garden tidy including greenwaste removal\.?$/.test(cleaned) ||
    /^garden tidy including greenwaste removal\.?$/.test(cleaned) ||
    (/\bincluding greenwaste removal\b/i.test(cleaned) &&
      !/\b(prune|trim|hedge|cut|tree|elder|blowdown|blow down|tidy|weed|shrub|reduce)\b/i.test(cleaned))
  )
}

function dedupeGreenwasteLines(items: string[]) {
  const cleaned = unique(items.map(normalizeScopeItem))
  return cleaned.filter((item, _, all) => {
    const key = item.toLowerCase()
    return !all.some((other) => other !== item && other.toLowerCase().includes(key) && other.length > item.length)
  })
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Returns all customer-facing scope items from customer_scope and primary_quote.scope.
 * Excludes:
 * - Internal metadata lines (Title:, Job type:, Cadence:)
 * - Raw price lines
 * - Greenwaste disposal notes (those belong in Site Notes / Green Waste sections)
 * - Bare placeholder labels the AI inserts when it has no content for a field
 *   (e.g. "labour note", "greenwaste note" in primary_quote.scope from hedge_trimming
 *   extraction — these signal empty structured fields, not actual scope work items)
 *
 * No keyword filter on garden activities — hedge trimming, pruning, blowdown, tidy
 * all pass through. The live path merges primary_quote.notes into customer_scope
 * before calling the assembler, so disposal notes must be filtered here.
 */
function scopeOfWorkItems(input: CustomerQuoteAssemblyInput): string[] {
  return unique([
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
  ])
    .filter((item) => !/^(?:title|job\s+type|cadence)\s*:/i.test(item))
    .filter((item) => !/^\$[\d,]+\b|^price\s+\$[\d,]+/i.test(item))
    .filter((item) => !/\bremoved?\s+from\s+site\b/i.test(item))
    .filter((item) => !/^(?:labour|greenwaste|green\s*waste|materials?|pricing)\s+note$/i.test(item))
    .filter((item) => !isLabourAllowanceLine(item))
    .filter((item) => !isGreenwasteQuantityLine(item))
    .filter((item) => !isServiceIncludeBoilerplate(item))
    .map(normalizeScopeItem)
    .filter(Boolean)
}

/**
 * Returns labour allowance items from:
 * 1. quote.labour_allowance (primary structured field)
 * 2. customer_scope / primary_quote scope / notes lines that describe crew size and duration
 * 3. rawTranscript fallback — splits into sentences to avoid greedy cross-sentence matching
 */
function labourAllowanceItems(input: CustomerQuoteAssemblyInput): string[] {
  if (input.quote.labour_allowance?.trim()) {
    return [normalizeScopeItem(input.quote.labour_allowance)]
  }

  const structuredLine = [
    ...input.quote.primary_quote.notes,
    ...input.quote.primary_quote.scope,
    ...input.quote.customer_scope,
  ].find((item) => isLabourAllowanceLine(item))

  if (structuredLine) {
    return [normalizeScopeItem(structuredLine)]
  }

  if (input.rawTranscript) {
    const labourSentence = splitSentences(input.rawTranscript).find((s) => isLabourAllowanceLine(s))
    if (labourSentence) {
      return [normalizeScopeItem(labourSentence)]
    }
  }

  return []
}

/**
 * Returns quantified greenwaste items (trailer loads, skip bins, etc.) from:
 * 1. quote.greenwaste field and primary_quote notes/scope
 * 2. customer_scope lines with quantity info
 * 3. rawTranscript fallback
 *
 * Returns empty when only "removed from site" style notes exist — those go to Site Notes.
 */
function greenwasteQuantityItems(input: CustomerQuoteAssemblyInput): string[] {
  const structuredCandidates = [
    input.quote.greenwaste,
    ...input.quote.primary_quote.notes,
    ...input.quote.primary_quote.scope,
  ].filter((item): item is string => Boolean(item))

  const structuredMatches = dedupeGreenwasteLines(structuredCandidates.filter(isGreenwasteQuantityLine))
  if (structuredMatches.length > 0) {
    return structuredMatches
  }

  const scopeMatches = dedupeGreenwasteLines(input.quote.customer_scope.filter(isGreenwasteQuantityLine))
  if (scopeMatches.length > 0) {
    return scopeMatches
  }

  if (input.rawTranscript) {
    const sentences = dedupeGreenwasteLines(splitSentences(input.rawTranscript).filter(isGreenwasteQuantityLine))
    if (sentences.length > 0) {
      return sentences
    }
  }

  return []
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
    section("Scope of Work", scopeOfWorkItems(input)),
    section("Labour Allowance", labourAllowanceItems(input)),
    section("Green Waste", greenwasteQuantityItems(input)),
    section("Service Includes", serviceIncludes(input)),
    section("Price", priceItems(input.pricingFacts)),
    section("Site Notes", siteNotes(input)),
    section("Exclusions", input.quote.exclusions),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  if (typeof console !== "undefined") {
    console.log("[SHIRLEY_DEBUG_GARDEN_TIDY_ASSEMBLY]", {
      marker: GARDEN_TIDY_RUNTIME_MARKER,
      source: GARDEN_TIDY_SOURCE_VERSION,
      customer_scope_count: input.quote.customer_scope.length,
      primary_quote_scope_count: input.quote.primary_quote.scope.length,
      primary_quote_notes_count: input.quote.primary_quote.notes.length,
      section_titles: sections.map((item) => item.title),
    })
  }

  return {
    title: "One-Off Garden Tidy",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}
