import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import {
  COVERAGE_WARNING_PREFIX,
  attachCoverageWarnings,
  extractWithCoverageRetry,
  findMissingStructuralCoverage,
} from "./extraction-coverage"
import { coverageReviewNotices } from "./review-notices/coverage-notices"

const SARAH =
  "Quote for Sarah. 11.5m lower planting area of Ficus Tuffi. Lower paver area: 1.5m x 3.5m. " +
  "Upper planting area 13.7m. Include hard fill / removal of old soil."

function quote(scope: string[], materials: string[] = []): ProcessedQuote {
  return {
    ...EMPTY_PROCESSED_QUOTE,
    primary_quote: { ...EMPTY_PROCESSED_QUOTE.primary_quote, scope },
    materials,
    // Fresh array per quote — the shallow spread would otherwise share EMPTY's confidence_warnings.
    confidence_warnings: [],
  }
}

// ── findMissingStructuralCoverage ─────────────────────────────────────────────

test("flags a structural item present in the transcript but missing from the quote", () => {
  const q = quote(["Lower planting area with Ficus Tuffi", "Include hard fill and old soil removal"])
  const missing = findMissingStructuralCoverage(SARAH, q)
  assert.deepEqual(missing, ["paving / paver area"], "paver is missing; hard fill is present")
})

test("no miss when the structural item IS captured in the quote", () => {
  const q = quote(["Lower paver area preparation 1.5m x 3.5m", "Include hard fill"])
  assert.deepEqual(findMissingStructuralCoverage(SARAH, q), [])
})

test("no miss for a pure planting job (no structural trade in the transcript)", () => {
  const michelia = "Planting quote. 14.2m planting area of Michelia. Optional: install a 150x50 timber board border."
  assert.deepEqual(findMissingStructuralCoverage(michelia, quote(["Plant a Michelia hedge"])), [])
})

// ── attachCoverageWarnings ────────────────────────────────────────────────────

test("attachCoverageWarnings records a loud, prefixed, deduped warning per item", () => {
  const q = quote([])
  attachCoverageWarnings(q, ["paving / paver area"])
  attachCoverageWarnings(q, ["paving / paver area"]) // idempotent
  assert.equal(q.confidence_warnings!.length, 1)
  assert.match(q.confidence_warnings![0], new RegExp(`^${COVERAGE_WARNING_PREFIX}`))
  assert.match(q.confidence_warnings![0], /paver area/)
})

// ── extractWithCoverageRetry ──────────────────────────────────────────────────

test("returns the first fully-covered attempt and does not over-attempt", async () => {
  let calls = 0
  const covered = quote(["Lower paver area preparation", "hard fill"])
  const result = await extractWithCoverageRetry({
    transcript: SARAH,
    maxAttempts: 3,
    attempt: async () => {
      calls += 1
      return { quote: covered }
    },
  })
  assert.equal(calls, 1, "stops as soon as coverage is complete")
  assert.equal((result.quote.confidence_warnings ?? []).length, 0, "no coverage warning when covered")
})

test("retries a coverage miss then returns the covered attempt", async () => {
  let calls = 0
  const missingQ = quote(["Lower planting area", "hard fill"]) // no paver
  const coveredQ = quote(["Lower paver area", "hard fill"])
  const result = await extractWithCoverageRetry({
    transcript: SARAH,
    maxAttempts: 3,
    attempt: async (n) => {
      calls += 1
      return { quote: n === 1 ? missingQ : coveredQ }
    },
  })
  assert.equal(calls, 2, "retried once, succeeded on attempt 2")
  assert.equal((result.quote.confidence_warnings ?? []).length, 0)
})

test("after the retry cap with a persistent miss, attaches a loud coverage warning (never silent)", async () => {
  let calls = 0
  const result = await extractWithCoverageRetry({
    transcript: SARAH,
    maxAttempts: 3,
    attempt: async () => {
      calls += 1
      return { quote: quote(["Lower planting area", "hard fill"]) } // paver always missing
    },
  })
  assert.equal(calls, 3, "used the full retry budget")
  const warnings = result.quote.confidence_warnings ?? []
  assert.equal(warnings.length, 1, "the still-missing item is surfaced, not dropped silently")
  assert.match(warnings[0], /paver area/)
})

test("retries a retryable error, and re-throws a non-retryable one", async () => {
  let calls = 0
  const ok = await extractWithCoverageRetry({
    transcript: SARAH,
    maxAttempts: 3,
    attempt: async (n) => {
      calls += 1
      if (n === 1) throw new Error("transient")
      return { quote: quote(["Lower paver area", "hard fill"]) }
    },
    isRetryableError: () => true,
  })
  assert.equal(calls, 2)
  assert.ok(ok)

  await assert.rejects(
    extractWithCoverageRetry({
      transcript: SARAH,
      maxAttempts: 3,
      attempt: async () => {
        throw new Error("fatal")
      },
      isRetryableError: () => false,
    }),
    /fatal/,
  )
})

// ── coverageReviewNotices contributor ─────────────────────────────────────────

test("coverageReviewNotices turns a coverage warning line into a severity=error notice", () => {
  const text = `some transcript line\n${COVERAGE_WARNING_PREFIX} "paving / paver area" was described in the notes but is missing from the quote — add it before sending.`
  const notices = coverageReviewNotices({ text })
  assert.equal(notices.length, 1)
  assert.equal(notices[0].severity, "error")
  assert.equal(notices[0].source, "coverage")
  assert.match(notices[0].message, /paver area/)
})

test("coverageReviewNotices emits nothing when there is no coverage warning", () => {
  assert.deepEqual(coverageReviewNotices({ text: "just a normal transcript about paving work" }), [])
})
