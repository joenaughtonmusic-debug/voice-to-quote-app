import type { PricingFact } from "../core/pricing-extraction"
import type { SelectedQuoteTemplate } from "../template-renderer"
import { isTeamSiteNote } from "./internal-scope-signals"
import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function stripInternalPrefix(value: string) {
  return cleanLine(value).replace(/^[\s\-•]*(?:scope|note|site\s+note)\s*:\s*/i, "")
}

function lowerKey(value: string) {
  return stripInternalPrefix(value)
    .toLowerCase()
    .replace(/\bgreen\s*waste\b/g, "greenwaste")
    .replace(/^there\s+is\s+a\s+/, "")
    .replace(/^a\s+/, "")
    .replace(/\s+as\s+required$/, "")
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map(cleanLine)
    .filter((value) => {
      const key = lowerKey(value)
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function sentences(text: string) {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map(cleanLine)
    .filter(Boolean)
}

function splitList(value: string) {
  return value
    .split(/\s*,\s*|\s+\band\b\s+/i)
    .map((item) => item.trim().replace(/^(?:and\s+)+/i, ""))
    .filter(Boolean)
}

function sentenceMatching(transcript: string | null | undefined, pattern: RegExp) {
  return sentences(transcript ?? "").find((sentence) => pattern.test(sentence)) ?? ""
}

function sourceSentences(input: CustomerQuoteAssemblyInput) {
  return unique([
    ...sentences(input.rawTranscript ?? ""),
    ...input.quote.customer_scope.flatMap(sentences),
    ...input.quote.primary_quote.scope.flatMap(sentences),
    ...input.quote.primary_quote.notes.flatMap(sentences),
  ])
}

function siteNoteSentences(input: CustomerQuoteAssemblyInput) {
  return unique([
    ...sentences(input.rawTranscript ?? ""),
    ...input.quote.primary_quote.notes.flatMap(sentences),
  ])
}

function mainFocusItems(input: CustomerQuoteAssemblyInput) {
  const explicit = sentenceMatching(input.rawTranscript, /\bmain\s+focus\b/i)
  const source = explicit || input.quote.primary_quote.scope.join(", ")
  const match = source.match(/\bmain\s+focus(?:\s+of\s+visits)?\s*(?:will\s+be|is|are|:)?\s+(.+)$/i)
  const value = match?.[1] ?? source.replace(/\bmain\s+focus(?:\s+of\s+visits)?\b/i, "")
  const cleaned = value
    .replace(/\bwill\s+be\b/i, "")
    .replace(/\bas\s+required\b/i, "")
    .trim()

  return unique(
    splitList(cleaned)
      .map((item) => item.replace(/^main\s+focus\s*(?:of\s+visits)?\s*/i, ""))
      .filter((item) =>
        /\b(weed\w*|prun\w*|trim\w*|pathways?|paths?|clear|self-seeded|removal|spray\w*|maintenance|plant health)\b/i.test(
          item,
        ),
      )
      .map(titleCase),
  )
}

function serviceIncludes(input: CustomerQuoteAssemblyInput, mainFocus: string[]) {
  const pricingIncludes = (input.pricingFacts ?? [])
      .flatMap((fact) => fact.inclusions)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  const includeTranscriptServices = pricingIncludes.length === 0
  const transcriptIncludes = sourceSentences(input).flatMap((sentence) => {
    const items: string[] = []

    if (/\bgreen\s*waste|greenwaste\b/i.test(sentence) && /\b(remove|removed|removal|dispose|disposal|take away|cart away)\b/i.test(sentence)) {
      items.push("Greenwaste removal")
    }

    const eachVisitMatch = includeTranscriptServices
      ? sentence.match(/\beach\s+visit\s+may\s+include\s+(.+)$/i)
      : null
    if (eachVisitMatch?.[1]) {
      items.push(
        ...splitList(eachVisitMatch[1])
          .map((item) => item.replace(/\bas\s+required\b/i, "").trim())
          .filter((item) => !/\bgeneral\s+garden\s+maintenance\b/i.test(item))
          .filter((item) => /\b(weed\w*|spray\w*|plant health|fertili[sz]er|green\s*waste|greenwaste|removal)\b/i.test(item))
          .map(normalizeServiceItem),
      )
    }

    return items
  })

  const focusKeys = new Set(mainFocus.map((item) => item.toLowerCase()))
  return unique([...pricingIncludes, ...transcriptIncludes])
    .map(normalizeServiceItem)
    .filter((item) => !focusKeys.has(item.toLowerCase()))
}

function ongoingMaintenanceItems(input: CustomerQuoteAssemblyInput, mainFocus: string[]) {
  const quoteItems = sourceSentences(input)
    .filter((item) =>
      /\b(?:each\s+)?visits?\s+may\s+include|general\s+garden\s+maintenance|ongoing\s+garden\s+maintenance|scheduled\s+visits?\b/i.test(
        item,
      ),
    )
    .map(ongoingMaintenanceText)
  const templateItems = selectedTemplateWording(input.selectedTemplate).filter((item) =>
    /\bongoing|maintenance|visit\b/i.test(item),
  )

  const items = unique([
    ...quoteItems,
    ...templateItems,
  ]).filter((item) => !mainFocus.some((focus) => lowerKey(focus) === lowerKey(item)))

  const hasDetailedVisitLine = items.some((item) => /^each visit may include\b/i.test(item))
  if (!hasDetailedVisitLine) return uniqueMaintenanceLines(items)

  return items.filter((item) => !/^general garden maintenance(?: as required)?$/i.test(item))
}

function ongoingMaintenanceText(value: string) {
  const cleaned = stripInternalPrefix(value)
    .replace(/\bvisits\s+may\s+include\b/i, "Each visit may include")
    .replace(/\beach\s+visit\s+may\s+include\b/i, "Each visit may include")
  return titleCase(cleaned)
}

function uniqueMaintenanceLines(values: string[]) {
  const hasGeneralAsRequired = values.some((item) => /^general garden maintenance as required$/i.test(item))
  return values.filter((item) => {
    if (hasGeneralAsRequired && /^general garden maintenance$/i.test(item)) return false
    return true
  })
}

function selectedTemplateWording(template?: SelectedQuoteTemplate | null): string[] {
  const content = template?.template_content
  const contentValues =
    content && typeof content === "object"
      ? stringParts([
          (content as Record<string, unknown>).reusable_customer_wording,
          (content as Record<string, unknown>).default_scope,
          (content as Record<string, unknown>).customer_scope,
        ])
      : []

  return unique([...contentValues, ...stringParts(template?.default_scope)])
}

function normalizeServiceItem(value: string) {
  const cleaned = cleanLine(value)
    .replace(/\bremoval\s+of\s+green\s*waste\b/i, "Greenwaste removal")
    .replace(/\bremoval\s+of\s+greenwaste\b/i, "Greenwaste removal")
    .replace(/\bgreen\s*waste\s+removal\b/i, "Greenwaste removal")
    .replace(/\bgreenwaste\s+removal\b/i, "Greenwaste removal")
  return titleCase(cleaned)
}

function stringParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringParts)
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(Boolean)
  }
  if (!value || typeof value !== "object") return []
  return Object.values(value as Record<string, unknown>).flatMap(stringParts)
}

function priceItems(pricingFacts: PricingFact[] | undefined) {
  return unique(
    (pricingFacts ?? [])
      .filter((fact) => fact.type === "fixed_price" && typeof fact.amount === "number")
      .map((fact) => `${money(fact.amount as number)}${cadenceText(fact.cadence)}`),
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

function cadenceText(cadence: PricingFact["cadence"]) {
  if (cadence === "per_visit") return " per visit"
  if (cadence === "per_month") return " per month"
  if (cadence === "per_week") return " per week"
  if (cadence === "monthly") return " monthly"
  // Extended cadences — Pristine Gardens prices per visit, so these read as "per visit".
  // cadenceText is only reached when the pricing extractor captured the cadence from the
  // price sentence itself (e.g. "price $X every 2 months"). For transcripts that say
  // "per visit", the cadence will be "per_visit" regardless of visit frequency.
  if (cadence === "six_weekly") return " per visit"
  if (cadence === "two_monthly") return " per visit"
  if (cadence === "three_monthly") return " per visit"
  if (cadence === "four_monthly") return " per visit"
  return ""
}

function formatSiteNote(value: string) {
  const note = stripInternalPrefix(value).replace(/\bwhich\s+can\s+be\b/i, "may be")

  if (/^(?:(?:there\s+is\s+)?a\s+)?greenwaste\s+bin\s+(?:is\s+)?available\s+on\s+site$/i.test(note)) {
    return "A green waste bin is available on site"
  }

  if (/^(?:(?:there\s+is\s+)?a\s+)?green\s*waste\s+bin\s+(?:is\s+)?available\s+on\s+site$/i.test(note)) {
    return "A green waste bin is available on site"
  }

  return titleCase(note.replace(/^there\s+is\s+a\s+/i, ""))
}

function siteNotes(input: CustomerQuoteAssemblyInput) {
  const notes = siteNoteSentences(input)
    .filter((sentence) => !/^[\s\-•]*(?:title|job\s*type|cadence|scope)\s*:/i.test(sentence))
    .map(stripInternalPrefix)
    // B3: the customer Site Notes section keeps only customer-relevant operational info (e.g. a
    // green waste bin available on site). Team / access / hazard / parking / pet advisories
    // (dog, gates, steep driveway, park on street, keys, alarms) are NOT customer-facing — they
    // stay in the internal notes for the crew. isTeamSiteNote is a belt-and-braces guard on top
    // of the customer-info allowlist.
    .filter((sentence) => /\b(greenwaste\s+bin|green\s*waste\s+bin)\b/i.test(sentence))
    .filter((sentence) => !isTeamSiteNote(sentence))
    .filter((sentence) => !/\b(price|per\s+visit|\$\d|labou?r|hours?)\b/i.test(sentence))
    .map(formatSiteNote)

  return unique(notes)
}

function maintenanceTitle(input: CustomerQuoteAssemblyInput) {
  const explicitTitle = cleanLine(input.quote.quote_title || input.quote.primary_quote.quote_title || "")
  const cadence = cleanLine(input.quote.primary_quote.cadence || "")
  const raw = [
    input.rawTranscript,
    explicitTitle,
    cadence,
    input.quote.job_type,
    input.quote.primary_quote.job_type,
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
    ...input.quote.primary_quote.notes,
  ].filter(Boolean).join(" ")
  const titleWords = explicitTitle.toLowerCase().split(/\s+/).filter(Boolean)
  const genericMaintenanceTitle =
    titleWords.length > 0 && titleWords.every((word) => word === "maintenance" || word === "monthly")

  // Extended cadences — checked before bare "monthly" so "2-monthly" / "3-monthly" etc.
  // in the transcript do not produce "Monthly Maintenance" as the title.
  if (/\b(?:four[-\s]monthly|4[-\s]monthly|every\s+4\s+months?)\b/i.test(raw)) {
    return genericMaintenanceTitle || !explicitTitle ? "4-Monthly Maintenance" : titleCase(explicitTitle)
  }
  if (/\b(?:three[-\s]monthly|3[-\s]monthly|every\s+3\s+months?|quarterly)\b/i.test(raw)) {
    return genericMaintenanceTitle || !explicitTitle ? "3-Monthly Maintenance" : titleCase(explicitTitle)
  }
  if (/\b(?:two[-\s]monthly|2[-\s]monthly|every\s+2\s+months?)\b/i.test(raw)) {
    return genericMaintenanceTitle || !explicitTitle ? "2-Monthly Maintenance" : titleCase(explicitTitle)
  }
  if (/\b(?:six[-\s]weekly|6[-\s]weekly|every\s+6\s+weeks?)\b/i.test(raw)) {
    return genericMaintenanceTitle || !explicitTitle ? "6-Weekly Maintenance" : titleCase(explicitTitle)
  }

  // Bare "monthly" — exclude digit-hyphen prefixed forms that were handled above.
  const isMonthly = /\bmonthly\b/i.test(raw) && !/\b[2-9][-\s]monthly\b/i.test(raw)

  if (genericMaintenanceTitle && isMonthly) return "Monthly Maintenance"
  if (genericMaintenanceTitle) return "Maintenance"
  if (explicitTitle) return titleCase(explicitTitle)
  if (isMonthly) return "Monthly Maintenance"
  return "Maintenance Quote"
}

function section(title: string, items: string[]): CustomerQuoteAssemblySection | null {
  const cleanedItems = unique(items)
  return cleanedItems.length > 0 ? { title, items: cleanedItems } : null
}

export function assembleMaintenanceCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const mainFocus = mainFocusItems(input)
  const sections = [
    section("Main Focus", mainFocus),
    section("Service Includes", serviceIncludes(input, mainFocus)),
    section("Ongoing Maintenance", ongoingMaintenanceItems(input, mainFocus)),
    section("Price", priceItems(input.pricingFacts)),
    section("Site Notes", siteNotes(input)),
    section("Exclusions", input.quote.exclusions),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: maintenanceTitle(input),
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}
