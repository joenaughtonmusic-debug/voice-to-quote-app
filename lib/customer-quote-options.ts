import type { QuoteOption } from "./quote-options"

export type CustomerQuoteOption = {
  id: string
  label: string
  title: string
  quantityText: string
  subtotalText: string
}

export type CustomerQuoteOptionGroup = {
  areaLabel: string
  options: CustomerQuoteOption[]
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function cleanTitleForArea(title: string, areaLabel: string | undefined) {
  if (!areaLabel) return title
  const escapedArea = areaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return title.replace(new RegExp(`^${escapedArea}\\s+-\\s+`, "i"), "").trim()
}

function quantityText(option: QuoteOption) {
  const firstItem = option.lineItems[0]
  if (!firstItem) return ""

  const quantity = Number.isInteger(firstItem.quantity) ? firstItem.quantity.toString() : firstItem.quantity.toString()
  if (option.category === "planting" && (firstItem.unit === "each" || firstItem.unit === "plant" || firstItem.unit === "plants")) {
    return `${quantity} plants`
  }

  return [quantity, firstItem.unit].filter(Boolean).join(" ")
}

function customerOption(option: QuoteOption): CustomerQuoteOption | null {
  const firstItem = option.lineItems[0]
  if (!firstItem || !Number.isFinite(option.subtotal)) return null

  return {
    id: option.id,
    label: option.label,
    title: cleanTitleForArea(option.title, option.areaLabel),
    quantityText: quantityText(option),
    subtotalText: money(option.subtotal),
  }
}

export function groupCustomerQuoteOptions(options: QuoteOption[] | undefined): CustomerQuoteOptionGroup[] {
  if (!Array.isArray(options) || options.length === 0) return []

  const grouped = new Map<string, CustomerQuoteOption[]>()
  const seen = new Set<string>()

  for (const option of options) {
    const formatted = customerOption(option)
    if (!formatted) continue

    const areaLabel = option.areaLabel || "Planting options"
    const dedupeKey = [areaLabel, formatted.label, formatted.title, formatted.quantityText, formatted.subtotalText].join(":")
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    grouped.set(areaLabel, [...(grouped.get(areaLabel) ?? []), formatted])
  }

  return Array.from(grouped.entries()).map(([areaLabel, groupedOptions]) => ({
    areaLabel,
    options: groupedOptions,
  }))
}
