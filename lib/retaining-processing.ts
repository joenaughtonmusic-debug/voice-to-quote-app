import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { isFencingTranscript } from "./fencing-processing"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"
import { detectRetainingFromText } from "./trades/retaining"

const RETAINING_PATTERN = /\b(retaining\s+wall|timber\s+retaining|replace\s+(?:old\s+)?retaining|install\s+(?:new\s+)?retaining\s+wall)\b/i
const RETAINING_SUPPORT_PATTERN = /\b(drainage|draincoil|novaflow|scoria|backfill|retaining\s+posts?|H4\s+posts?\s+at\s+\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\s+spacing)\b/i

export function isRetainingTranscript(transcript: string) {
  if (isFencingTranscript(transcript)) return false
  const detection = detectRetainingFromText(transcript)
  return RETAINING_PATTERN.test(transcript) || (detection.is_retaining && RETAINING_SUPPORT_PATTERN.test(transcript))
}

export function buildRetainingProcessedQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  const jobType = isRetainingTranscript(transcript) ? "retaining" : ""
  const retainingScope = retainingScopeItems(transcript)
  const fenceScope = fenceReinstatementItems(transcript)
  const materials = materialItems(transcript)
  const access = accessNote(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: jobType ? "Retaining Wall Quote" : "",
    job_type: jobType,
    materials,
    exclusions: exclusionItems(transcript),
    primary_quote: {
      quote_title: jobType ? "Retaining Wall Quote" : "",
      job_type: jobType,
      cadence: "",
      scope: [...retainingScope, ...fenceScope, ...materials],
      notes: access ? [access] : [],
    },
    customer_scope: [...retainingScope, ...fenceScope],
    internal_notes: [
      postSpacingNote(transcript),
      access,
    ].filter(Boolean),
  }
}

type RetainingNormalizableQuote = ProcessedQuote & {
  plant_calculator_results?: unknown[]
  quote_options?: Array<{ category?: string | null }>
}

export function hasPlantingExcluded(transcript: string) {
  return /\bno\s+planting\s+included\b|\bplanting\s+not\s+included\b|\bno\s+plants?\b|\bplants?\s+not\s+included\b/i.test(transcript)
}

export function normalizeRetainingProcessedQuote<T extends RetainingNormalizableQuote>(quote: T, transcript: string): T {
  if (!isRetainingTranscript(transcript)) return quote

  const retainingQuote = buildRetainingProcessedQuote(transcript)
  const normalized = {
    ...quote,
    quote_title: retainingQuote.quote_title,
    job_type: "retaining",
    primary_quote: {
      ...quote.primary_quote,
      quote_title: retainingQuote.primary_quote.quote_title,
      job_type: "retaining",
      scope: unique([
        ...retainingQuote.primary_quote.scope,
        ...quote.primary_quote.scope.filter((item) => isRetainingRelevantLine(item)),
      ]),
      notes: unique([...retainingQuote.primary_quote.notes, ...quote.primary_quote.notes.filter((item) => isRetainingRelevantLine(item))]),
    },
    customer_scope: unique([
      ...retainingQuote.customer_scope,
      ...quote.customer_scope.filter((item) => isRetainingRelevantLine(item)),
    ]),
    materials: unique([
      ...retainingQuote.materials,
      ...quote.materials.filter((item) => isRetainingRelevantLine(item)),
    ]),
    exclusions: unique([...retainingQuote.exclusions, ...quote.exclusions.filter((item) => !isPlantingCalculatorLine(item))]),
    internal_notes: unique([...quote.internal_notes.filter((item) => !isPlantingCalculatorLine(item)), ...retainingQuote.internal_notes]),
    missing_information: quote.missing_information.filter((item) => !isPlantingCalculatorLine(item)),
    confidence_warnings: quote.confidence_warnings.filter((item) => !isPlantingCalculatorLine(item)),
    line_items: quote.line_items.filter((item) => {
      const text = [item.item_name, item.description, item.item_type, item.match_reason].join(" ")
      return !isPlantingCalculatorLine(text)
    }),
  } as T

  if (hasPlantingExcluded(transcript)) {
    normalized.plant_calculator_results = []
    normalized.quote_options = (normalized.quote_options ?? []).filter((option) => option.category !== "planting")
  }

  if (/\bplanting\b/i.test(normalized.selected_template_name) && hasPlantingExcluded(transcript)) {
    normalized.selected_template_id = ""
    normalized.selected_template_name = ""
    normalized.template_match_confidence = "none"
  }

  return normalized
}

function retainingScopeItems(transcript: string) {
  const items: string[] = []
  if (/\breplace\s+timber\s+retaining\s+wall\b/i.test(transcript)) {
    items.push("Replace timber retaining wall along the back boundary")
  }
  if (/\binstall\s+new\s+retaining\s+wall\b/i.test(transcript)) {
    items.push("Install new retaining wall")
  }
  if (/\bremove\s+old\s+retaining\b|\bold\s+retaining\b/i.test(transcript)) {
    items.push("Remove old retaining")
  }
  return unique(items)
}

function fenceReinstatementItems(transcript: string) {
  const items: string[] = []
  if (/\bremove\s+old\s+fence\b/i.test(transcript)) {
    items.push("Remove old fence")
  }
  if (/\battach\s+new\s+standard\s+paling\s+fence\b/i.test(transcript)) {
    items.push("Attach new standard paling fence after retaining is complete")
  }
  return unique(items)
}

function materialItems(transcript: string) {
  const items: string[] = []
  const postMatch = transcript.match(/\b(\d+\s*x\s*\d+\s+H4\s+posts?)(?:\s+at\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+spacing)?/i)
  if (postMatch?.[1]) {
    const postText = postMatch[1].replace(/\s*x\s*/i, "x").replace(/\s+/g, " ")
    items.push(postMatch[2] ? `${postText} at ${postMatch[2]} metre spacing` : postText)
  }
  if (/\bstandard\s+paling\s+fence\b/i.test(transcript)) {
    items.push("Standard paling fence")
  }
  return unique(items)
}

function postSpacingNote(transcript: string) {
  const match = transcript.match(/\bposts?\s+at\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+spacing\b/i)
  return match?.[1] ? `Post spacing: ${match[1]} metre` : ""
}

function accessNote(transcript: string) {
  if (/\baccess\s+is\s+reasonable\b|\breasonable\s+access\b/i.test(transcript)) return "Reasonable access conditions"
  if (/\baccess\s+is\s+tight\b|\btight\s+access\b/i.test(transcript)) return "Tight access conditions"
  if (/\baccess\s+is\s+poor\b|\bpoor\s+access\b/i.test(transcript)) return "Poor access conditions"
  return ""
}

function exclusionItems(transcript: string) {
  const items: string[] = []
  if (/\bno\s+planting\s+included\b|\bplanting\s+not\s+included\b/i.test(transcript)) {
    items.push("Planting not included")
  }
  return unique(items)
}

function isRetainingRelevantLine(value: string) {
  return /\b(retaining|wall|fence|paling|H4|posts?|access|back boundary|old retaining|old fence)\b/i.test(value)
}

function isPlantingCalculatorLine(value: string) {
  return /\b(planting calculator|planting length|plant quantity|plant library|plant option|planting area|plant multiple|camellia|ficus|griselinia|planting labour|plants?)\b/i.test(
    value,
  )
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
