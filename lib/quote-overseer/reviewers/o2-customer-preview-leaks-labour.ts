import type { QuoteOverseerFinding, QuoteOverseerInput } from "../types"

/**
 * O2 — customer_preview_leaks_labour.
 *
 * Flags internal labour details exposed in customer copy. It deliberately does
 * NOT flag ordinary prices/totals (customer quotes may legitimately show money).
 * It targets labour-specific exposure only:
 *  - labour hours anywhere ("17 hours", "17 hrs"),
 *  - a labour-labelled hours figure ("Labour: 17h"),
 *  - a labour-labelled money figure ("Labour: $1,870"),
 *  - the known labour line-item total when labelled as labour.
 */

const LABOUR_LEAK_PATTERNS: Array<{ id: string; re: RegExp; evidence: string }> = [
  // Bare labour hours are internal detail — customers don't need hour counts.
  { id: "O2-labour-hours-exposed", re: /\b\d+(?:\.\d+)?\s*(?:hours?|hrs)\b/i, evidence: "labour hours in customer copy" },
  // "Labour: 17h" / "Labour — 17 hrs"
  { id: "O2-labour-hours-labelled", re: /\blabou?r\b[^.\n]{0,25}?\b\d+(?:\.\d+)?\s*h(?:rs?|ours?)?\b/i, evidence: "labour hours labelled" },
  // "Labour: $1,870" / "Labour $1870"
  { id: "O2-labour-cost-labelled", re: /\blabou?r\b\s*[:\-—]?\s*\$\s?\d[\d,]*(?:\.\d{2})?/i, evidence: "labour cost labelled" },
]

function labourLineTotals(input: QuoteOverseerInput): string[] {
  return (input.quote.line_items ?? [])
    .filter((item) => /\blabou?r\b/i.test(`${item.item_type} ${item.item_name}`))
    .map((item) => item.total ?? "")
    .filter((total) => /\d/.test(total))
}

export function o2CustomerPreviewLeaksLabour(input: QuoteOverseerInput): QuoteOverseerFinding[] {
  const findings: QuoteOverseerFinding[] = []
  const preview = input.customerPreviewText
  if (!preview.trim()) return findings

  for (const pattern of LABOUR_LEAK_PATTERNS) {
    const match = preview.match(pattern.re)
    if (!match) continue
    findings.push({
      id: pattern.id,
      check: "customer_preview_leaks_labour",
      severity: "error",
      layer: "customer_preview",
      message: "Customer copy exposes internal labour detail.",
      evidence: `${pattern.evidence}: "${match[0].replace(/\s+/g, " ").trim()}"`,
      suggestion: "Keep labour hours and labour cost in the internal review only.",
    })
  }

  // The known labour line total, when it appears next to a "Labour" label.
  for (const total of labourLineTotals(input)) {
    const number = Number(total)
    if (!Number.isFinite(number)) continue
    const withComma = number.toLocaleString("en-US")
    const plain = String(number)
    const numberAlt = `(?:${plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${withComma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`
    const re = new RegExp(String.raw`\blabou?r\b[^.\n]{0,40}?\$?\s?${numberAlt}\b`, "i")
    const match = preview.match(re)
    if (match) {
      findings.push({
        id: "O2-labour-total-exposed",
        check: "customer_preview_leaks_labour",
        severity: "error",
        layer: "customer_preview",
        message: "Customer copy exposes the internal labour line total.",
        evidence: match[0].replace(/\s+/g, " ").trim(),
        suggestion: "Keep the labour total in the internal review only.",
      })
    }
  }

  return findings
}
