import type { DeckingCalculatorResult, DeckingCustomerRenderResult } from "./types"
import type { QuoteFact } from "../../core/quote-facts"

function scopeLabel(value: string) {
  if (value === "full_build") return "Build"
  if (value === "decking_boards_only") return "Replace decking boards on"
  return "Complete decking work to"
}

export function renderDeckingCustomerScope(result: DeckingCalculatorResult): DeckingCustomerRenderResult {
  const scope = result.areas.map((area) => {
    const areaText = area.square_metres ? `${area.label.toLowerCase()} (${area.square_metres}m2)` : area.label.toLowerCase()
    const boardText = area.board_type ? ` using ${area.board_type} decking` : ""
    return `${scopeLabel(area.build_scope)} ${areaText}${boardText}.`
  })

  const materials = result.areas
    .map((area) => area.board_type)
    .filter((boardType): boardType is string => typeof boardType === "string" && boardType.length > 0)
    .map((boardType) => `${boardType.charAt(0).toUpperCase()}${boardType.slice(1)} decking`)

  return {
    scope,
    materials: Array.from(new Set(materials)),
    waste: result.waste_removal_notes,
    warnings: result.warnings,
  }
}

function ordinal(index: number) {
  if (index === 0) return "New deck area"
  if (index === 1) return "Second deck area"
  if (index === 2) return "Third deck area"
  return `Deck area ${index + 1}`
}

function areaText(fact: QuoteFact) {
  const length = fact.metadata?.length_m
  const width = fact.metadata?.width_m
  const squareMetres = fact.metadata?.square_metres

  if (typeof length === "number" && typeof width === "number" && typeof squareMetres === "number") {
    return `approximately ${length}m x ${width}m, total ${squareMetres}m²`
  }

  if (typeof squareMetres === "number") return `approximately ${squareMetres}m²`
  return "with dimensions to confirm"
}

function scopeText(fact: QuoteFact) {
  if (fact.metadata?.build_scope === "decking_boards_only") return "decking boards only"
  if (fact.metadata?.build_scope === "full_build") return ""
  return "scope to confirm"
}

function existingStructureText(fact: QuoteFact) {
  const notes = [
    fact.metadata?.existing_posts === "yes" ? "existing posts retained" : "",
    fact.metadata?.existing_subframe === "yes" || fact.metadata?.subframe_needed === "no" ? "existing subframe retained" : "",
  ].filter(Boolean)

  return notes.join(", ")
}

export function renderDeckingCustomerScopeFromQuoteFacts(facts: QuoteFact[]) {
  const deckingFacts = facts.filter((fact) => fact.metadata?.trade === "decking")
  const areaFacts = deckingFacts.filter((fact) => fact.metadata?.fact_type === "deck_area")
  const totalFact = deckingFacts.find((fact) => fact.metadata?.fact_type === "total_deck_area")
  const wasteFacts = deckingFacts.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  const lines = areaFacts.map((fact, index) => {
    const details = [areaText(fact), scopeText(fact), existingStructureText(fact)].filter(Boolean)
    return `${ordinal(index)} ${details.join(", ")}.`
  })

  if (areaFacts.length > 1 && typeof totalFact?.metadata?.square_metres === "number") {
    lines.push(`Total decking area approximately ${totalFact.metadata.square_metres}m².`)
  }

  wasteFacts.forEach((fact) => {
    lines.push(`Remove ${fact.description.replace(/^remove\s+/i, "").replace(/\.$/, "")}.`)
  })

  return lines
}
