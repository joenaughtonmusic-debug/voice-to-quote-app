import { buildReviewNotices } from "./registry"
import type { ReviewNotice } from "./types"

export type QuoteReviewNoticeInput = {
  rawTranscript?: string | null
  originalTranscript?: string | null
  quoteTextParts?: Array<string | null | undefined>
}

function uniqueNonEmptyText(values: Array<string | null | undefined>) {
  const seen = new Set<string>()

  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function buildQuoteReviewNotices(input: QuoteReviewNoticeInput): ReviewNotice[] {
  const text = uniqueNonEmptyText([
    input.rawTranscript,
    input.originalTranscript,
    ...(input.quoteTextParts ?? []),
  ]).join("\n")

  if (!text) return []
  return buildReviewNotices({ text })
}
