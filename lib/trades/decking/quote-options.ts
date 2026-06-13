import type { QuoteOption } from "../../quote-options"
import type { DeckingCalculatorResult } from "./types"

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildScopeLabel(value: string) {
  if (value === "full_build") return "Full deck build"
  if (value === "decking_boards_only") return "Decking boards only"
  return "Decking scope to confirm"
}

export function quoteOptionsFromDeckingCalculatorResult(result: DeckingCalculatorResult | undefined): QuoteOption[] {
  if (!result || result.areas.length === 0) return []

  return result.areas.map((area, index): QuoteOption => {
    const title = area.square_metres
      ? `${area.label} - ${buildScopeLabel(area.build_scope)} (${area.square_metres}m2)`
      : `${area.label} - ${buildScopeLabel(area.build_scope)}`

    return {
      id: `decking-calculator-${index + 1}-${slug(area.label)}`,
      label: area.label,
      title,
      description: area.formula ?? undefined,
      category: "general",
      source: "manual",
      areaLabel: area.label,
      lineItems: [],
      subtotal: 0,
      notes: [
        area.board_type ? `Board type: ${area.board_type}` : "",
        `Build scope: ${buildScopeLabel(area.build_scope)}`,
        `Subframe needed: ${area.subframe_needed}`,
        area.existing_posts === "yes" ? "Existing posts noted" : "",
        area.existing_subframe === "yes" ? "Existing subframe noted" : "",
      ].filter(Boolean),
      warnings: area.warnings.map((warning) => warning.message),
    }
  })
}
