import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"

const FENCING_PATTERN = /\b(timber\s+paling\s+fence|replace\s+(?:\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\s+of\s+)?(?:timber\s+)?(?:paling\s+)?fence|remove\s+existing\s+fence|fence\s+height|posts?,\s*rails?,?\s+and\s+palings?|boundary\s+fence)\b/i

export function isFencingTranscript(transcript: string) {
  return FENCING_PATTERN.test(transcript) && !/\bretaining\s+wall\b/i.test(transcript)
}

export function buildFencingProcessedQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  const jobType = isFencingTranscript(transcript) ? "fencing" : ""
  const scope = fenceScopeItems(transcript)
  const materials = materialItems(transcript)
  const access = accessNote(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: jobType ? "Fencing Quote" : "",
    job_type: jobType,
    materials,
    exclusions: exclusionItems(transcript),
    primary_quote: {
      quote_title: jobType ? "Fencing Quote" : "",
      job_type: jobType,
      cadence: "",
      scope: [...scope, ...fenceDetailItems(transcript), ...materials],
      notes: access ? [access] : [],
    },
    customer_scope: scope,
  }
}

type FencingNormalizableQuote = ProcessedQuote & {
  plant_calculator_results?: unknown[]
  quote_options?: Array<{ category?: string | null }>
}

export function normalizeFencingProcessedQuote<T extends FencingNormalizableQuote>(quote: T, transcript: string): T {
  if (!isFencingTranscript(transcript)) return quote

  const fencingQuote = buildFencingProcessedQuote(transcript)
  const normalized = {
    ...quote,
    quote_title: fencingQuote.quote_title,
    job_type: "fencing",
    selected_template_id: /\bfenc/i.test(quote.selected_template_name) ? quote.selected_template_id : "",
    selected_template_name: /\bfenc/i.test(quote.selected_template_name) ? quote.selected_template_name : "",
    template_match_confidence: /\bfenc/i.test(quote.selected_template_name) ? quote.template_match_confidence : "",
    primary_quote: {
      ...quote.primary_quote,
      quote_title: fencingQuote.primary_quote.quote_title,
      job_type: "fencing",
      scope: unique([
        ...fencingQuote.primary_quote.scope,
        ...quote.primary_quote.scope.filter((item) => isFencingRelevantLine(item)),
      ]),
      notes: unique([...fencingQuote.primary_quote.notes, ...quote.primary_quote.notes.filter((item) => isFencingRelevantLine(item))]),
    },
    customer_scope: unique([
      ...fencingQuote.customer_scope,
      ...quote.customer_scope.filter((item) => isFencingRelevantLine(item)),
    ]),
    materials: unique([
      ...fencingQuote.materials,
      ...quote.materials.filter((item) => isFencingRelevantLine(item)),
    ]),
    exclusions: unique([
      ...fencingQuote.exclusions,
      ...quote.exclusions.filter((item) => isFencingRelevantLine(item) && !/\bretaining\b/i.test(item)),
    ]),
    internal_notes: quote.internal_notes.filter((item) => !/\bretaining\b/i.test(item)),
    missing_information: quote.missing_information.filter((item) => !/\bretaining|wall\b/i.test(item)),
    confidence_warnings: quote.confidence_warnings.filter((item) => !/\bretaining|wall\b/i.test(item)),
    line_items: quote.line_items.filter((item) => {
      const text = [item.item_name, item.description, item.item_type, item.match_reason].join(" ")
      return !/\bretaining\b/i.test(text)
    }),
  } as T

  normalized.plant_calculator_results = []
  normalized.quote_options = (normalized.quote_options ?? []).filter((option) => option.category !== "planting")

  return normalized
}

function fenceScopeItems(transcript: string) {
  const items: string[] = []
  const replaceMatch = transcript.match(/\breplace\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+of\s+timber\s+paling\s+fence\s+along\s+the\s+([^.\n]+)\b/i)
  if (replaceMatch?.[1] && replaceMatch[2]) {
    items.push(`Replace ${replaceMatch[1]} metres of timber paling fence along the ${replaceMatch[2].trim()}`)
  } else if (/\breplace\b.*\btimber\s+paling\s+fence\b/i.test(transcript)) {
    items.push("Replace timber paling fence")
  }

  if (/\bremove\s+existing\s+fence\b/i.test(transcript)) {
    items.push("Remove existing fence")
  }

  return unique(items)
}

function fenceDetailItems(transcript: string) {
  const items: string[] = []
  const lengthMatch = transcript.match(/\breplace\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+of\s+timber\s+paling\s+fence\b/i)
  const heightMatch = transcript.match(/\bfence\s+height\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/i)

  if (lengthMatch?.[1]) items.push(`${lengthMatch[1]} metres long`)
  if (heightMatch?.[1]) items.push(`${heightMatch[1]} metres high`)

  return unique(items)
}

function materialItems(transcript: string) {
  const items: string[] = []
  if (/\bstandard\s+timber\s+posts?\b/i.test(transcript)) items.push("Standard timber posts")
  if (/\brails?\b/i.test(transcript)) items.push("Rails")
  if (/\bpalings?\b/i.test(transcript)) items.push("Palings")
  return unique(items)
}

function accessNote(transcript: string) {
  if (/\baccess\s+is\s+straightforward\b|\bstraightforward\s+access\b/i.test(transcript)) return "Straightforward access conditions"
  if (/\baccess\s+is\s+reasonable\b|\breasonable\s+access\b/i.test(transcript)) return "Reasonable access conditions"
  if (/\baccess\s+is\s+tight\b|\btight\s+access\b/i.test(transcript)) return "Tight access conditions"
  if (/\baccess\s+is\s+poor\b|\bpoor\s+access\b/i.test(transcript)) return "Poor access conditions"
  return ""
}

function exclusionItems(transcript: string) {
  const items: string[] = []
  if (/\bno\s+painting\b|\bpainting\s+not\s+included\b/i.test(transcript)) items.push("Painting not included")
  if (/\bno\s+(?:painting\s+or\s+)?staining\b|\bstaining\s+not\s+included\b/i.test(transcript)) items.push("Staining not included")
  return unique(items)
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.toLowerCase()
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isFencingRelevantLine(value: string) {
  return /\b(fenc|paling|posts?|rails?|access|boundary|painting|staining|metres?\s+(?:long|high))\b/i.test(value)
}
