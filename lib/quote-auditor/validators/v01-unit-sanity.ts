import type { AuditContext, AuditIssue } from "../types"

const TIME_UNIT_PATTERN = /\b(days?|hours?|hrs?|minutes?)\b/i

// Patterns that indicate a bogus plant name produced by the calculator
// (adjectives / measurement fragments that are never valid plant names)
const BOGUS_PLANT_NAME_PATTERN =
  /^(long|short|tall|small|large|wide|new|old|existing|left|right|metres?\s|meters?\s|centimetres?\s|millimetres?)/i

export function v01UnitSanity(ctx: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = []
  const { processedQuote } = ctx

  // ── 1. Green waste with a time unit ──────────────────────────────────────
  if (processedQuote.greenwaste && TIME_UNIT_PATTERN.test(processedQuote.greenwaste)) {
    issues.push({
      id: "V01-greenwaste-time-unit",
      severity: "error",
      category: "green_waste",
      message: "Green waste quantity uses a time unit — should be trailer loads, m³, or a volume unit.",
      evidence: processedQuote.greenwaste,
      expected: "e.g. '2 trailer loads' or '3 m³'",
      actual: processedQuote.greenwaste,
      suggested_fix: "Re-extract green waste as a volume or trailer-load quantity.",
      can_auto_correct: false,
    })
  }

  // ── 2. Matched JMS line items with nonsense combined units ────────────────
  // Catches "Qty 1.5 days hours" — the live bug from AI unit + KB overwrite
  for (const item of processedQuote.line_items) {
    const qty = (item.quantity ?? "").trim().toLowerCase()
    const unit = (item.unit ?? "").trim().toLowerCase()

    // Quantity string itself embeds a time unit (e.g. "1.5 days") while unit is also set
    if (TIME_UNIT_PATTERN.test(qty) && unit && !qty.includes(unit)) {
      const display = `Qty ${item.quantity} ${item.unit}`.trim()
      issues.push({
        id: "V01-line-item-combined-unit",
        severity: "error",
        category: "export_mapping",
        message: `Line item "${item.item_name || item.description}" has a nonsense quantity+unit combination.`,
        evidence: display,
        expected: "e.g. 'Qty 12 hours' or 'Qty 1.5 days' (not both)",
        actual: display,
        suggested_fix:
          "Normalise days to hours when the rate is hourly. normaliseDaysLabourLineItem should have caught this.",
        can_auto_correct: false,
      })
    }

    // Material or non-labour item using a time unit
    const isLabour =
      /\blabou?r\b/i.test(item.item_type) || /\blabou?r\b/i.test(item.item_name)
    if (!isLabour && unit && TIME_UNIT_PATTERN.test(unit)) {
      issues.push({
        id: "V01-material-time-unit",
        severity: "warning",
        category: "materials",
        message: `Non-labour line item "${item.item_name || item.description}" uses a time unit ("${item.unit}").`,
        evidence: `unit: ${item.unit}`,
        expected: "volume, area, or count unit",
        actual: item.unit,
        suggested_fix: "Check extraction — material quantities should not use time units.",
        can_auto_correct: false,
      })
    }
  }

  // ── 3. Calculator results: bogus plant names ──────────────────────────────
  for (const result of processedQuote.plant_calculator_results ?? []) {
    const plantName = result.plant_name ?? ""
    if (plantName && BOGUS_PLANT_NAME_PATTERN.test(plantName)) {
      issues.push({
        id: "V01-bogus-plant-name",
        severity: "error",
        category: "calculator",
        message: `Planting calculator produced a bogus plant name that looks like an adjective or measurement fragment.`,
        evidence: `plant_name: "${plantName}"`,
        expected: "A real plant name, e.g. 'Michelia gracipes'",
        actual: `"${plantName}"`,
        suggested_fix:
          "Extend the isLikelyPlantName blocklist or add a pattern to extractPlantNameFromPlantingIntent.",
        can_auto_correct: false,
      })
    }
  }

  // ── 4. Customer scope: bogus plant name text ──────────────────────────────
  const scopeText = [
    ...(processedQuote.customer_scope ?? []),
    ...(processedQuote.primary_quote?.scope ?? []),
  ].join("\n")

  if (/metres?\s+long\.\s+the/i.test(scopeText)) {
    issues.push({
      id: "V01-customer-scope-measurement-fragment",
      severity: "error",
      category: "customer_preview",
      message:
        "Customer scope contains a measurement fragment ('metres long. The') that appears to be a misextracted plant name.",
      evidence: scopeText.match(/metres?\s+long\.\s+the[^\n]*/i)?.[0],
      expected: "Plant name only (e.g. 'Michelia gracipes')",
      actual: scopeText.match(/metres?\s+long\.\s+the[^\n]*/i)?.[0],
      suggested_fix: "Fix plant name extraction — metric words must not be accepted as plant names.",
      can_auto_correct: false,
    })
  }

  return issues
}
