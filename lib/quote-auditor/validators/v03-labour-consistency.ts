import type { AuditContext, AuditIssue } from "../types"
import { structuredAllowanceLabourPrice } from "../../export/labour-line-builder"
import type { XeroPayloadQuote } from "../../export/xero/types"

const TOLERANCE = 0.02 // 2 cents rounding tolerance

function labourLineItemTotal(ctx: AuditContext): number | null {
  const labourItem = ctx.processedQuote.line_items.find(
    (item) =>
      /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  if (!labourItem?.total) return null
  const parsed = Number(String(labourItem.total).replace(/[$,]/g, ""))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function labourLineItemDisplay(ctx: AuditContext): string {
  const item = ctx.processedQuote.line_items.find(
    (item) =>
      /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  if (!item) return "(no labour line item)"
  const qty = item.quantity ?? ""
  const unit = item.unit ?? ""
  const total = item.total ?? ""
  // Reproduce what matchedLineItemLines() renders
  const qtyDisplay =
    qty && unit && !qty.toLowerCase().includes(unit.toLowerCase())
      ? `Qty ${qty} ${unit}`
      : qty
        ? `Qty ${qty}`
        : ""
  return [qtyDisplay, total ? `Total ${total}` : ""].filter(Boolean).join(" | ")
}

function labourPanelTotal(ctx: AuditContext): number | null {
  // Cast to the shape structuredAllowanceLabourPrice expects
  const quoteAsXero = ctx.processedQuote as unknown as XeroPayloadQuote
  const structured = structuredAllowanceLabourPrice(quoteAsXero)
  if (!structured || structured.pricingSource === "unpriced") return null
  return structured.amount > 0 ? structured.amount : null
}

export function v03LabourConsistency(ctx: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = []

  // ── 1. Check for combined-unit nonsense in labour line item ───────────────
  const labourItem = ctx.processedQuote.line_items.find(
    (item) =>
      /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name),
  )
  if (labourItem) {
    const qty = (labourItem.quantity ?? "").trim().toLowerCase()
    const unit = (labourItem.unit ?? "").trim().toLowerCase()

    // "1.5 days" + "hours" → "Qty 1.5 days hours"
    if (/\bdays?\b/.test(qty) && /\bhours?\b/.test(unit)) {
      issues.push({
        id: "V03-combined-unit-display",
        severity: "error",
        category: "export_mapping",
        message:
          "Labour line item has quantity containing 'days' with unit 'hours' — will render as 'Qty 1.5 days hours'.",
        evidence: `quantity: "${labourItem.quantity}", unit: "${labourItem.unit}"`,
        expected: "quantity: '12', unit: 'hours'",
        actual: `quantity: "${labourItem.quantity}", unit: "${labourItem.unit}"`,
        suggested_fix:
          "normaliseDaysLabourLineItem should run after attachMatchedLineItemMetadata to fix this.",
        can_auto_correct: false,
      })
    }
  }

  // ── 2. Labour Pricing panel total vs Matched JMS line total ───────────────
  const jmsTotal = labourLineItemTotal(ctx)
  const panelTotal = labourPanelTotal(ctx)

  if (
    jmsTotal !== null &&
    panelTotal !== null &&
    Math.abs(jmsTotal - panelTotal) > TOLERANCE
  ) {
    const jmsDisplay = labourLineItemDisplay(ctx)
    issues.push({
      id: "V03-labour-total-mismatch",
      severity: "error",
      category: "labour",
      message:
        "Labour Pricing panel total disagrees with Matched JMS line item total. Internal review will show contradictory values.",
      evidence: `JMS line: ${jmsDisplay} | Structured allowance total: $${panelTotal.toFixed(2)}`,
      expected: `$${panelTotal.toFixed(2)} (from structured allowance)`,
      actual: `$${jmsTotal.toFixed(2)} (from JMS line item)`,
      suggested_fix:
        "normaliseDaysLabourLineItem must run after KB metadata is attached so the line item total matches the allowance calculation.",
      can_auto_correct: false,
    })
  }

  return issues
}
