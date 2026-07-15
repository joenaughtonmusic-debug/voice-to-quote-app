import assert from "node:assert/strict"
import test from "node:test"

import { buildShadowPlannerCardModel, SHADOW_NOT_USED_NOTICE, AI_PLAN_DROVE_NOTICE } from "./shadow-card-model"
import type { ShadowPlannerReport } from "./shadow"
import type { QuotePlan } from "./types"

function plan(): QuotePlan {
  return {
    quoteType: "landscaping",
    quoteTypeConfidence: "high",
    main: { id: "main", title: "Main", kind: "main", scope: ["a"], labour: [], materials: [], sourceText: "x" },
    optional: [],
    exclusions: [],
    uncertainties: [],
  }
}

function report(overrides: Partial<ShadowPlannerReport> = {}): ShadowPlannerReport {
  return {
    status: "accepted",
    usedForOutput: false,
    findings: [
      { code: "unknown_quote_type", message: "quoteType is unusual", severity: "warning" },
      { code: "info_note", message: "an info note", severity: "info" },
    ],
    diff: {
      deterministicQuoteType: "landscaping",
      candidateQuoteType: "planting",
      quoteTypeChanged: true,
      mainLabourCountDelta: 1,
      optionalBucketCountDelta: 0,
      mainScopeCountDelta: 0,
      divergences: ['quoteType: deterministic "landscaping" vs shadow "planting"'],
      divergent: true,
    },
    summary: "shadow accepted and diverges from deterministic (1 difference(s)); 1 warning(s). Not used for output.",
    deterministicPlan: plan(),
    aiDraftPlan: {},
    resolvedPlan: plan(),
    model: { provider: "openai", model: "gpt-4o-mini" },
    ...overrides,
  }
}

test("card model shows the shadow-only notice when the plan did not drive", () => {
  assert.equal(buildShadowPlannerCardModel(report()).usageNotice, SHADOW_NOT_USED_NOTICE)
  assert.equal(buildShadowPlannerCardModel(report()).usedForOutput, false)
  assert.equal(buildShadowPlannerCardModel(null).usageNotice, SHADOW_NOT_USED_NOTICE)
})

test("card model shows the 'drove the quote' notice in controlled mode", () => {
  const model = buildShadowPlannerCardModel(report({ usedForOutput: true }))
  assert.equal(model.usedForOutput, true)
  assert.equal(model.usageNotice, AI_PLAN_DROVE_NOTICE)
})

test("card model renders status, findings, differences and model label", () => {
  const model = buildShadowPlannerCardModel(report())
  assert.equal(model.present, true)
  assert.equal(model.statusLabel, "Accepted")
  assert.equal(model.tone, "positive")
  assert.equal(model.findings.length, 2)
  assert.equal(model.findings[0].message, "quoteType is unusual")
  assert.deepEqual(model.differences, ['quoteType: deterministic "landscaping" vs shadow "planting"'])
  assert.equal(model.modelLabel, "openai / gpt-4o-mini")
})

test("card model maps each status to a label + tone", () => {
  assert.equal(buildShadowPlannerCardModel(report({ status: "normalised" })).statusLabel, "Normalised")
  assert.equal(buildShadowPlannerCardModel(report({ status: "fallback" })).tone, "warning")
  assert.equal(buildShadowPlannerCardModel(report({ status: "failed" })).tone, "danger")
})

test("card model for a failed report shows no diff lines but keeps the notice", () => {
  const model = buildShadowPlannerCardModel(report({ status: "failed", diff: null, error: "boom" }))
  assert.equal(model.statusLabel, "Failed")
  assert.deepEqual(model.differences, [])
  assert.equal(model.usageNotice, SHADOW_NOT_USED_NOTICE)
})

test("card model for a missing report is a clean 'skipped' state", () => {
  const model = buildShadowPlannerCardModel(undefined)
  assert.equal(model.present, false)
  assert.equal(model.statusLabel, "Skipped")
  assert.equal(model.findings.length, 0)
  assert.match(model.summary, /did not run/i)
})
