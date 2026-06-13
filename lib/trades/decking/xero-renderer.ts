import type { QuoteFact } from "../../core/quote-facts"
import type { XeroExportLineItem } from "../../export/xero/types"
import type { DeckingCalculatorResult, DeckingXeroRenderResult } from "./types"

export function renderDeckingXeroLinesStub(result: DeckingCalculatorResult): DeckingXeroRenderResult {
  return {
    lines: [],
    warnings: result.warnings,
  }
}

function deckingFacts(facts: QuoteFact[]) {
  return facts.filter((fact) => fact.metadata?.trade === "decking")
}

function totalSquareMetres(facts: QuoteFact[]) {
  const totalFact = facts.find((fact) => fact.metadata?.fact_type === "total_deck_area")
  if (typeof totalFact?.metadata?.square_metres === "number") return totalFact.metadata.square_metres

  const areaTotals = facts
    .filter((fact) => fact.metadata?.fact_type === "deck_area")
    .map((fact) => fact.metadata?.square_metres)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  if (areaTotals.length === 0) return null
  return Number(areaTotals.reduce((sum, value) => sum + value, 0).toFixed(2))
}

function areaSummary(facts: QuoteFact[]) {
  const areaFacts = facts.filter((fact) => fact.metadata?.fact_type === "deck_area")
  if (areaFacts.length === 0) return ""

  return areaFacts
    .map((fact, index) => {
      const length = fact.metadata?.length_m
      const width = fact.metadata?.width_m
      const area = fact.metadata?.square_metres
      const scope =
        fact.metadata?.build_scope === "decking_boards_only"
          ? "boards only"
          : fact.metadata?.build_scope === "full_build"
            ? "full build"
            : "scope to confirm"
      const dimensions = typeof length === "number" && typeof width === "number" ? `${length}m x ${width}m` : `${area ?? "area"}m2`
      return `Area ${index + 1}: ${dimensions}${typeof area === "number" ? ` (${area}m2)` : ""}, ${scope}`
    })
    .join("; ")
}

export function buildDeckingXeroExportLineItemsFromQuoteFacts(facts: QuoteFact[]): XeroExportLineItem[] {
  const factsForDecking = deckingFacts(facts)
  if (factsForDecking.length === 0) return []

  const totalArea = totalSquareMetres(factsForDecking)
  const summary = areaSummary(factsForDecking)
  const totalAreaText = totalArea !== null ? `${totalArea}m2` : "area to confirm"
  const lines: XeroExportLineItem[] = [
    {
      category: "labour",
      description: `Decking labour / installation - ${totalAreaText}`,
      quantity: 1,
      unitAmount: undefined,
      xeroDescription: summary ? `Decking labour / installation - ${summary}` : undefined,
      unitAmountWasDefaulted: true,
    },
    {
      category: "materials",
      description: `Decking materials - ${totalAreaText}`,
      quantity: totalArea ?? 1,
      unitAmount: undefined,
      xeroDescription: summary ? `Decking materials - ${summary}` : undefined,
      unitAmountWasDefaulted: true,
      quantityWasDefaulted: totalArea === null,
    },
  ]

  const wasteFacts = factsForDecking.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  if (wasteFacts.length > 0) {
    lines.push({
      category: "waste",
      description: `Decking waste/removal - ${wasteFacts.map((fact) => fact.description.replace(/\.$/, "")).join("; ")}`,
      quantity: 1,
      unitAmount: undefined,
      unitAmountWasDefaulted: true,
    })
  }

  return lines
}
