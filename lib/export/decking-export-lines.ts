import type { QuoteFact } from "../core/quote-facts"
import type { ExportableQuoteLine } from "./exportable-line"
import { buildTradeBillExportableLines } from "./trade-calculator-export-lines"
import type { QuoteOption } from "../quote-options"

const DECKING_BILL_CONFIG = {
  tradeId: "decking",
  billPrefix: "decking-bill-",
  labourLineLabel: (areaLabel: string) => `Decking labour / installation - ${areaLabel}`,
  materialsLineLabel: (areaLabel: string) => `Decking materials - ${areaLabel}`,
  materialsXeroDescription: (areaLabel: string, materialNames: string) =>
    materialNames ? `Decking materials - ${areaLabel}: ${materialNames}` : `Decking materials - ${areaLabel}`,
  reviewLineLabel: (areaLabel: string) => `Decking - ${areaLabel} — pricing review required`,
} as const

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
      const dimensions =
        typeof length === "number" && typeof width === "number" ? `${length}m x ${width}m` : `${area ?? "area"}m2`
      return `Area ${index + 1}: ${dimensions}${typeof area === "number" ? ` (${area}m2)` : ""}, ${scope}`
    })
    .join("; ")
}

function buildDeckingFactsFallbackLines(facts: QuoteFact[]): ExportableQuoteLine[] {
  const factsForDecking = deckingFacts(facts)
  if (factsForDecking.length === 0) return []

  const totalArea = totalSquareMetres(factsForDecking)
  const summary = areaSummary(factsForDecking)
  const totalAreaText = totalArea !== null ? `${totalArea}m2` : "area to confirm"

  const lines: ExportableQuoteLine[] = [
    {
      lineId: "decking-facts-labour",
      role: "labour",
      category: "labour",
      label: `Decking labour / installation - ${totalAreaText}`,
      xeroDescription: summary ? `Decking labour / installation - ${summary}` : undefined,
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    },
    {
      lineId: "decking-facts-materials",
      role: "materials",
      category: "materials",
      label: `Decking materials - ${totalAreaText}`,
      xeroDescription: summary ? `Decking materials - ${summary}` : undefined,
      quantity: totalArea ?? 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
      quantityWasDefaulted: totalArea === null,
    },
  ]

  const wasteFacts = factsForDecking.filter((fact) => fact.metadata?.fact_type === "waste_removal")
  if (wasteFacts.length > 0) {
    lines.push({
      lineId: "decking-facts-waste",
      role: "waste",
      category: "waste",
      label: `Decking waste/removal - ${wasteFacts.map((fact) => fact.description.replace(/\.$/, "")).join("; ")}`,
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    })
  }

  return lines
}

function buildDeckingFactsWasteLines(facts: QuoteFact[]): ExportableQuoteLine[] {
  const wasteFacts = deckingFacts(facts).filter((fact) => fact.metadata?.fact_type === "waste_removal")
  if (wasteFacts.length === 0) return []

  return [
    {
      lineId: "decking-facts-waste",
      role: "waste",
      category: "waste",
      label: `Decking waste/removal - ${wasteFacts.map((fact) => fact.description.replace(/\.$/, "")).join("; ")}`,
      quantity: 1,
      pricingSource: "unpriced",
      unitAmountWasDefaulted: true,
    },
  ]
}

export function buildDeckingExportableLines(
  quoteOptions: QuoteOption[] | undefined,
  facts: QuoteFact[],
): ExportableQuoteLine[] {
  const fromOptions = buildTradeBillExportableLines(quoteOptions, DECKING_BILL_CONFIG)
  if (fromOptions.length > 0) {
    const wasteLines = buildDeckingFactsWasteLines(facts)
    const hasWaste = fromOptions.some((line) => line.role === "waste")
    return hasWaste ? fromOptions : [...fromOptions, ...wasteLines]
  }

  return buildDeckingFactsFallbackLines(facts)
}

export function hasDeckingExportContent(quoteOptions: QuoteOption[] | undefined, facts: QuoteFact[]): boolean {
  return buildDeckingExportableLines(quoteOptions, facts).length > 0
}
