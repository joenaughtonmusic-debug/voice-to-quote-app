import { extractAddressDetails } from "./address-extraction"
import { extractClientNameFromTranscript } from "./client-name-extraction"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "./processed-quote"

const GARDEN_TIDY_PATTERN =
  /\b(one[-\s]?off\s+garden\s+tidy|garden\s+tidy|tidy\s+up|overgrowth|cut\s+back\s+shrubs?|weed\s+garden\s+beds?|remove\s+self[-\s]?seeded\s+plants?)\b/i

export function isGardenTidyTranscript(transcript: string) {
  return GARDEN_TIDY_PATTERN.test(transcript)
}

export function buildGardenTidyProcessedQuote(transcript: string): ProcessedQuote {
  const address = extractAddressDetails(transcript)
  const scope = extractGardenTidyScope(transcript)

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extractClientNameFromTranscript(transcript) ?? "",
    site_address: address.cleaned_address ?? "",
    quote_title: "One-Off Garden Tidy",
    job_type: isGardenTidyTranscript(transcript) ? "garden_tidy" : "",
    labour_allowance: extractGardenTidyLabourAllowance(transcript),
    greenwaste: extractGreenwasteSiteNote(transcript),
    primary_quote: {
      quote_title: "One-Off Garden Tidy",
      job_type: isGardenTidyTranscript(transcript) ? "garden_tidy" : "",
      cadence: "",
      scope,
      notes: extractGardenTidySiteNotes(transcript),
    },
    customer_scope: scope,
  }
}

function extractGardenTidyScope(transcript: string) {
  const sentences = transcriptSentences(transcript)
  const items = sentences
    .map((sentence) => {
      if (/\bremove\s+overgrowth\b/i.test(sentence)) return "Remove overgrowth around boundary"
      if (/\bcut\s+back\s+shrubs?\b/i.test(sentence)) return "Cut back shrubs"
      if (/\bweed\s+garden\s+beds?\b/i.test(sentence)) return "Weed garden beds"
      if (/\bremove\s+self[-\s]?seeded\s+plants?\b/i.test(sentence)) return "Remove self-seeded plants"
      return ""
    })
    .filter(Boolean)

  return unique(items)
}

function extractGardenTidyLabourAllowance(transcript: string) {
  const dayMatch = transcript.match(/\ballow\s+(?:one|1)\s+full\s+day\s+for\s+(two|2)\s+(?:staff|people|persons?)\b/i)
  if (dayMatch) return "1 day, 2 staff"

  const numericMatch = transcript.match(/\ballow\s+(\d+(?:\.\d+)?)\s+days?\s+for\s+(\d+)\s+(?:staff|people|persons?)\b/i)
  if (numericMatch?.[1] && numericMatch[2]) return `${numericMatch[1]} day, ${numericMatch[2]} staff`

  return ""
}

function extractGardenTidySiteNotes(transcript: string) {
  const note = extractGreenwasteSiteNote(transcript)
  return note ? [note] : []
}

function extractGreenwasteSiteNote(transcript: string) {
  if (/\bgreen\s*waste|greenwaste\b/i.test(transcript) && /\bremoved?\s+from\s+site|to\s+be\s+removed\s+from\s+site\b/i.test(transcript)) {
    return "Greenwaste removed from site"
  }

  return ""
}

function transcriptSentences(transcript: string) {
  return transcript
    .split(/\n|(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim())
    .filter(Boolean)
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
