const nameGroup = String.raw`([A-Za-zāēīōūĀĒĪŌŪ'’-]+(?:\s+[A-Za-zāēīōūĀĒĪŌŪ'’-]+){0,3})`

const nonClientNamePattern =
  /\b(area|zone|planting|hedge|boundary|driveway|ficus|tuffi|griselinia|lomandra|buxus|pittosporum|flax|plants?|shrubs?|trees?|garden|landscaping|maintenance|electrical|plumbing)\b/i

function cleanClientName(value: string | undefined) {
  if (!value) return null

  const trimmed = value.replace(/[.:,;!?]+$/g, "").replace(/\s+/g, " ").trim()
  if (!trimmed || trimmed.length < 2) return null
  if (nonClientNamePattern.test(trimmed)) return null

  const words = trimmed.split(/\s+/).filter(Boolean).slice(0, 4)
  if (words.length === 0) return null

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

export function extractClientNameFromTranscript(transcript: string) {
  const patterns = [
    new RegExp(String.raw`\bquote\s+for\s+${nameGroup}\s*(?:[.!?:,\n]|$)`, "i"),
    new RegExp(String.raw`\b(?:client|customer)\s+${nameGroup}\s*(?:[.!?:,\n]|$)`, "i"),
  ]

  for (const pattern of patterns) {
    const match = transcript.match(pattern)
    const clientName = cleanClientName(match?.[1])
    if (clientName) return clientName
  }

  return null
}
