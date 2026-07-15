import type { AuditContext, AuditIssue } from "../types"
import type { PricingFact } from "../../core/pricing-extraction"

// Words that indicate the amount is a quantity, not a price.
// If the source sentence matches one of these and no explicit currency symbol
// appears before the number, the pricing fact is likely wrong.
const MATERIAL_QUANTITY_INDICATORS = [
  /\b\d+(?:\.\d+)?\s*(?:bags?|plants?|units?|pallets?|rolls?|bundles?|sheets?|litres?|liters?|l\b|m3|m²|m2|cubic\s+met(?:re|er)s?|square\s+met(?:re|er)s?|kg\b|kilograms?)\b/i,
  /\b(?:allow|use|need)\s+\d+(?:\.\d+)?\s*(?:bags?|plants?|rolls?|pallets?|bundles?|sheets?|litres?|liters?)\b/i,
]

// A sentence contains an explicit currency symbol immediately before the number
const EXPLICIT_PRICE_PATTERN = /\$\s*\d+(?:[.,]\d+)?/

function sourceHasMaterialQuantityIndicator(source: string): boolean {
  return MATERIAL_QUANTITY_INDICATORS.some((pattern) => pattern.test(source))
}

function sourceHasExplicitCurrency(source: string): boolean {
  return EXPLICIT_PRICE_PATTERN.test(source)
}

export function v02PricingFacts(ctx: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = []
  const { processedQuote } = ctx

  // `processedQuote.pricing_facts` is typed as unknown in the base ProcessedQuote;
  // the actual field name from the schema is `pricing_facts`.
  const pricingFacts: PricingFact[] = Array.isArray(
    (processedQuote as unknown as Record<string, unknown>).pricing_facts,
  )
    ? ((processedQuote as unknown as Record<string, unknown>).pricing_facts as PricingFact[])
    : []

  for (const fact of pricingFacts) {
    const source = fact.source_text ?? ""
    if (!source) continue

    const hasExplicitCurrency = sourceHasExplicitCurrency(source)
    const looksMaterialQuantity = sourceHasMaterialQuantityIndicator(source)

    if (looksMaterialQuantity && !hasExplicitCurrency) {
      issues.push({
        id: "V02-quantity-as-price",
        severity: "error",
        category: "pricing_facts",
        message: `Pricing fact $${fact.amount} appears to be extracted from a material quantity sentence, not a spoken price.`,
        evidence: source,
        expected: "No pricing fact (material quantities are not prices)",
        actual: `$${fact.amount} from: "${source}"`,
        suggested_fix:
          "Add a guard in allowanceForSentence() to skip material quantity phrases (bags, plants, rolls, etc.).",
        can_auto_correct: false,
      })
    }
  }

  return issues
}
