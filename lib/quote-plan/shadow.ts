import { resolveQuotePlan } from "./validate"
import type { QuotePlanValidationFinding } from "./validate"
import type { BuildQuotePlanInput, QuotePlan, WorkBucket } from "./types"

/**
 * QuotePlan shadow comparison + telemetry (QuotePlan Milestone 4 / shadow telemetry).
 *
 * Given an untrusted AI draft plan and the deterministic `buildQuotePlan` baseline, this
 * resolves the draft through the deterministic gate (`resolveQuotePlan`), diffs the resolved
 * candidate against the baseline, and produces a rich, internal-only report. The report
 * explicitly records `usedForOutput: false` — the shadow candidate NEVER drives pricing,
 * rendering or export. Everything here is deterministic given a fixed draft, and the
 * orchestrator (`runShadowPlanner`) is fully non-blocking: neither a planner failure nor a
 * persistence failure can ever fail or alter the live quote.
 */

/** accepted/normalised/fallback come from resolveQuotePlan; failed = planner threw;
 *  skipped = shadow not run (used by the UI when no report exists). */
export type ShadowResolveStatus = "accepted" | "normalised" | "fallback" | "failed" | "skipped"

export type QuotePlanDiff = {
  deterministicQuoteType: string
  candidateQuoteType: string
  quoteTypeChanged: boolean
  mainLabourCountDelta: number
  optionalBucketCountDelta: number
  mainScopeCountDelta: number
  /** Human-readable divergences, most-structural first. Empty when the plans agree. */
  divergences: string[]
  divergent: boolean
}

export type ShadowModelInfo = { provider?: string; model?: string }

export type ShadowPlannerReport = {
  status: ShadowResolveStatus
  /** Always false — the shadow candidate is never used to build the quote. */
  usedForOutput: false
  findings: QuotePlanValidationFinding[]
  /** null only when there is no resolved candidate to compare (status "failed"/"skipped"). */
  diff: QuotePlanDiff | null
  summary: string
  /** The trusted deterministic plan that actually drove (or would drive) the quote. */
  deterministicPlan: QuotePlan
  /** The raw, untrusted AI draft (null when the planner produced nothing or failed). */
  aiDraftPlan: unknown
  /** The plan resolveQuotePlan produced from the draft (null when failed/skipped). */
  resolvedPlan: QuotePlan | null
  /** Set only when status === "failed". */
  error?: string
  /** Optional model/provider metadata, when the caller knows it. */
  model?: ShadowModelInfo
}

function labourCount(bucket: WorkBucket): number {
  return bucket.labour.length
}

/** Deterministic structural diff between the trusted baseline and the shadow candidate. */
export function diffQuotePlans(deterministic: QuotePlan, candidate: QuotePlan): QuotePlanDiff {
  const divergences: string[] = []

  const quoteTypeChanged = deterministic.quoteType !== candidate.quoteType
  if (quoteTypeChanged) {
    divergences.push(`quoteType: deterministic "${deterministic.quoteType}" vs shadow "${candidate.quoteType}"`)
  }

  const optionalBucketCountDelta = candidate.optional.length - deterministic.optional.length
  if (optionalBucketCountDelta !== 0) {
    divergences.push(
      `optional bucket count: deterministic ${deterministic.optional.length} vs shadow ${candidate.optional.length}`,
    )
  }

  const mainLabourCountDelta = labourCount(candidate.main) - labourCount(deterministic.main)
  if (mainLabourCountDelta !== 0) {
    divergences.push(
      `main labour allocations: deterministic ${labourCount(deterministic.main)} vs shadow ${labourCount(candidate.main)}`,
    )
  }

  const mainScopeCountDelta = candidate.main.scope.length - deterministic.main.scope.length
  if (mainScopeCountDelta !== 0) {
    divergences.push(
      `main scope lines: deterministic ${deterministic.main.scope.length} vs shadow ${candidate.main.scope.length}`,
    )
  }

  return {
    deterministicQuoteType: deterministic.quoteType,
    candidateQuoteType: candidate.quoteType,
    quoteTypeChanged,
    mainLabourCountDelta,
    optionalBucketCountDelta,
    mainScopeCountDelta,
    divergences,
    divergent: divergences.length > 0,
  }
}

function summarise(status: ShadowResolveStatus, diff: QuotePlanDiff | null, findings: QuotePlanValidationFinding[]): string {
  const errorCount = findings.filter((f) => f.severity === "error").length
  const warnCount = findings.filter((f) => f.severity === "warning").length
  if (status === "failed") return "shadow planner failed; deterministic plan used unchanged."
  if (status === "fallback") {
    return `shadow REJECTED (${errorCount} error(s), ${warnCount} warning(s)); deterministic plan used unchanged.`
  }
  const agreement = diff?.divergent ? `diverges from deterministic (${diff.divergences.length} difference(s))` : "matches deterministic"
  return `shadow ${status} and ${agreement}; ${warnCount} warning(s). Not used for output.`
}

/**
 * Build the shadow report from a draft. Pure and deterministic: it routes the draft through
 * `resolveQuotePlan` (so an invalid draft resolves to the deterministic fallback, yielding an
 * empty diff) and never returns a plan for downstream use.
 */
export function buildShadowReport(args: {
  deterministicPlan: QuotePlan
  draft: unknown
  fallbackInput: BuildQuotePlanInput
  model?: ShadowModelInfo
}): ShadowPlannerReport {
  const resolution = resolveQuotePlan({ draft: args.draft, fallbackInput: args.fallbackInput })
  const diff = diffQuotePlans(args.deterministicPlan, resolution.plan)
  return {
    status: resolution.status,
    usedForOutput: false,
    findings: resolution.findings,
    diff,
    summary: summarise(resolution.status, diff, resolution.findings),
    deterministicPlan: args.deterministicPlan,
    aiDraftPlan: args.draft ?? null,
    resolvedPlan: resolution.plan,
    ...(args.model ? { model: args.model } : {}),
  }
}

/** A report for the case where the shadow planner itself threw. Deterministic output is
 * unaffected; this exists purely so the failure is observable. */
export function buildFailedShadowReport(deterministicPlan: QuotePlan, error: unknown, model?: ShadowModelInfo): ShadowPlannerReport {
  const message = error instanceof Error ? error.message : String(error)
  return {
    status: "failed",
    usedForOutput: false,
    findings: [],
    diff: null,
    summary: summarise("failed", null, []),
    deterministicPlan,
    aiDraftPlan: null,
    resolvedPlan: null,
    error: message,
    ...(model ? { model } : {}),
  }
}

/**
 * Orchestrate the shadow run: call the (async, possibly AI-backed) planner, build the report,
 * log it, optionally persist it, and hand it to `onReport`. GUARANTEES:
 *  - it never throws (a planner failure becomes a "failed" report),
 *  - a persistence failure is swallowed (never fails the quote),
 *  - it never returns a plan for output (usedForOutput is always false).
 */
export async function runShadowPlanner(args: {
  shadowPlanner: (input: BuildQuotePlanInput) => unknown | Promise<unknown>
  fallbackInput: BuildQuotePlanInput
  deterministicPlan: QuotePlan
  model?: ShadowModelInfo
  logger?: Pick<Console, "log" | "warn" | "error">
  /** Optional async persistence (Supabase-backed in production). Failure is swallowed. */
  persist?: (report: ShadowPlannerReport) => Promise<void>
  onReport?: (report: ShadowPlannerReport) => void
}): Promise<ShadowPlannerReport> {
  let report: ShadowPlannerReport
  try {
    const draft = await args.shadowPlanner(args.fallbackInput)
    report = buildShadowReport({
      deterministicPlan: args.deterministicPlan,
      draft,
      fallbackInput: args.fallbackInput,
      model: args.model,
    })
  } catch (error) {
    report = buildFailedShadowReport(args.deterministicPlan, error, args.model)
  }

  args.logger?.log?.("quote-plan shadow", {
    status: report.status,
    summary: report.summary,
    divergences: report.diff?.divergences ?? [],
    findings: report.findings,
    error: report.error,
  })

  if (args.persist) {
    try {
      await args.persist(report)
    } catch (error) {
      args.logger?.warn?.("quote-plan shadow report persistence failed (ignored; live quote unaffected)", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    args.onReport?.(report)
  } catch {
    // Observability hook must never affect the quote.
  }

  return report
}
