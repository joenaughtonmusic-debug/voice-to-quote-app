import type { PavingAreaRequest, PavingDetectionResult } from "./types"

function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function inferPaverDimensions(text: string): { paver_length_mm: number | null; paver_width_mm: number | null } {
  // Match paver dims like "450x450", "450 by 450", "600x300" — 2-4 digit mm values near "pavers"
  const match = text.match(/\b(\d{2,4})\s*(?:mm)?\s*(?:x|×|by)\s*(\d{2,4})\s*(?:mm)?\s*(?:concrete|porcelain|natural\s+stone|bluestone|sandstone|brick)?\s*pavers?/i)
  if (!match) return { paver_length_mm: null, paver_width_mm: null }
  return { paver_length_mm: Number(match[1]), paver_width_mm: Number(match[2]) }
}

function inferPaverType(text: string): string | null {
  const match = text.match(/\b(\d{2,4})\s*(?:mm)?\s*(?:x|×|by)\s*(\d{2,4})\s*(?:mm)?\s*(concrete|porcelain|natural\s+stone|bluestone|sandstone|brick)?\s*pavers?/i)
  if (!match) return null
  const size = `${match[1]}x${match[2]}`
  const material = match[3] ? ` ${match[3].toLowerCase().replace(/\s+/g, " ")}` : ""
  return `${size}${material} pavers`
}

function dimensionAreas(
  text: string,
  paverDims: { paver_length_mm: number | null; paver_width_mm: number | null },
  paverType: string | null,
): PavingAreaRequest[] {
  // Match area dims expressed in metres: "3.5m x 6m", "4m × 3m", "2m by 5m"
  // Requires at least the first number to be followed by "m" to exclude paver mm dims
  const matches = Array.from(
    text.matchAll(/(\d+(?:\.\d+)?)\s*m\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*m?/gi),
  )

  return matches.map((match, index) => {
    const matchStart = match.index ?? 0
    const nearbyStart = Math.max(0, matchStart - 80)
    const nearbyEnd = Math.min(text.length, matchStart + match[0].length + 80)
    const nearbyText = text.slice(nearbyStart, nearbyEnd)
    const isReplacement = /replac|re-?lay|existing\s+pavers?/i.test(nearbyText)

    return {
      id: `detected-paving-area-${index + 1}`,
      label: index === 0 ? "Paving area 1" : `Paving area ${index + 1}`,
      length_m: Number(match[1]),
      width_m: Number(match[2]),
      paver_length_mm: paverDims.paver_length_mm,
      paver_width_mm: paverDims.paver_width_mm,
      paver_type: paverType,
      install_scope: isReplacement ? "replacement" : "unknown",
      source_text: cleanSentence(match[0]),
    }
  })
}

function wasteNotes(text: string): string[] {
  return Array.from(
    text.matchAll(/(?:remove|dispose|cart|take\s+away)[^.:\n]*(?:waste|old\s+pavers?|offcuts|debris)[^.:\n]*/gi),
  ).map((match) => cleanSentence(match[0]))
}

export function detectPavingFromText(text: string): PavingDetectionResult {
  const lowerText = text.toLowerCase()
  const reasons: string[] = []
  let score = 0

  if (/\bpav(?:ing|ers?|ed)\b/.test(lowerText)) {
    score += 45
    reasons.push("Paving terms detected.")
  }

  if (/\bpatio|path(?:way)?|driveway\b/.test(lowerText)) {
    score += 15
    reasons.push("Paving surface terms detected.")
  }

  if (/\bbasecourse|base\s+course|bedding\s+sand|compacted\b/.test(lowerText)) {
    score += 20
    reasons.push("Paving substrate terms detected.")
  }

  const paverDims = inferPaverDimensions(text)
  const paverType = inferPaverType(text)
  if (paverDims.paver_length_mm !== null) {
    score += 20
    reasons.push("Paver dimensions detected.")
  }

  const areas = dimensionAreas(text, paverDims, paverType)
  if (areas.length > 0) {
    score += Math.min(20, areas.length * 15)
    reasons.push(`${areas.length} paving area dimension${areas.length === 1 ? "" : "s"} detected.`)
  }

  const waste_removal_notes = wasteNotes(text)
  if (waste_removal_notes.length > 0) {
    score += 5
    reasons.push("Waste/removal note detected.")
  }

  const confidence = score >= 75 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "none"

  return {
    is_paving: confidence !== "none",
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
