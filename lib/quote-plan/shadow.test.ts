import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import { buildQuotePlan } from "./build-plan"
import { buildShadowReport, diffQuotePlans, runShadowPlanner } from "./shadow"
import type { BuildQuotePlanInput, QuotePlan } from "./types"

/**
 * QuotePlan shadow comparison — pure/deterministic, no OpenAI. Drafts below stand in for a
 * future AI planner's output; none of these tests calls a live model.
 */

function fallbackInput(overrides: Partial<ProcessedQuote> = {}): BuildQuotePlanInput {
  return {
    extraction: {
      ...EMPTY_PROCESSED_QUOTE,
      job_type: "landscaping",
      primary_quote: {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        quote_title: "Landscaping",
        job_type: "landscaping",
        scope: ["Lay a new lawn"],
      },
      ...overrides,
    },
    transcript: "Lay a new lawn for a landscaping job.",
    classification: { specialist: "landscaping" },
  }
}

function validDraft(): Record<string, unknown> {
  return {
    quoteType: "landscaping",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Back Lawn Levelling",
      kind: "main",
      scope: ["Spread topsoil", "Sow lawn seed"],
      labour: [{ raw: "one person one day", people: 1, days: 1, hours: 8, determinacy: "explicit" }],
      materials: [{ name: "Topsoil", optional: false }],
      sourceText: "Spread topsoil and sow lawn seed.",
    },
    optional: [
      {
        id: "optional-1",
        title: "Optional hedge",
        kind: "optional",
        scope: ["Plant a hedge"],
        labour: [{ raw: "two people one day", people: 2, days: 1, hours: 16, determinacy: "explicit" }],
        materials: [],
        sourceText: "Optional hedge, two people one day.",
      },
    ],
    exclusions: [],
    uncertainties: [],
  }
}

function makePlan(overrides: Partial<QuotePlan> = {}): QuotePlan {
  return {
    quoteType: "landscaping",
    quoteTypeConfidence: "high",
    main: {
      id: "main",
      title: "Main",
      kind: "main",
      scope: ["a", "b"],
      labour: [{ raw: "one person one day", people: 1, days: 1, determinacy: "explicit" }],
      materials: [],
      sourceText: "main text",
    },
    optional: [],
    exclusions: [],
    uncertainties: [],
    ...overrides,
  }
}

// ── diffQuotePlans ────────────────────────────────────────────────────────────

test("diffQuotePlans: identical plans do not diverge", () => {
  const diff = diffQuotePlans(makePlan(), makePlan())
  assert.equal(diff.divergent, false)
  assert.deepEqual(diff.divergences, [])
})

test("diffQuotePlans: quoteType, optional count, main labour and scope deltas are reported", () => {
  const deterministic = makePlan()
  const candidate = makePlan({
    quoteType: "planting",
    optional: [
      {
        id: "optional-1",
        title: "Opt",
        kind: "optional",
        scope: ["x"],
        labour: [],
        materials: [],
        sourceText: "opt",
      },
    ],
    main: {
      id: "main",
      title: "Main",
      kind: "main",
      scope: ["a", "b", "c"],
      labour: [
        { raw: "one person one day", people: 1, days: 1, determinacy: "explicit" },
        { raw: "extra", hours: 2, determinacy: "inferred" },
      ],
      materials: [],
      sourceText: "main text",
    },
  })
  const diff = diffQuotePlans(deterministic, candidate)
  assert.equal(diff.divergent, true)
  assert.equal(diff.quoteTypeChanged, true)
  assert.equal(diff.optionalBucketCountDelta, 1)
  assert.equal(diff.mainLabourCountDelta, 1)
  assert.equal(diff.mainScopeCountDelta, 1)
})

// ── buildShadowReport ─────────────────────────────────────────────────────────

test("buildShadowReport: a valid draft is accepted and never marked used for output", () => {
  const input = fallbackInput()
  const report = buildShadowReport({
    deterministicPlan: buildQuotePlan(input),
    draft: validDraft(),
    fallbackInput: input,
  })
  assert.equal(report.usedForOutput, false)
  assert.ok(report.status === "accepted" || report.status === "normalised", `unexpected status ${report.status}`)
  assert.ok(!report.findings.some((f) => f.severity === "error"), "a valid draft has no error findings")
})

test("buildShadowReport: an invalid draft falls back and the diff is empty (baseline == fallback)", () => {
  const input = fallbackInput()
  const report = buildShadowReport({
    deterministicPlan: buildQuotePlan(input),
    // No usable main bucket → resolveQuotePlan falls back to the deterministic plan.
    draft: { bogus: true, main: null },
    fallbackInput: input,
  })
  assert.equal(report.status, "fallback")
  assert.equal(report.usedForOutput, false)
  assert.equal(report.diff.divergent, false, "fallback resolves to the deterministic baseline, so no divergence")
  assert.match(report.summary, /REJECTED/)
})

// ── runShadowPlanner ──────────────────────────────────────────────────────────

test("runShadowPlanner: an async draft is reported and returned", async () => {
  const input = fallbackInput()
  let reported: unknown = null
  const report = await runShadowPlanner({
    shadowPlanner: async () => validDraft(),
    fallbackInput: input,
    deterministicPlan: buildQuotePlan(input),
    onReport: (r) => {
      reported = r
    },
  })
  assert.ok(report, "a report is returned")
  assert.equal(report?.usedForOutput, false)
  assert.strictEqual(reported, report, "onReport receives the same report")
})

test("runShadowPlanner: a throwing planner never throws and returns null (quote unaffected)", async () => {
  const input = fallbackInput()
  const warnings: unknown[] = []
  const report = await runShadowPlanner({
    shadowPlanner: () => {
      throw new Error("planner boom")
    },
    fallbackInput: input,
    deterministicPlan: buildQuotePlan(input),
    logger: { log() {}, warn: (...args: unknown[]) => warnings.push(args), error() {} },
  })
  assert.equal(report, null)
  assert.equal(warnings.length, 1, "the failure is logged as a warning, not thrown")
})
