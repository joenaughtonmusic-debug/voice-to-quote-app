import type { QuoteOverseerFinding, QuoteOverseerInput } from "../types"

/**
 * O5 — customer_preview_missing_scope.
 *
 * Flags an important primary-scope item that appears genuinely absent from the
 * rendered customer preview (the class of bug where a renderer takeover drops
 * real mixed-landscaping scope such as polythene / topsoil / lawn seed).
 *
 * Conservative by design — it only flags when NONE of a scope item's
 * *distinctive* tokens survive in the preview. A distinctive token is a content
 * word (5+ letters) that does not also appear in another scope item, so shared
 * or generic wording (and ordinary paraphrasing) never trips a false positive:
 * a paraphrase almost always keeps at least one distinctive noun, and an item
 * whose words are all shared with other items is skipped entirely.
 */

const TOKEN_PATTERN = /[a-zāēīōū]{5,}/gi

function tokensOf(text: string): Set<string> {
  const tokens = new Set<string>()
  for (const match of text.toLowerCase().matchAll(TOKEN_PATTERN)) {
    tokens.add(match[0])
  }
  return tokens
}

export function o5CustomerPreviewMissingScope(input: QuoteOverseerInput): QuoteOverseerFinding[] {
  const findings: QuoteOverseerFinding[] = []
  const scopeItems = Array.from(
    new Set(
      [...(input.quote.primary_quote?.scope ?? []), ...(input.quote.customer_scope ?? [])]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
  if (scopeItems.length === 0) return findings

  const perItemTokens = scopeItems.map((item) => tokensOf(item))
  const previewTokens = tokensOf(input.customerPreviewText)

  scopeItems.forEach((item, index) => {
    const ownTokens = perItemTokens[index]
    // Distinctive = a content token unique to this scope item.
    const distinctive = Array.from(ownTokens).filter(
      (token) => !perItemTokens.some((other, otherIndex) => otherIndex !== index && other.has(token)),
    )
    if (distinctive.length === 0) return

    const anyDistinctivePresent = distinctive.some((token) => previewTokens.has(token))
    if (anyDistinctivePresent) return

    findings.push({
      id: "O5-customer-preview-missing-scope",
      check: "customer_preview_missing_scope",
      severity: "warning",
      layer: "customer_preview",
      message: "A primary scope item appears to be missing from the customer preview.",
      evidence: `Scope item not represented in preview: "${item}" (distinctive terms: ${distinctive.join(", ")}).`,
      suggestion:
        "Check the renderer path — the customer preview may have been taken over by another presentation and dropped real scope.",
    })
  })

  return findings
}
