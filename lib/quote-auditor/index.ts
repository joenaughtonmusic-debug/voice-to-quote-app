import type { AuditContext, AuditIssue, AuditResult } from "./types"
import { v01UnitSanity } from "./validators/v01-unit-sanity"
import { v02PricingFacts } from "./validators/v02-pricing-facts"
import { v03LabourConsistency } from "./validators/v03-labour-consistency"

export type { AuditContext, AuditIssue, AuditResult } from "./types"
export type { AuditStatus, AuditSeverity, AuditCategory } from "./types"

const VALIDATORS = [v01UnitSanity, v02PricingFacts, v03LabourConsistency]

function deriveStatus(issues: AuditIssue[]): AuditResult["audit_status"] {
  if (issues.some((i) => i.severity === "error")) return "needs_review"
  if (issues.some((i) => i.severity === "warning")) return "needs_review"
  return "pass"
}

export function auditProcessedQuote(ctx: AuditContext): AuditResult {
  const issues: AuditIssue[] = []

  for (const validator of VALIDATORS) {
    try {
      issues.push(...validator(ctx))
    } catch (err) {
      // Validators must never crash the quote pipeline. Surface as info issue.
      const validatorName = validator.name || "unknown"
      issues.push({
        id: `auditor-validator-error-${validatorName}`,
        severity: "warning",
        category: "export_mapping",
        message: `Quote Auditor validator ${validatorName} threw an unexpected error.`,
        evidence: err instanceof Error ? err.message : String(err),
        can_auto_correct: false,
      })
    }
  }

  const warnings = issues
    .filter((i) => i.severity === "warning")
    .map((i) => i.message)

  const blockedExportReasons = issues
    .filter((i) => i.severity === "error" && i.category === "export_mapping")
    .map((i) => i.message)

  return {
    audit_status: deriveStatus(issues),
    issues,
    warnings,
    blocked_export_reasons: blockedExportReasons,
  }
}
