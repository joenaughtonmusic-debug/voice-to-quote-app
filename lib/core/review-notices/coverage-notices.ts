import { COVERAGE_WARNING_PREFIX } from "../extraction-coverage"
import type { ReviewNotice, ReviewNoticeInput } from "./types"

/**
 * Turns the loud coverage warnings the pipeline records on a quote (see
 * lib/core/extraction-coverage.ts) into first-class, `severity: "error"` review notices so a
 * dropped-then-unrecovered scope item is surfaced prominently in the internal review, never silent.
 * The warnings arrive as text (the quote's confidence_warnings are part of the review text parts).
 */
export function coverageReviewNotices(input: ReviewNoticeInput): ReviewNotice[] {
  const text = input.text ?? ""
  const notices: ReviewNotice[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line.startsWith(COVERAGE_WARNING_PREFIX)) continue
    if (seen.has(line)) continue
    seen.add(line)
    notices.push({
      id: `coverage-${seen.size}`,
      message: line,
      severity: "error",
      source: "coverage",
      category: "missing_info",
    })
  }

  return notices
}
