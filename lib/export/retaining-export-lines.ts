import type { QuoteFact } from "../core/quote-facts"
import type { ExportableQuoteLine } from "./exportable-line"
import { buildTradeBillExportableLines } from "./trade-calculator-export-lines"
import type { QuoteOption } from "../quote-options"

const RETAINING_BILL_CONFIG = {
  tradeId: "retaining",
  billPrefix: "retaining-bill-",
  labourLineLabel: (areaLabel: string) => `Retaining labour / installation - ${areaLabel}`,
  materialsLineLabel: (areaLabel: string) => `Retaining materials - ${areaLabel}`,
  materialsXeroDescription: (areaLabel: string, materialNames: string) =>
    materialNames ? `Retaining materials - ${areaLabel}: ${materialNames}` : `Retaining materials - ${areaLabel}`,
  reviewLineLabel: (areaLabel: string) => `Retaining - ${areaLabel} — pricing review required`,
} as const

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
      const dimensions =
        typeof length === "number" && typeof height === "number" ? `${length}m x ${height}m` : `${area ?? "area"}m2`
      const wallType = fact.metadata?.replacement === true ? "replacement" : "new/build"
      return `Wall ${index + 1}: ${dimensions}${typeof area === "number" ? ` (${area}m2)` : ""}, ${wallType}`
    })
    .join("; ")
}

function buildRetainingFactsFallbackLines(facts: QuoteFact[]): ExportableQuoteLine[] {
  const factsForRetaining = retainingFacts(facts)
  if (factsForRetaining.length === 0) return []

  const totalArea = totalSquareMetres(factsForRetaining)
  const summary = sectionSummary(factsForRetaining)
  const totalAreaText = totalArea !== null ? `${totalArea}m2` : "area to confirm"

  const lines: ExportableQuoteLine[] = [
    {
      lineId: "retaining-facts-labour",
      role: "labour",
      category: "labour",
      label: `Retaining labour / installation - ${totalAreaText}`,
      xeroDescription: summary ? `Retaining labour / installation - ${summary}` : undefined,
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    },
    {
      lineId: "retaining-facts-materials",
      role: "materials",
      category: "materials",
      label: `Retaining materials - ${totalAreaText}`,
      xeroDescription: summary ? `Retaining materials - ${summary}` : undefined,
      quantity: totalArea ?? 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
      quantityWasDefaulted: totalArea === null,
    },
  ]

  if (factsForRetaining.some((fact) => fact.metadata?.fact_type === "drainage_note" || fact.metadata?.drainage === true)) {
    lines.push({
      lineId: "retaining-facts-drainage",
      role: "materials",
      category: "materials",
      label: "Retaining drainage materials",
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    })
  }

  const wasteFacts = factsForRetaining.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  if (wasteFacts.length > 0) {
    lines.push({
      lineId: "retaining-facts-waste",
      role: "waste",
      category: "waste",
      label: `Retaining waste/removal - ${wasteFacts.map((fact) => fact.description.replace(/\.$/, "")).join("; ")}`,
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    })
  }

  return lines
}

function buildRetainingFactsSupplementLines(facts: QuoteFact[]): ExportableQuoteLine[] {
  const factsForRetaining = retainingFacts(facts)
  const lines: ExportableQuoteLine[] = []

  if (
    factsForRetaining.some((fact) => fact.metadata?.fact_type === "drainage_note" || fact.metadata?.drainage === true)
  ) {
    lines.push({
      lineId: "retaining-facts-drainage",
      role: "materials",
      category: "materials",
      label: "Retaining drainage materials",
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    })
  }

  const wasteFacts = factsForRetaining.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  if (wasteFacts.length > 0) {
    lines.push({
      lineId: "retaining-facts-waste",
      role: "waste",
      category: "waste",
      label: `Retaining waste/removal - ${wasteFacts.map((fact) => fact.description.replace(/\.$/, "")).join("; ")}`,
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    })
  }

  return lines
}

export function buildRetainingExportableLines(
  quoteOptions: QuoteOption[] | undefined,
  facts: QuoteFact[],
): ExportableQuoteLine[] {
  const fromOptions = buildTradeBillExportableLines(quoteOptions, RETAINING_BILL_CONFIG)
  if (fromOptions.length > 0) {
    const supplement = buildRetainingFactsSupplementLines(facts)
    const existingLabels = new Set(fromOptions.map((line) => line.label.toLowerCase()))
    return [...fromOptions, ...supplement.filter((line) => !existingLabels.has(line.label.toLowerCase()))]
  }

  return buildRetainingFactsFallbackLines(facts)
}

export function hasRetainingExportContent(quoteOptions: QuoteOption[] | undefined, facts: QuoteFact[]): boolean {
  return buildRetainingExportableLines(quoteOptions, facts).length > 0
}
