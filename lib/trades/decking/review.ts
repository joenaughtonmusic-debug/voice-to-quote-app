import type { QuoteFact } from "../../core/quote-facts"

export type DeckingReviewArea = {
  label: string
  dimensionsText: string
  areaText: string
  buildScopeText: string
  existingPostsRetained: boolean
  existingSubframeRetained: boolean
  notices: string[]
}

export type DeckingReviewModel = {
  detected: boolean
  areas: DeckingReviewArea[]
  totalAreaText?: string
  wasteRemovalNotes: string[]
  notices: string[]
}

function numberText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : null
}

function buildScopeText(value: unknown) {
  if (value === "full_build") return "Full build"
  if (value === "decking_boards_only") return "Decking boards only"
  return "Scope to confirm"
}

function dimensionsText(fact: QuoteFact) {
  const length = numberText(fact.metadata?.length_m)
  const width = numberText(fact.metadata?.width_m)
  if (length && width) return `${length}m x ${width}m`
  return "Dimensions to confirm"
}

function areaText(fact: QuoteFact) {
  const area = numberText(fact.metadata?.square_metres)
  return area ? `${area}m²` : "Area to confirm"
}

function areaNotices(fact: QuoteFact) {
  const notices: string[] = []
  if (!numberText(fact.metadata?.length_m) || !numberText(fact.metadata?.width_m)) {
    notices.push("Dimensions missing or incomplete.")
  }
  if (!numberText(fact.metadata?.square_metres)) {
    notices.push("Area could not be calculated.")
  }
  if (fact.metadata?.build_scope === "unknown") {
    notices.push("Build scope needs review.")
  }
  if (fact.confidence !== "high") {
    notices.push("Detected from quote text. Review before sending.")
  }
  return notices
}

export function deckingReviewFromQuoteFacts(facts: QuoteFact[]): DeckingReviewModel | null {
  const deckingFacts = facts.filter((fact) => fact.metadata?.trade === "decking")
  if (deckingFacts.length === 0) return null

  const areaFacts = deckingFacts.filter((fact) => fact.metadata?.fact_type === "deck_area")
  const totalFact = deckingFacts.find((fact) => fact.metadata?.fact_type === "total_deck_area")
  const wasteRemovalNotes = deckingFacts
    .filter((fact) => fact.metadata?.fact_type === "waste_removal")
    .map((fact) => fact.description)
  const areas = areaFacts.map((fact, index) => ({
    label: fact.label || `Deck area ${index + 1}`,
    dimensionsText: dimensionsText(fact),
    areaText: areaText(fact),
    buildScopeText: buildScopeText(fact.metadata?.build_scope),
    existingPostsRetained: fact.metadata?.existing_posts === "yes",
    existingSubframeRetained: fact.metadata?.existing_subframe === "yes" || fact.metadata?.subframe_needed === "no",
    notices: areaNotices(fact),
  }))
  const totalArea = numberText(totalFact?.metadata?.square_metres)

  return {
    detected: true,
    areas,
    totalAreaText: totalArea ? `${totalArea}m²` : undefined,
    wasteRemovalNotes,
    notices: areas.flatMap((area) => area.notices),
  }
}
