import { createHash } from "node:crypto"
import type { ShadowPlannerReport } from "./shadow"

/**
 * Persistence for AI QuotePlan shadow reports (telemetry only).
 *
 * The record is a flat, jsonb-friendly projection of a ShadowPlannerReport plus request
 * context (user, optional draft id, a transcript hash). `used_for_output` is ALWAYS false in
 * this milestone — the shadow candidate never drives the quote. The store interface is
 * implemented over Supabase in the route and in-memory in tests; persistence is best-effort
 * and its failure must never fail quote generation (see runShadowPlanner).
 */

export type ShadowReportRecord = {
  user_id: string
  draft_id: string | null
  transcript_hash: string
  deterministic_plan: unknown
  ai_draft_plan: unknown
  resolved_ai_plan: unknown
  resolve_status: string
  validation_findings: unknown
  diff_summary: unknown
  used_for_output: boolean
  model: unknown
}

export type ShadowReportStore = {
  save(record: ShadowReportRecord): Promise<void>
}

/** A short, non-reversible reference to the transcript (avoids storing raw customer text). */
export function transcriptHash(transcript: string): string {
  return createHash("sha256").update(transcript ?? "").digest("hex")
}

export function buildShadowReportRecord(
  report: ShadowPlannerReport,
  ctx: { userId: string; draftId?: string | null; transcript: string },
): ShadowReportRecord {
  return {
    user_id: ctx.userId,
    draft_id: ctx.draftId ?? null,
    transcript_hash: transcriptHash(ctx.transcript),
    deterministic_plan: report.deterministicPlan,
    ai_draft_plan: report.aiDraftPlan ?? null,
    resolved_ai_plan: report.resolvedPlan ?? null,
    resolve_status: report.status,
    validation_findings: report.findings,
    diff_summary: report.diff,
    // Invariant for this milestone: the shadow candidate is never used to build the quote.
    used_for_output: report.usedForOutput,
    model: report.model ?? null,
  }
}
