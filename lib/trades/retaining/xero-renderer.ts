import type { RetainingCalculatorResult, RetainingXeroRenderResult } from "./types"
import type { QuoteFact } from "../../core/quote-facts"
import type { XeroExportLineItem } from "../../export/xero/types"

export function renderRetainingXeroLinesStub(result: RetainingCalculatorResult): RetainingXeroRenderResult {
  return {
    lines: [],
    warnings: result.warnings,
  }
}

function retainingFacts(facts: QuoteFact[]) {
  return facts.filter((fact) => fact.metadata?.trade === "retaining")
}

function totalSquareMetres(facts: QuoteFact[]) {
  const totalFact = facts.find((fact) => fact.metadata?.fact_type === "total_retaining_face_area")
  if (typeof totalFact?.metadata?.square_metres === "number") return totalFact.metadata.square_metres

  const sectionTotals = facts
    .filter((fact) => fact.metadata?.fact_type === "retaining_wall_section")
    .map((fact) => fact.metadata?.square_metres)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  if (sectionTotals.length === 0) return null
  return Number(sectionTotals.reduce((sum, value) => sum + value, 0).toFixed(2))
}

function sectionSummary(facts: QuoteFact[]) {
  const sectionFacts = facts.filter((fact) => fact.metadata?.fact_type === "retaining_wall_section")
  if (sectionFacts.length === 0) return ""

  return sectionFacts
    .map((fact, index) => {
      const length = fact.metadata?.length_m
      const height = fact.metadata?.height_m
      const area = fact.metadata?.square_metres
      const dimensions = typeof length === "number" && typeof height === "number" ? `${length}m x ${height}m` : `${area ?? "area"}m2`
      const wallType = fact.metadata?.replacement === true ? "replacement" : "new/build"
      return `Wall ${index + 1}: ${dimensions}${typeof area === "number" ? ` (${area}m2)` : ""}, ${wallType}`
    })
    .join("; ")
}

export function buildRetainingXeroExportLineItemsFromQuoteFacts(facts: QuoteFact[]): XeroExportLineItem[] {
  const factsForRetaining = retainingFacts(facts)
  if (factsForRetaining.length === 0) return []

  const totalArea = totalSquareMetres(factsForRetaining)
  const summary = sectionSummary(factsForRetaining)
  const totalAreaText = totalArea !== null ? `${totalArea}m2` : "area to confirm"
  const lines: XeroExportLineItem[] = [
    {
      category: "labour",
      description: `Retaining labour / installation - ${totalAreaText}`,
      quantity: 1,
      unitAmount: undefined,
      xeroDescription: summary ? `Retaining labour / installation - ${summary}` : undefined,
      unitAmountWasDefaulted: true,
    },
    {
      category: "materials",
      description: `Retaining materials - ${totalAreaText}`,
      quantity: totalArea ?? 1,
      unitAmount: undefined,
      xeroDescription: summary ? `Retaining materials - ${summary}` : undefined,
      unitAmountWasDefaulted: true,
      quantityWasDefaulted: totalArea === null,
    },
  ]

  if (factsForRetaining.some((fact) => fact.metadata?.fact_type === "drainage_note" || fact.metadata?.drainage === true)) {
    lines.push({
      category: "materials",
      description: "Retaining drainage materials",
      quantity: 1,
      unitAmount: undefined,
      unitAmountWasDefaulted: true,
    })
  }

  const wasteFacts = factsForRetaining.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  if (wasteFacts.length > 0) {
    lines.push({
      category: "waste",
      description: `Retaining waste/removal - ${wasteFacts.map((fact) => fact.description.replace(/\.$/, "")).join("; ")}`,
      quantity: 1,
      unitAmount: undefined,
      unitAmountWasDefaulted: true,
    })
  }

  return lines
}
