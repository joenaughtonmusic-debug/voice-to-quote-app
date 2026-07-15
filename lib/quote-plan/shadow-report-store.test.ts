import assert from "node:assert/strict"
import test from "node:test"

import { buildShadowReportRecord, transcriptHash } from "./shadow-report-store"
import type { ShadowPlannerReport } from "./shadow"
import type { QuotePlan } from "./types"

function plan(quoteType = "landscaping"): QuotePlan {
  return {
    quoteType,
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
    findings: [{ code: "c", message: "m", severity: "warning" }],
    diff: {
      deterministicQuoteType: "landscaping",
      candidateQuoteType: "landscaping",
      quoteTypeChanged: false,
      mainLabourCountDelta: 0,
      optionalBucketCountDelta: 0,
      mainScopeCountDelta: 0,
      divergences: [],
      divergent: false,
    },
    summary: "ok",
    deterministicPlan: plan(),
    aiDraftPlan: { quoteType: "landscaping" },
    resolvedPlan: plan(),
    model: { provider: "openai", model: "gpt-4o-mini" },
    ...overrides,
  }
}

test("transcriptHash is stable and differs by input", () => {
  assert.equal(transcriptHash("hello"), transcriptHash("hello"))
  assert.notEqual(transcriptHash("hello"), transcriptHash("world"))
  assert.match(transcriptHash("x"), /^[0-9a-f]{64}$/)
})

test("buildShadowReportRecord maps the report + context to a jsonb-friendly row", () => {
  const rec = buildShadowReportRecord(report(), { userId: "user-1", draftId: "d-9", transcript: "lay a lawn" })
  assert.equal(rec.user_id, "user-1")
  assert.equal(rec.draft_id, "d-9")
  assert.equal(rec.transcript_hash, transcriptHash("lay a lawn"))
  assert.equal(rec.resolve_status, "accepted")
  assert.equal(rec.used_for_output, false, "shadow output is never used in this milestone")
  assert.deepEqual(rec.deterministic_plan, report().deterministicPlan)
  assert.deepEqual(rec.validation_findings, report().findings)
  assert.deepEqual(rec.diff_summary, report().diff)
  assert.deepEqual(rec.model, { provider: "openai", model: "gpt-4o-mini" })
})

test("buildShadowReportRecord defaults draft_id to null and handles a failed report", () => {
  const rec = buildShadowReportRecord(report({ status: "failed", diff: null, resolvedPlan: null, aiDraftPlan: null }), {
    userId: "user-1",
    transcript: "t",
  })
  assert.equal(rec.draft_id, null)
  assert.equal(rec.resolve_status, "failed")
  assert.equal(rec.ai_draft_plan, null)
  assert.equal(rec.resolved_ai_plan, null)
  assert.equal(rec.diff_summary, null)
  assert.equal(rec.used_for_output, false)
})
