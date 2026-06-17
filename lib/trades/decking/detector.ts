import type { DeckingAreaRequest, DeckingDetectionResult } from "./types"

function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function inferBoardType(text: string) {
  const match = text.match(/\b(pine|kwila|vitex|composite|hardwood|timber)\b(?:\s+deck(?:ing)?)?/i)
  return match?.[1] ? match[1].toLowerCase() : null
}

function dimensionAreas(text: string): DeckingAreaRequest[] {
  const matches = Array.from(
    text.matchAll(/(?:(build|construct|replace|install|supply\s+and\s+install)[^.:\n]*?)?(\d+(?:\.\d+)?)\s*m?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:metres?|m)\b([^.:\n]*)/gi),
  )

  return matches.map((match, index) => {
    const leadingAction = (match[1] ?? "").toLowerCase()
    const trailingText = match[4] ?? ""
    const matchIndex = match.index ?? 0
    const previousBoundary = Math.max(text.lastIndexOf(".", matchIndex), text.lastIndexOf("\n", matchIndex))
    const nextDot = text.indexOf(".", matchIndex + match[0].length)
    const nextNewline = text.indexOf("\n", matchIndex + match[0].length)
    const nextBoundaries = [nextDot, nextNewline].filter((value) => value >= 0)
    const nextBoundary = nextBoundaries.length > 0 ? Math.min(...nextBoundaries) : text.length
    const nearbyContext = cleanSentence(text.slice(previousBoundary + 1, nextBoundary))
    const sourceText = cleanSentence(match[0])
    const existingPosts = /\bposts?\s+(?:already\s+)?exist\b|\bexisting\s+posts?\b/i.test(trailingText) ? "yes" : "unknown"
    const existingSubframe = /\bexisting\s+subframe\b|\bsubframe\s+(?:already\s+)?exist\b|\bsubframe\s+(?:is\s+|are\s+)?retained\b/i.test(trailingText)
      ? "yes"
      : "unknown"
    const boardsOnly = /\breplace\b/i.test(leadingAction) || /\bboards?\s+only\b|\breplace\s+decking\s+boards?\b/i.test(nearbyContext)
    const fullBuild = (/\bbuild|construct\b/i.test(leadingAction) || /\bbuild|construct\b/i.test(nearbyContext)) && !boardsOnly

    return {
      id: `detected-deck-area-${index + 1}`,
      label: index === 0 ? "Deck area 1" : `Deck area ${index + 1}`,
      length_m: Number(match[2]),
      width_m: Number(match[3]),
      board_type: inferBoardType(sourceText),
      build_scope: fullBuild ? "full_build" : boardsOnly ? "decking_boards_only" : "unknown",
      subframe_needed: fullBuild ? "yes" : boardsOnly ? "no" : "unknown",
      existing_posts: existingPosts,
      existing_subframe: existingSubframe,
      existing_framing_notes: [existingPosts === "yes" ? "Existing posts noted." : "", existingSubframe === "yes" ? "Existing subframe noted." : ""].filter(Boolean),
      source_text: sourceText,
    }
  })
}

function wasteNotes(text: string) {
  return Array.from(text.matchAll(/(?:remove|dispose|cart|take away)[^.:\n]*(?:waste|old decking|offcuts|debris)[^.:\n]*/gi)).map(
    (match) => cleanSentence(match[0]),
  )
}

export function detectDeckingFromText(text: string): DeckingDetectionResult {
  const lowerText = text.toLowerCase()
  const reasons: string[] = []
  let score = 0

  if (/\bdeck(?:ing)?\b/.test(lowerText)) {
    score += 45
    reasons.push("Decking terms detected.")
  }

  if (/\bsubframe|bearers?|joists?|decking\s+boards?|posts?\b/.test(lowerText)) {
    score += 25
    reasons.push("Deck structure terms detected.")
  }

  const areas = dimensionAreas(text)
  if (areas.length > 0) {
    score += Math.min(25, areas.length * 15)
    reasons.push(`${areas.length} deck area dimension${areas.length === 1 ? "" : "s"} detected.`)
  }

  const waste_removal_notes = wasteNotes(text)
  if (waste_removal_notes.length > 0) {
    score += 5
    reasons.push("Waste/removal note detected.")
  }

  const confidence = score >= 75 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "none"

  return {
    is_decking: confidence !== "none",
    confidence,
    confidence_score: Math.min(score, 100),
    reasons,
    request: {
      areas,
      waste_removal_notes,
      source_text: text,
    },
  }
}
