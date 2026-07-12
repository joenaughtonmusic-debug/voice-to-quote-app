import type { PricingFact } from "../core/pricing-extraction"
import { resolveLabourExportPrice } from "../export/labour-line-builder"
import { resolveGreenwasteExportPrice } from "../export/waste-line-builder"
import type { XeroPayloadQuote } from "../export/xero/types"
import { hasInternalScopeSignal } from "./internal-scope-signals"
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


function isEmptyOrPlaceholderScopeItem(value: string) {
  const cleaned = cleanLine(value)
  return !cleaned || cleaned === "[]" || /^\[\s*\]$/.test(cleaned)
}

function isPlantLibraryPricingLine(value: string) {
  const cleaned = cleanLine(value)
  return (
    /^\$[\d,]+(?:\.\d{1,2})?$/.test(cleaned) ||
    /\b(?:unit\s+price|sell\s+price|plant\s+library|selected\s+plant\s+option)\b/i.test(cleaned)
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
  const expanded = items.flatMap(splitCompoundGreenwasteLine)
  const byKey = new Map<string, string>()

  for (const raw of expanded) {
    const item = normalizeScopeItem(raw)
    if (!item) continue
    const key = greenwasteQuantityKey(item)
    const existing = byKey.get(key)
    if (!existing || preferGreenwasteLine(item, existing) === item) {
      byKey.set(key, item)
    }
  }

  return [...byKey.values()]
}

function splitCompoundGreenwasteLine(value: string): string[] {
  const cleaned = cleanLine(value)
  if (!/\band\b/i.test(cleaned)) return [cleaned]

  const parts = cleaned
    .split(/\s*,?\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length > 1 && parts.every((part) => isGreenwasteQuantityLine(part))) {
    return parts
  }

  return [cleaned]
}

function greenwasteQuantityKey(value: string): string {
  const cleaned = cleanLine(value)
    .toLowerCase()
    .replace(/\bgreen\s*waste\b/g, "greenwaste")
    .replace(/\b(?:approximately|about|around|expected)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const fractionTrailer = cleaned.match(
    /\b(?:one|two|three|four|five|\d+|half|quarter|third|three quarters|one quarter)(?:\s+\w+){0,8}?\s+trailer/i,
  )
  if (fractionTrailer) return fractionTrailer[0].replace(/\s+/g, " ").trim()

  const loads = cleaned.match(/\b(?:one|two|three|four|five|\d+)\s+trailer\s+loads?\b/i)
  if (loads) return loads[0].replace(/\s+/g, " ").trim()

  return cleaned
}

function preferGreenwasteLine(candidate: string, incumbent: string) {
  const score = (line: string) => {
    const cleaned = cleanLine(line).toLowerCase()
    let value = 0
    if (/\bgreenwaste\b/i.test(cleaned)) value += 4
    if (/\bfor\b/i.test(cleaned)) value += 2
    if (/\b(?:tree|hedge|pruning|trimming)\b/i.test(cleaned)) value += 1
    if (/\bapproximately\b/i.test(cleaned)) value -= 1
    return value
  }

  const candidateScore = score(candidate)
  const incumbentScore = score(incumbent)
  if (candidateScore !== incumbentScore) {
    return candidateScore > incumbentScore ? candidate : incumbent
  }

  return candidate.length <= incumbent.length ? candidate : incumbent
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
    .filter((item) => !isEmptyOrPlaceholderScopeItem(item))
    .filter((item) => !/^(?:title|job\s+type|cadence)\s*:/i.test(item))
    .filter((item) => !/^\$[\d,]+\b|^price\s+\$[\d,]+/i.test(item))
    .filter((item) => !isPlantLibraryPricingLine(item))
    .filter((item) => !/\bremoved?\s+from\s+site\b/i.test(item))
    .filter((item) => !/^(?:labour|greenwaste|green\s*waste|materials?|pricing)\s+note$/i.test(item))
    .filter((item) => !hasInternalScopeSignal(item))
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

/** Removes any hourly/day rate from an allowance line so a rate never reaches the customer. */
function stripLabourRate(text: string) {
  return cleanLine(text)
    .replace(/\bat\s+\$\s?\d[\d,]*(?:\.\d+)?\s*(?:per|an|\/)\s*(?:hour|hr|day)\b/gi, "")
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?\s*(?:per|an|\/)\s*(?:hour|hr|day)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;]+$/g, "")
    .trim()
}

/**
 * Customer Labour section. When a labour TOTAL was explicitly spoken (a fixed price, or an
 * inline "N hours at $R" e.g. "5 hours at $80/hr" → $400) it is shown as a $ total in Joe's
 * format. Otherwise the crew/duration allowance is shown with the hourly rate stripped
 * (never leak a rate); the export layer flags the missing price for review.
 */
/** The quote passed to the export resolvers, with the transcript the assembler was given so the
 * deterministic transcript-parsed spoken totals (T1) fire in the customer draft too. */
function quoteWithTranscript(input: CustomerQuoteAssemblyInput): XeroPayloadQuote {
  return { ...input.quote, raw_transcript: input.rawTranscript ?? null } as unknown as XeroPayloadQuote
}

function labourSectionItems(input: CustomerQuoteAssemblyInput): string[] {
  const resolved = resolveLabourExportPrice(quoteWithTranscript(input))
  if (
    (resolved.pricingSource === "spoken_fixed" ||
      resolved.pricingSource === "inline_hours_rate" ||
      resolved.pricingSource === "computed_day_rate") &&
    resolved.amount > 0
  ) {
    return [money(resolved.amount)]
  }

  return labourAllowanceItems(input).map(stripLabourRate).filter(Boolean)
}

/**
 * Customer Green Waste section. When a greenwaste TOTAL was spoken ("$130 of green waste")
 * or priced on a line item, it is shown as its own priced line (with the quantity descriptor
 * when available). Otherwise the captured quantity (e.g. trailer loads) is shown, unpriced —
 * business-rule greenwaste pricing is a separate follow-up (B2).
 */
function greenwasteSectionItems(input: CustomerQuoteAssemblyInput): string[] {
  const resolved = resolveGreenwasteExportPrice(quoteWithTranscript(input))
  // Only a greenwaste total spoken in the greenwaste field is reliable enough to show the
  // customer as a $ line. A greenwaste line_item total is skipped here because AI extraction
  // can misread a time-unit quantity ("1.5 days") as a dollar amount ($1.50); business-rule
  // greenwaste pricing is the separate B2 batch.
  if (
    resolved.pricingSource === "spoken_greenwaste" &&
    typeof resolved.amount === "number" &&
    resolved.amount > 0
  ) {
    const quantity = greenwasteQuantityItems(input)[0]
    return [quantity ? `${quantity} — ${money(resolved.amount)}` : `Greenwaste removal — ${money(resolved.amount)}`]
  }

  return greenwasteQuantityItems(input)
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
    section("Labour Allowance", labourSectionItems(input)),
    section("Green Waste", greenwasteSectionItems(input)),
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
