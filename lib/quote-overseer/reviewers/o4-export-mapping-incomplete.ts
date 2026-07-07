import { collectXeroLineItemWarnings } from "../../export/map-to-xero"
import type { QuoteOverseerFinding, QuoteOverseerInput } from "../types"

/**
 * O4 — export_mapping_incomplete.
 *
 * Only runs when structured Xero export lines are supplied (the good-golden
 * customer-preview smoke tests omit them, so known KB/item-mapping gaps never
 * fail those). Reuses the engine's own collectXeroLineItemWarnings — the source
 * of truth for missing item/account/tax codes and defaulted quantity/price —
 * rather than reimplementing the mapping rules.
 */
export function o4ExportMappingIncomplete(input: QuoteOverseerInput): QuoteOverseerFinding[] {
  const lines = input.xeroExportLines
  if (!lines || lines.length === 0) return []

  const findings: QuoteOverseerFinding[] = []
  for (const line of lines) {
    const warnings = collectXeroLineItemWarnings(line)
    if (warnings.length === 0) continue
    findings.push({
      id: "O4-export-mapping-incomplete",
      check: "export_mapping_incomplete",
      severity: "warning",
      layer: "export",
      message: `Xero export line "${line.description || "(no description)"}" is missing required mapping.`,
      evidence: warnings.join(" "),
      suggestion: "Map the item to a Knowledge Base item with item, account and tax codes before export.",
    })
  }

  return findings
}
