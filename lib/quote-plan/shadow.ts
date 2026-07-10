import { resolveQuotePlan } from "./validate"
import type { QuotePlanResolutionStatus, QuotePlanValidationFinding } from "./validate"
import type { BuildQuotePlanInput, QuotePlan, WorkBucket } from "./types"

/**
 * QuotePlan shadow comparison (QuotePlan Milestone 4).
 *
 * Given an untrusted AI draft plan and the deterministic `buildQuotePlan` baseline, this
 * resolves the draft through the deterministic gate (`resolveQuotePlan`), diffs the resolved
 * candidate against the baseline, and produces a report that is LOGGED INTERNAL-ONLY. The
 * report explicitly records `usedForOutput: false` — the shadow candidate never drives
 * pricing, rendering or export. Everything here is deterministic given a fixed draft.
 */

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

export type ShadowPlannerReport = {
  status: QuotePlanResolutionStatus
  /** Always false — the shadow candidate is never used to build the quote. */
  usedForOutput: false
  findings: QuotePlanValidationFinding[]
  diff: QuotePlanDiff
  summary: string
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

function summarise(status: QuotePlanResolutionStatus, diff: QuotePlanDiff, findings: QuotePlanValidationFinding[]): string {
  const errorCount = findings.filter((f) => f.severity === "error").length
  const warnCount = findings.filter((f) => f.severity === "warning").length
  if (status === "fallback") {
    return `shadow REJECTED (${errorCount} error(s), ${warnCount} warning(s)); deterministic plan used unchanged.`
  }
  const agreement = diff.divergent ? `diverges from deterministic (${diff.divergences.length} difference(s))` : "matches deterministic"
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
}): ShadowPlannerReport {
  const resolution = resolveQuotePlan({ draft: args.draft, fallbackInput: args.fallbackInput })
  const diff = diffQuotePlans(args.deterministicPlan, resolution.plan)
  return {
    status: resolution.status,
    usedForOutput: false,
    findings: resolution.findings,
    diff,
    summary: summarise(resolution.status, diff, resolution.findings),
  }
}

/**
 * Orchestrate the shadow run: call the (async, possibly AI-backed) planner, build the report,
 * and log it internal-only. Guarantees it NEVER throws and NEVER returns a plan for output —
 * any failure is swallowed (logged as a warning) so the live quote is completely unaffected.
 */
export async function runShadowPlanner(args: {
  shadowPlanner: (input: BuildQuotePlanInput) => unknown | Promise<unknown>
  fallbackInput: BuildQuotePlanInput
  deterministicPlan: QuotePlan
  logger?: Pick<Console, "log" | "warn" | "error">
  onReport?: (report: ShadowPlannerReport) => void
}): Promise<ShadowPlannerReport | null> {
  try {
    const draft = await args.shadowPlanner(args.fallbackInput)
    const report = buildShadowReport({
      deterministicPlan: args.deterministicPlan,
      draft,
      fallbackInput: args.fallbackInput,
    })
    args.logger?.log?.("quote-plan shadow", {
      status: report.status,
      summary: report.summary,
      divergences: report.diff.divergences,
      findings: report.findings,
    })
    args.onReport?.(report)
    return report
  } catch (error) {
    args.logger?.warn?.("quote-plan shadow failed (ignored; live quote unaffected)", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
