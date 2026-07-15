import type { ProcessedQuote } from "../processed-quote"

export type AuditStatus = "pass" | "needs_review" | "corrected" | "fail"

export type AuditSeverity = "error" | "warning" | "info"

export type AuditCategory =
  | "classification"
  | "measurement"
  | "labour"
  | "materials"
  | "green_waste"
  | "optional_works"
  | "pricing_facts"
  | "customer_preview"
  | "export_mapping"
  | "item_matching"
  | "address"
  | "template"
  | "calculator"

export type AuditIssue = {
  id: string
  severity: AuditSeverity
  category: AuditCategory
  message: string
  evidence?: string
  expected?: string
  actual?: string
  suggested_fix?: string
  can_auto_correct: boolean
}

export type AuditResult = {
  audit_status: AuditStatus
  issues: AuditIssue[]
  warnings: string[]
  blocked_export_reasons: string[]
}

export type AuditContext = {
  rawTranscript: string
  processedQuote: ProcessedQuote
  customerPreviewText?: string
  matchedLineItemText?: string
}
