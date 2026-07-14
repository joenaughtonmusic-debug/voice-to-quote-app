const nameGroup = String.raw`([A-Za-zāēīōūĀĒĪŌŪ'’-]+(?:\s+[A-Za-zāēīōūĀĒĪŌŪ'’-]+){0,3})`

const nonClientNamePattern =
  /\b(area|zone|planting|hedge|boundary|driveway|ficus|tuffi|griselinia|lomandra|buxus|pittosporum|flax|plants?|shrubs?|trees?|garden|landscaping|maintenance|electrical|plumbing)\b/i

// Articles / prepositions that are never a client name on their own — reject them
// so a "NAME before address" match on "the hedge, 54 X Road" can't yield "The".
const stopWordName = /^(the|a|an|to|at|for|in|on|of|and|it|this|that|is|was|job|quote)$/i

// Street suffixes for the "NAME <number> <street>" lead form (e.g. "Dan 54 Marua Road").
const streetSuffix =
  String.raw`(?:Road|Rd|Street|St|Drive|Dr|Avenue|Ave|Lane|Ln|Crescent|Cres|Place|Pl|Way|Close|Court|Ct|Terrace|Tce|Parade|Esplanade|Highway|Hwy|View|Rise|Grove|Gardens|Square|Quay|Track|Loop|Mews|Point|Cove)`

function cleanClientName(value: string | undefined) {
  if (!value) return null

  const trimmed = value.replace(/[.:,;!?]+$/g, "").replace(/\s+/g, " ").trim()
  if (!trimmed || trimmed.length < 2) return null
  if (nonClientNamePattern.test(trimmed)) return null

  const words = trimmed.split(/\s+/).filter(Boolean).filter((word) => !stopWordName.test(word)).slice(0, 4)
  if (words.length === 0) return null

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

function stripVisitPhrasePrefix(value: string) {
  return value
    .replace(/^(?:just\s+)?went\s+(?:and\s+)?(?:saw|to\s+see)\s+/i, "")
    .replace(/^went\s+to\s+see\s+/i, "")
    .trim()
}

export function extractClientNameFromTranscript(transcript: string) {
  const patterns = [
    // NAME directly before a street address, no "at"/"for" connector:
    // "Dan 54 Marua Road", "Dan Smith, 54 Marua Road", "quote for Dan 54 Marua Road".
    // Name limited to 1-2 words so a leading connector (for/saw/…) wins over a
    // greedy grab of the words before it.
    new RegExp(
      String.raw`(?:^|[.!?,]\s+|\bfor\s+|\bsaw\s+|\bsee\s+|\b(?:client|customer)\s+)([A-Za-zāēīōūĀĒĪŌŪ'’.-]+(?:\s+[A-Za-zāēīōūĀĒĪŌŪ'’.-]+)?)\s*,?\s+\d{1,5}[A-Za-z]?\s+(?:[A-Za-zāēīōūĀĒĪŌŪ'’-]+\s+){0,5}${streetSuffix}\b`,
      "i",
    ),
    new RegExp(String.raw`\b(?:just\s+)?went\s+(?:and\s+)?saw\s+${nameGroup}\s+at\s+`, "i"),
    new RegExp(String.raw`\bwent\s+to\s+see\s+${nameGroup}\s+at\s+`, "i"),
    new RegExp(String.raw`\bquote\s+for\s+${nameGroup}\s*(?:[.!?:,\n]|$)`, "i"),
    new RegExp(String.raw`\bfor\s+${nameGroup}\s+at\s+\d`, "i"),
    new RegExp(String.raw`\b(?:client|customer)\s+${nameGroup}\s*(?:[.!?:,\n]|$)`, "i"),
  ]

  for (const pattern of patterns) {
    const match = transcript.match(pattern)
    const clientName = cleanClientName(stripVisitPhrasePrefix(match?.[1] ?? ""))
    if (clientName) return clientName
  }

  return null
}
