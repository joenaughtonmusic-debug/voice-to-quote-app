import { NON_PLANTING_STRUCTURAL_TRADES } from "../quote-classification"
import type { ProcessedQuote } from "../processed-quote"

/**
 * AI-0b — deterministic extraction coverage check + retry.
 *
 * The AI extraction non-deterministically drops distinct work items (measured live: a mixed
 * planting+paving job kept the paver only ~60% of the time, unchanged by a stronger model). This
 * verifies that structural-trade items the transcript describes actually made it into the extracted
 * quote, retries the extraction when one is missing, and — if still missing after the retry cap —
 * records a LOUD review warning so a dropped item is never silent.
 *
 * "What should be there" is derived deterministically from NON_PLANTING_STRUCTURAL_TRADES (the same
 * single-sourced list AI-0 routes on), NOT from an AI guess. v1 scope is that structural-noun set;
 * broadening to labour/optional/green-waste/measured-areas is AI-0c.
 */

export const COVERAGE_WARNING_PREFIX = "Coverage check —"

/** The customer/scope-facing text of the extracted quote, where a captured item should appear. */
function quoteScopeText(quote: ProcessedQuote): string {
  return [
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
    ...(quote.materials ?? []),
  ]
    .filter((s): s is string => typeof s === "string")
    .join(" \n ")
}

/**
 * Labels of structural-trade items that the transcript describes but the extracted quote is
 * missing. Empty when fully covered (or when the transcript has no structural trade at all).
 */
export function findMissingStructuralCoverage(transcript: string, quote: ProcessedQuote): string[] {
  const scope = quoteScopeText(quote)
  return NON_PLANTING_STRUCTURAL_TRADES.filter(
    (trade) => trade.pattern.test(transcript) && !trade.pattern.test(scope),
  ).map((trade) => trade.label)
}

/** Record a loud, non-silent review warning for each still-missing item on the quote. */
export function attachCoverageWarnings(quote: ProcessedQuote, missing: string[]): void {
  if (missing.length === 0) return
  quote.confidence_warnings = Array.isArray(quote.confidence_warnings) ? quote.confidence_warnings : []
  for (const label of missing) {
    const message = `${COVERAGE_WARNING_PREFIX} "${label}" was described in the notes but is missing from the quote — add it before sending.`
    if (!quote.confidence_warnings.includes(message)) quote.confidence_warnings.push(message)
  }
}

export type CoverageAttemptInfo = { attemptNumber: number; missing: string[]; error?: unknown }

/**
 * Run an extraction `attempt` up to `maxAttempts` times, retrying while a structural-trade item is
 * missing (or on a retryable error). Returns the first fully-covered result; otherwise the best
 * (fewest-missing) attempt with a loud coverage warning attached. Generic and injectable so it is
 * unit-tested with mocked attempts — no live OpenAI.
 */
export async function extractWithCoverageRetry<T extends { quote: ProcessedQuote }>(args: {
  transcript: string
  maxAttempts: number
  attempt: (attemptNumber: number) => Promise<T>
  isRetryableError?: (error: unknown, attemptNumber: number) => boolean
  onAttempt?: (info: CoverageAttemptInfo) => void
}): Promise<T> {
  let best: T | null = null
  let bestMissing: string[] = []
  let lastError: unknown = null

  for (let attemptNumber = 1; attemptNumber <= args.maxAttempts; attemptNumber += 1) {
    let result: T
    try {
      result = await args.attempt(attemptNumber)
    } catch (error) {
      lastError = error
      args.onAttempt?.({ attemptNumber, missing: [], error })
      if (attemptNumber < args.maxAttempts && (args.isRetryableError?.(error, attemptNumber) ?? false)) continue
      throw error
    }

    const missing = findMissingStructuralCoverage(args.transcript, result.quote)
    args.onAttempt?.({ attemptNumber, missing })
    if (missing.length === 0) return result

    if (best === null || missing.length < bestMissing.length) {
      best = result
      bestMissing = missing
    }
    // else: coverage incomplete — loop and retry while attempts remain.
  }

  if (best !== null) {
    attachCoverageWarnings(best.quote, bestMissing)
    return best
  }
  throw lastError ?? new Error("Extraction failed with no result.")
}
