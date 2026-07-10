import type { QuoteOption } from "./quote-options"

/**
 * Customer-facing formatting for optional_priced_works (QuotePlan Slice 3b).
 *
 * Only genuinely priced, safe-to-show optional works are rendered: subtotal > 0 and
 * no rate-missing warning. Nothing internal is exposed — no source/category/warnings,
 * and deliberately no labour hours (consistent with the customer-preview rule that
 * labour hours stay internal; hours remain visible on the internal Slice 3a card).
 * Customers see the work name and its optional price only, clearly separated from and
 * not included in the main quote.
 */

export const CUSTOMER_OPTIONAL_WORKS_HEADER = "Optional works"
export const CUSTOMER_OPTIONAL_WORKS_INTRO =
  "The following optional work is not included in the main quote. It can be added if you would like to proceed with it."

function isCustomerSafeOptionalWork(work: QuoteOption): boolean {
  if (!Number.isFinite(work.subtotal) || work.subtotal <= 0) return false
  if ((work.warnings ?? []).some((warning) => /rate missing/i.test(warning))) return false
  return work.lineItems.length > 0
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/** Returns the customer-safe optional-works block as text lines, or [] if none. */
export function buildCustomerOptionalWorksLines(works: QuoteOption[] | undefined): string[] {
  const safe = (works ?? []).filter(isCustomerSafeOptionalWork)
  if (safe.length === 0) return []

  const lines: string[] = [CUSTOMER_OPTIONAL_WORKS_HEADER, CUSTOMER_OPTIONAL_WORKS_INTRO]
  for (const work of safe) {
    lines.push(work.label)
    lines.push(`Optional price: ${money(work.subtotal)}`)
  }
  return lines
}
