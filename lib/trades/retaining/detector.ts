import type {
  RetainingCalculatorRequest,
  RetainingDetectionResult,
  RetainingWallKind,
  RetainingWallSectionRequest,
} from "./types"

function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function metresFrom(value: string, unit: string) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return null
  return unit.toLowerCase() === "mm" ? Number((numericValue / 1000).toFixed(3)) : numericValue
}

function wallKind(text: string): RetainingWallKind {
  if (/\breplac(?:e|ing|ement)\b|\brebuild\b|\bremove\s+(?:and\s+)?replace\b/i.test(text)) return "replacement_wall"
  if (/\bnew\s+retaining\b|\bbuild\b|\bconstruct\b|\binstall\b/i.test(text)) return "new_wall"
  return "unknown"
}

function dimensionSections(text: string): RetainingWallSectionRequest[] {
  const sections: RetainingWallSectionRequest[] = []
  const matches = Array.from(
    text.matchAll(
      /(?:(one|first|second|third)\s+wall\s+)?(\d+(?:\.\d+)?)\s*(m|metres?|meters?|mm)\s+long(?:[^.:\n]{0,70}?)(?:approximately|approx\.?|about|around)?\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?|mm)\s+high/gi,
    ),
  )

  matches.forEach((match, index) => {
    const length = metresFrom(match[2], match[3])
    const height = metresFrom(match[4], match[5])
    const sourceText = cleanSentence(match[0])
    sections.push({
      id: `detected-retaining-wall-${index + 1}`,
      label: index === 0 ? "Retaining wall 1" : `Retaining wall ${index + 1}`,
      length_m: length,
      height_m: height,
      source_text: sourceText,
    })
  })

  return sections
}

function wasteNotes(text: string) {
  return Array.from(
    text.matchAll(/(?:remove|dispose|cart|take away)[^.:\n]*(?:waste|old wall|soil|spoil|debris|timber)[^.:\n]*/gi),
  ).map((match) => cleanSentence(match[0]))
}

function buildRequest(text: string): RetainingCalculatorRequest {
  return {
    sections: dimensionSections(text),
    wall_kind: wallKind(text),
    timber_retaining: /\btimber\b/i.test(text),
    drainage_mentioned: /\bdrainage|drain|novaflow|scoria|ag(?:ricultural)?\s+pipe\b/i.test(text),
    posts_mentioned: /\bpost\s+holes?\b|\bposts?\b/i.test(text),
    access_difficulty: /\bdifficult\s+access\b|\baccess\s+is\s+difficult\b|\blimited\s+access\b|\bsteep\b|\btight\s+access\b/i.test(text),
    waste_removal_notes: wasteNotes(text),
    source_text: text,
  }
}

export function detectRetainingFromText(text: string): RetainingDetectionResult {
  const lowerText = text.toLowerCase()
  const reasons: string[] = []
  let score = 0

  if (/\bretaining\b|\bretaining\s+wall\b/.test(lowerText)) {
    score += 50
    reasons.push("Retaining wall terms detected.")
  }

  if (/\btimber\b|\bposts?\b|\bpost\s+holes?\b|\bdrainage\b|\bscoria\b|\bwall\b/.test(lowerText)) {
    score += 20
    reasons.push("Retaining-related structure or material terms detected.")
  }

  const request = buildRequest(text)
  if (request.sections.length > 0) {
    score += Math.min(25, request.sections.length * 15)
    reasons.push(`${request.sections.length} retaining wall dimension${request.sections.length === 1 ? "" : "s"} detected.`)
  }

  if (request.waste_removal_notes && request.waste_removal_notes.length > 0) {
    score += 5
    reasons.push("Waste/removal note detected.")
  }

  const confidence = score >= 75 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "none"

  return {
    is_retaining: confidence !== "none",
    confidence,
    confidence_score: Math.min(score, 100),
    reasons,
    request,
  }
}
