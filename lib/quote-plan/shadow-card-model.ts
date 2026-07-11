import type { ShadowPlannerReport, ShadowResolveStatus } from "./shadow"

/**
 * Pure presentation model for the internal Shadow Planner card. Kept framework-free so it can
 * be unit-tested without React; the component (components/shadow-planner-card.tsx) is a thin
 * render of this. It is INTERNAL-ONLY telemetry — nothing here is ever shown to a customer.
 */

export type ShadowCardTone = "positive" | "neutral" | "warning" | "danger"

export type ShadowCardFinding = { severity: string; message: string }

export type ShadowPlannerCardModel = {
  /** Fixed, always-shown disclaimer that the shadow plan did not drive the quote. */
  notUsedNotice: string
  statusLabel: string
  tone: ShadowCardTone
  summary: string
  /** True when there is a report to show; false renders an empty/"not run" state. */
  present: boolean
  findings: ShadowCardFinding[]
  /** Human-readable key differences from the deterministic plan. */
  differences: string[]
  /** Model/provider label, when known (e.g. "openai / gpt-4o-mini"). */
  modelLabel: string | null
}

export const SHADOW_NOT_USED_NOTICE = "Shadow only — not used for quote output."

const STATUS_LABELS: Record<ShadowResolveStatus, string> = {
  accepted: "Accepted",
  normalised: "Normalised",
  fallback: "Fallback (deterministic used)",
  failed: "Failed",
  skipped: "Skipped",
}

const STATUS_TONES: Record<ShadowResolveStatus, ShadowCardTone> = {
  accepted: "positive",
  normalised: "neutral",
  fallback: "warning",
  failed: "danger",
  skipped: "neutral",
}

/** Build the card model from a report (or the absence of one → "skipped"/not-run state). */
export function buildShadowPlannerCardModel(report: ShadowPlannerReport | null | undefined, limit = 5): ShadowPlannerCardModel {
  if (!report) {
    return {
      notUsedNotice: SHADOW_NOT_USED_NOTICE,
      statusLabel: STATUS_LABELS.skipped,
      tone: STATUS_TONES.skipped,
      summary: "Shadow AI planning did not run for this quote.",
      present: false,
      findings: [],
      differences: [],
      modelLabel: null,
    }
  }

  const findings = report.findings.slice(0, limit).map((f) => ({ severity: f.severity, message: f.message }))
  const differences = (report.diff?.divergences ?? []).slice(0, limit)
  const model = report.model
  const modelLabel = model ? [model.provider, model.model].filter(Boolean).join(" / ") || null : null

  return {
    notUsedNotice: SHADOW_NOT_USED_NOTICE,
    statusLabel: STATUS_LABELS[report.status] ?? report.status,
    tone: STATUS_TONES[report.status] ?? "neutral",
    summary: report.summary,
    present: true,
    findings,
    differences,
    modelLabel,
  }
}
