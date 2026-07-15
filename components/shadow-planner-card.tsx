import { cn } from "@/lib/utils"
import type { ShadowPlannerReport } from "@/lib/quote-plan/shadow"
import { buildShadowPlannerCardModel, type ShadowCardTone } from "@/lib/quote-plan/shadow-card-model"

/**
 * Internal-only card showing what the shadow-mode AI QuotePlan planner produced. It is
 * rendered ONLY in the internal review view and NEVER in customer-facing output. The shadow
 * plan does not drive the quote — the card always states this explicitly.
 */

function toneClassName(tone: ShadowCardTone) {
  switch (tone) {
    case "positive":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
    case "warning":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    case "danger":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
    default:
      return "bg-secondary text-muted-foreground"
  }
}

export function ShadowPlannerCard({ report }: { report: ShadowPlannerReport | null | undefined }) {
  const model = buildShadowPlannerCardModel(report)

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {model.usedForOutput ? "AI Planner (controlled)" : "AI Shadow Planner"}
          </h3>
          <p className={cn("mt-1 text-xs font-medium", model.usedForOutput ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
            {model.usageNotice}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", toneClassName(model.tone))}>
          {model.statusLabel}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-foreground">{model.summary}</p>

      {model.modelLabel && <p className="mt-2 text-xs text-muted-foreground">Model: {model.modelLabel}</p>}

      {model.differences.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Differences from deterministic plan
          </h4>
          <ul className="mt-1 grid gap-1">
            {model.differences.map((diff, i) => (
              <li key={i} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {diff}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.findings.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validation findings</h4>
          <ul className="mt-1 grid gap-1">
            {model.findings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
                  {finding.severity}
                </span>
                <span className="text-sm text-foreground">{finding.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
