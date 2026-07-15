import type { QuoteOverseerFinding, QuoteOverseerInput, QuoteOverseerResult, QuoteOverseerReviewer } from "./types"
import { o2CustomerPreviewLeaksLabour } from "./reviewers/o2-customer-preview-leaks-labour"
import { o4ExportMappingIncomplete } from "./reviewers/o4-export-mapping-incomplete"
import { o5CustomerPreviewMissingScope } from "./reviewers/o5-customer-preview-missing-scope"
import { o7CustomerCopyNotReady } from "./reviewers/o7-customer-copy-not-ready"

export type {
  QuoteOverseerCheck,
  QuoteOverseerFinding,
  QuoteOverseerInput,
  QuoteOverseerLayer,
  QuoteOverseerResult,
  QuoteOverseerReviewer,
  QuoteOverseerSeverity,
  QuoteOverseerStatus,
} from "./types"

const REVIEWERS: QuoteOverseerReviewer[] = [
  o2CustomerPreviewLeaksLabour,
  o4ExportMappingIncomplete,
  o5CustomerPreviewMissingScope,
  o7CustomerCopyNotReady,
]

function deriveStatus(findings: QuoteOverseerFinding[]): QuoteOverseerResult["status"] {
  if (findings.some((f) => f.severity === "error")) return "blocked"
  if (findings.length > 0) return "review"
  return "ok"
}

/**
 * Deterministic, local Quote Overseer. Reviews the assembled output artifacts of
 * a generated quote and returns structured findings. It never mutates the quote,
 * never calls OpenAI, and is safe to run after quote generation. One reviewer
 * throwing never crashes the layer — it is surfaced as an info finding.
 */
export function reviewQuote(input: QuoteOverseerInput): QuoteOverseerResult {
  const findings: QuoteOverseerFinding[] = []

  for (const reviewer of REVIEWERS) {
    try {
      findings.push(...reviewer(input))
    } catch (err) {
      findings.push({
        id: `overseer-reviewer-error-${reviewer.name || "unknown"}`,
        check: "customer_copy_not_ready",
        severity: "info",
        layer: "cross_layer",
        message: `Quote Overseer reviewer ${reviewer.name || "unknown"} threw an unexpected error.`,
        evidence: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    status: deriveStatus(findings),
    findings,
    errorCount: findings.filter((f) => f.severity === "error").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  }
}
