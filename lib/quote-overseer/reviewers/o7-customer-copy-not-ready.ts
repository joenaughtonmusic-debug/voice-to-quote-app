import type { QuoteOverseerFinding, QuoteOverseerInput } from "../types"

/**
 * O7 — customer_copy_not_ready.
 *
 * Flags internal scaffolding that has leaked into the customer-facing copy:
 *  - raw metadata labels ("Title:", "Job type:", "Cadence:"),
 *  - the raw job_type slug (e.g. "general_landscaping"),
 *  - an internal note reproduced verbatim in the customer copy.
 *
 * Conservative: the internal-note check requires a whole trimmed note line
 * (length >= 20) to appear verbatim, so paraphrased scope that happens to share
 * wording with a note never trips it.
 */

const METADATA_LABEL_PATTERN = /(?:^|\n)\s*(Title|Job\s*type|Cadence)\s*:/i

export function o7CustomerCopyNotReady(input: QuoteOverseerInput): QuoteOverseerFinding[] {
  const findings: QuoteOverseerFinding[] = []
  const preview = input.customerPreviewText
  if (!preview.trim()) return findings

  const labelMatch = preview.match(METADATA_LABEL_PATTERN)
  if (labelMatch) {
    findings.push({
      id: "O7-metadata-label-leak",
      check: "customer_copy_not_ready",
      severity: "error",
      layer: "customer_preview",
      message: "Customer copy exposes internal metadata labels.",
      evidence: labelMatch[0].replace(/\s+/g, " ").trim(),
      suggestion: "Remove Title/Job type/Cadence metadata from the customer-facing preview.",
    })
  }

  const jobTypeSlug = (input.quote.job_type ?? "").trim()
  if (jobTypeSlug && /_/.test(jobTypeSlug) && preview.toLowerCase().includes(jobTypeSlug.toLowerCase())) {
    findings.push({
      id: "O7-job-type-slug-leak",
      check: "customer_copy_not_ready",
      severity: "error",
      layer: "customer_preview",
      message: "Customer copy exposes the raw job_type slug.",
      evidence: jobTypeSlug,
      suggestion: "Show a human-readable title instead of the raw job_type slug.",
    })
  }

  for (const note of input.quote.internal_notes ?? []) {
    const trimmed = note.trim()
    if (trimmed.length < 20) continue
    if (preview.includes(trimmed)) {
      findings.push({
        id: "O7-internal-note-leak",
        check: "customer_copy_not_ready",
        severity: "error",
        layer: "customer_preview",
        message: "Customer copy reproduces an internal note verbatim.",
        evidence: trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed,
        suggestion: "Keep internal notes out of the customer-facing preview.",
      })
    }
  }

  return findings
}
