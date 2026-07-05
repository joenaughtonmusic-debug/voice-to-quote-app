import type { AuditContext, AuditIssue } from "../types"

// Explicit decking intent in the raw transcript. If none of these appear, any
// decking output downstream is a misclassification.
const DECKING_INTENT_PATTERN = /\b(deck|decking|deck\s*boards?|joists?|bearers?|deck\s*frame|substructure)\b/i

// Decking artefacts that show up in output (scope text, line items, materials).
const DECKING_OUTPUT_PATTERN = /\bdeck\s*area\s*\d+|\bdecking\s*boards?\b|\bdecking\b/i

/**
 * V04 — Classification / calculator conflicts (detection only).
 *
 * Narrow first case: the decking calculator/template has taken over a quote whose
 * transcript contains no decking intent (the Adam/Titirangi failure mode). Does
 * NOT attempt to fix classification.
 */
export function v04ClassificationConflicts(ctx: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = []
  const { processedQuote: quote } = ctx
  const transcript = ctx.rawTranscript ?? ""

  // If the transcript genuinely mentions decking, decking output is legitimate.
  if (DECKING_INTENT_PATTERN.test(transcript)) return issues

  const evidence: string[] = []

  if (/deck/i.test(quote.job_type)) evidence.push(`job_type: "${quote.job_type}"`)

  const scopeLines = [...(quote.customer_scope ?? []), ...(quote.primary_quote?.scope ?? [])]
  for (const line of scopeLines) {
    if (DECKING_OUTPUT_PATTERN.test(line)) evidence.push(line.trim())
  }

  for (const item of quote.line_items) {
    const text = `${item.item_name} ${item.description}`
    if (DECKING_OUTPUT_PATTERN.test(text)) evidence.push((item.item_name || item.description).trim())
  }

  for (const material of quote.materials ?? []) {
    if (DECKING_OUTPUT_PATTERN.test(material)) evidence.push(material.trim())
  }

  if (evidence.length === 0) return issues

  const uniqueEvidence = Array.from(new Set(evidence)).slice(0, 4)

  issues.push({
    id: "V04-decking-on-non-decking",
    severity: "error",
    category: "calculator",
    message:
      "Decking calculator/template output appears on a transcript with no decking intent — a secondary calculator has taken over a non-decking quote.",
    evidence: uniqueEvidence.join(" | "),
    expected: "No decking output (the transcript is not about decking).",
    actual: uniqueEvidence.join(" | "),
    suggested_fix:
      "Gate the decking calculator on explicit deck/decking/joist/bearer intent in the transcript; do not let it claim the primary quote.",
    can_auto_correct: false,
  })

  return issues
}
