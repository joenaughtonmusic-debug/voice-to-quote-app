import type { QuoteFact } from "../../core/quote-facts"
import type { RetainingCalculatorResult } from "./types"

export type RetainingReviewSection = {
  label: string
  dimensionsText: string
  areaText: string
  notices: string[]
}

export type RetainingReviewModel = {
  detected: boolean
  sections: RetainingReviewSection[]
  totalAreaText?: string
  wallKindText: string
  timberRetaining: boolean
  drainageMentioned: boolean
  postsMentioned: boolean
  accessDifficulty: boolean
  wasteRemovalNotes: string[]
  notices: string[]
}

function numberText(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : null
}

function numberTextFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : null
}

function heightText(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < 1) return `${Number((value * 1000).toFixed(0))}mm`
  return `${Number(value.toFixed(2))}m`
}

function wallKindText(value: string) {
  if (value === "replacement_wall") return "Replacement retaining wall"
  if (value === "new_wall") return "New retaining wall"
  return "Retaining wall scope to confirm"
}

function wallKindTextFromFacts(facts: QuoteFact[]) {
  if (facts.some((fact) => fact.metadata?.replacement === true)) return "Replacement retaining wall"
  if (facts.length > 0) return "New retaining wall"
  return "Retaining wall scope to confirm"
}

function dimensionsText(fact: QuoteFact) {
  const length = numberTextFromUnknown(fact.metadata?.length_m)
  const height = heightText(fact.metadata?.height_m)
  if (length && height) return `${length}m x ${height}`
  return "Dimensions to confirm"
}

function areaText(fact: QuoteFact) {
  const area = numberTextFromUnknown(fact.metadata?.square_metres)
  return area ? `${area}m²` : "Area to confirm"
}

function sectionNotices(fact: QuoteFact) {
  const notices: string[] = []
  if (!numberTextFromUnknown(fact.metadata?.length_m) || !heightText(fact.metadata?.height_m)) {
    notices.push("Dimensions missing or incomplete.")
  }
  if (!numberTextFromUnknown(fact.metadata?.square_metres)) {
    notices.push("Wall face area could not be calculated.")
  }
  if (fact.confidence !== "high") {
    notices.push("Detected from quote text. Review before sending.")
  }
  return notices
}

export function retainingReviewFromCalculatorResult(result: RetainingCalculatorResult): RetainingReviewModel | null {
  if (result.sections.length === 0) return null

  const sections = result.sections.map((section) => {
    const length = numberText(section.length_m)
    const height = numberText(section.height_m)
    const area = numberText(section.face_area_square_metres)

    return {
      label: section.label,
      dimensionsText: length && height ? `${length}m x ${height}m` : "Dimensions to confirm",
      areaText: area ? `${area}m2` : "Area to confirm",
      notices: section.warnings.map((warning) => warning.message),
    }
  })
  const totalArea = numberText(result.total_face_area_square_metres)

  return {
    detected: true,
    sections,
    totalAreaText: totalArea ? `${totalArea}m2` : undefined,
    wallKindText: wallKindText(result.wall_kind),
    timberRetaining: result.timber_retaining,
    drainageMentioned: result.drainage_mentioned,
    postsMentioned: result.posts_mentioned,
    accessDifficulty: result.access_difficulty,
    wasteRemovalNotes: result.waste_removal_notes,
    notices: result.warnings.map((warning) => warning.message),
  }
}

export function retainingReviewFromQuoteFacts(facts: QuoteFact[]): RetainingReviewModel | null {
  const retainingFacts = facts.filter((fact) => fact.metadata?.trade === "retaining")
  if (retainingFacts.length === 0) return null

  const sectionFacts = retainingFacts.filter((fact) => fact.metadata?.fact_type === "retaining_wall_section")
  if (sectionFacts.length === 0) return null

  const totalFact = retainingFacts.find((fact) => fact.metadata?.fact_type === "total_retaining_face_area")
  const wasteRemovalNotes = retainingFacts
    .filter((fact) => fact.metadata?.fact_type === "waste_removal")
    .map((fact) => fact.description)
  const timberRetaining = retainingFacts.some((fact) => fact.metadata?.wall_type === "timber_retaining")
  const drainageMentioned = retainingFacts.some((fact) => fact.metadata?.drainage === true)
  const postsMentioned = retainingFacts.some((fact) => fact.metadata?.posts === true)
  const accessDifficulty = retainingFacts.some((fact) => fact.metadata?.access_difficulty === true)
  const sections = sectionFacts.map((fact, index) => ({
    label: fact.label || `Retaining wall ${index + 1}`,
    dimensionsText: dimensionsText(fact),
    areaText: areaText(fact),
    notices: sectionNotices(fact),
  }))
  const totalArea = numberTextFromUnknown(totalFact?.metadata?.square_metres)

  return {
    detected: true,
    sections,
    totalAreaText: totalArea ? `${totalArea}m²` : undefined,
    wallKindText: wallKindTextFromFacts(sectionFacts),
    timberRetaining,
    drainageMentioned,
    postsMentioned,
    accessDifficulty,
    wasteRemovalNotes,
    notices: sections.flatMap((section) => section.notices),
  }
}
