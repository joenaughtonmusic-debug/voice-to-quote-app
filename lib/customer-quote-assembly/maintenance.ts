import type { PricingFact } from "../core/pricing-extraction"
import type { SelectedQuoteTemplate } from "../template-renderer"
import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
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

function mainFocusItems(input: CustomerQuoteAssemblyInput) {
  const explicit = sentenceMatching(input.rawTranscript, /\bmain\s+focus\b/i)
  const source = explicit || input.quote.primary_quote.scope.join(", ")
  const match = source.match(/\bmain\s+focus(?:\s+of\s+visits)?\s*(?:will\s+be|is|are|:)?\s+(.+)$/i)
  const value = match?.[1] ?? source
  const cleaned = value
    .replace(/\bwill\s+be\b/i, "")
    .replace(/\bas\s+required\b/i, "")
    .trim()

  return unique(
    splitList(cleaned)
      .map((item) => item.replace(/^main\s+focus\s*(?:of\s+visits)?\s*/i, ""))
      .filter((item) => /\b(weed\w*|prun\w*|trim\w*|self-seeded|removal|spray\w*|maintenance|plant health)\b/i.test(item))
      .map(titleCase),
  )
}

function serviceIncludes(input: CustomerQuoteAssemblyInput, mainFocus: string[]) {
  const pricingIncludes = (input.pricingFacts ?? [])
      .flatMap((fact) => fact.inclusions)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  const includeTranscriptServices = pricingIncludes.length < 2
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
  const transcriptItem = ongoingMaintenanceText(sentenceMatching(input.rawTranscript, /\beach\s+visit\s+may\s+include\b/i))
  const scopeItems = input.quote.customer_scope.filter((item) =>
    /\beach\s+visit\s+may\s+include|general\s+garden\s+maintenance|ongoing\s+garden\s+maintenance|scheduled\s+visits?\b/i.test(
      item,
    ),
  ).map(ongoingMaintenanceText)
  const templateItems = selectedTemplateWording(input.selectedTemplate).filter((item) =>
    /\bongoing|maintenance|visit\b/i.test(item),
  )

  return unique([
    transcriptItem,
    ...scopeItems,
    ...templateItems,
  ]).filter((item) => !mainFocus.some((focus) => focus.toLowerCase() === item.toLowerCase()))
}

function ongoingMaintenanceText(value: string) {
  const match = value.match(/\bgeneral\s+garden\s+maintenance(?:\s+as\s+required)?\b/i)
  if (match?.[0]) return titleCase(match[0])
  return value
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
  return ""
}

function siteNotes(input: CustomerQuoteAssemblyInput) {
  const notes = sourceSentences(input)
    .filter((sentence) =>
      /\b(greenwaste\s+bin|green\s*waste\s+bin|dog|gate|gates|access|parking|key|lock|alarm|neighbou?r|tenant)\b/i.test(
        sentence,
      ),
    )
    .filter((sentence) => !/\b(price|per\s+visit|\$\d|labou?r|hours?)\b/i.test(sentence))
    .map((sentence) => sentence.replace(/\bthere\s+is\s+a\s+/i, "").replace(/\bwhich\s+can\s+be\b/i, "may be"))

  return unique(notes.map((note) => titleCase(note)))
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
    title: input.quote.quote_title || input.quote.primary_quote.quote_title || "Maintenance Quote",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}
