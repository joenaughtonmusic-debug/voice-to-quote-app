"use client"

import { QuoteDraft } from "@/components/quote-draft"
import type { ProcessedQuote } from "@/lib/processed-quote"

/**
 * Client wrapper that mounts the REAL customer-facing `QuoteDraft` UI with a
 * deterministic, server-supplied ProcessedQuote. Save/send handlers are no-ops here —
 * this page is a read-only render harness for browser/e2e regression, never a way to
 * persist or send a quote. The Supabase-backed save path in `QuoteDraft` only runs on
 * an explicit button click, which this harness never performs.
 */
export function CustomerDraftFixtureClient({
  quote,
  rawTranscript,
}: {
  quote: ProcessedQuote
  rawTranscript: string
}) {
  return (
    <div data-testid="customer-draft-fixture">
      <QuoteDraft
        onBack={() => {}}
        onSaved={() => {}}
        rawTranscript={rawTranscript}
        processedQuote={quote}
        previewMode="standard"
      />
    </div>
  )
}
