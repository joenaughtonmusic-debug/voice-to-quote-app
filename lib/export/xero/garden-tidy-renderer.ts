import type { XeroExportLineItem, XeroPayloadQuote } from "./types"
import { accountCodeFromLineItem, labourLineItem, taxTypeFromLineItem, xeroItemCode } from "./helpers"

function isGardenTidyQuote(quote: XeroPayloadQuote): boolean {
  const selectedTemplate = quote.selected_template
  const text = [
    quote.job_type,
    quote.quote_title,
    quote.primary_quote?.quote_title,
    selectedTemplate?.category,
    selectedTemplate?.job_type,
    selectedTemplate?.template_name,
    selectedTemplate?.name,
  ]
    .filter(Boolean)
    .join(" ")

  return /\bgarden[_\s-]?tidy|one[_\s-]?off[_\s-]?tidy|property[_\s-]?tidy\b/i.test(text)
}

function spokenFixedPrice(quote: XeroPayloadQuote) {
  return (quote.pricing_facts ?? []).find(
    (fact) => fact.type === "fixed_price" && typeof fact.amount === "number" && Number.isFinite(fact.amount),
  )
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map(cleanLine)
    .filter((value) => {
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function gardenTidyScopeItems(quote: XeroPayloadQuote): string[] {
  const candidates = [
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote?.scope ?? []),
    ...(quote.primary_quote?.notes ?? []),
  ]
  return unique(
    candidates
      .filter((item) =>
        /\b(overgrowth|cut\s+back|shrubs?|weed\w*|garden\s+beds?|self[-\s]?seeded|trim\w*|prun\w*|hedge|green\s*waste|greenwaste|site)\b/i.test(
          item,
        ),
      )
      .map(titleCase),
  )
}

function gardenTidyInclusions(quote: XeroPayloadQuote): string[] {
  return unique(
    (quote.pricing_facts ?? [])
      .filter((fact) => fact.type === "fixed_price")
      .flatMap((fact) => fact.inclusions ?? [])
      .map(titleCase),
  )
}

function gardenTidySiteNotes(quote: XeroPayloadQuote): string[] {
  const scopeKeys = new Set(gardenTidyScopeItems(quote).map((item) => item.toLowerCase()))
  return unique(
    (quote.primary_quote?.notes ?? [])
      .map(titleCase)
      .filter((item) => !scopeKeys.has(item.toLowerCase())),
  )
}

function gardenTidyXeroDescription(quote: XeroPayloadQuote): string {
  const scope = gardenTidyScopeItems(quote)
  const inclusions = gardenTidyInclusions(quote)
  const siteNotes = gardenTidySiteNotes(quote)
  const lines = ["One-Off Garden Tidy"]

  if (scope.length > 0) {
    lines.push("", "Scope:", ...scope.map((item) => `- ${item}`))
  }

  if (inclusions.length > 0) {
    lines.push("", "Includes:", ...inclusions.map((item) => `- ${item}`))
  }

  if (siteNotes.length > 0) {
    lines.push("", "Site notes:", ...siteNotes.map((item) => `- ${item}`))
  }

  return lines.join("\n")
}

/**
 * Builds Xero line items for a one-off garden tidy quote.
 *
 * Returns an empty array when:
 * - The quote is not a garden tidy.
 * - No spoken fixed price was captured (falls through to generic renderer).
 *
 * This renderer must be evaluated BEFORE the maintenance renderer so that
 * garden tidy quotes with a template.trade of "maintenance" are not
 * incorrectly labelled "Ongoing Garden Maintenance".
 */
export function buildGardenTidyXeroExportLineItems(quote: XeroPayloadQuote): XeroExportLineItem[] {
  if (!isGardenTidyQuote(quote)) return []

  const price = spokenFixedPrice(quote)
  if (!price || typeof price.amount !== "number") return []

  const labourItem = labourLineItem(quote)
  const code = xeroItemCode(labourItem?.item_code, labourItem?.source_system, labourItem?.item_name, labourItem?.description)

  return [
    {
      category: "labour",
      description: "One-Off Garden Tidy",
      xeroDescription: gardenTidyXeroDescription(quote),
      quantity: 1,
      unitAmount: price.amount,
      itemCode: code.itemCode,
      omittedItemCode: code.omittedItemCode,
      itemCodeSource: labourItem?.source_system,
      xeroAccountCode: accountCodeFromLineItem(labourItem),
      xeroTaxType: taxTypeFromLineItem(labourItem),
      gstRate: labourItem?.gst_rate ?? null,
    },
  ]
}
