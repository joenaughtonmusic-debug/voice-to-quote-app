export const plantFieldAliases = {
  item_code: ["sku", "item code", "code", "plant code"],
  supplier: ["supplier", "nursery", "vendor"],
  plant_name: ["plant name", "name", "botanical name", "common name"],
  category: ["category", "group"],
  plant_type: ["plant type", "type"],
  default_spacing: ["default spacing", "spacing", "spacing mm", "plant spacing"],
  cost_price: ["nursery price", "cost price", "cost", "buy price", "trade price", "wholesale price"],
  markup_percent: ["markup", "markup percent", "markup percentage", "markup %", "margin", "margin %"],
  account_code: ["account code", "sales account", "sales account code", "revenue account", "income account"],
  sales_account_code: ["sales account", "sales account code", "sales account number"],
  tax_code: ["tax code", "sales tax code", "gst code"],
  tax_type: ["tax type", "sales tax type", "xero tax type"],
  gst_rate: ["gst rate", "gst", "tax rate", "sales tax rate", "salestaxrate"],
  sell_price: [
    "price",
    "retail price",
    "rrp",
    "list price",
    "unit price",
    "unit sell",
    "unit sell price",
    "sell price",
    "selling price",
    "sale price",
    "sales price",
    "customer price",
    "customer rate",
    "charge price",
    "plant price",
  ],
  stock_status: ["stock status", "status", "availability"],
  notes: ["quote app notes", "notes", "quote notes"],
} as const

export type PlantFieldKey = keyof typeof plantFieldAliases
export type PlantColumnMapping = Record<PlantFieldKey, string>

export function normalizePlantImportHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[+%$€£¥]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function headerMatchesAlias(header: string, alias: string) {
  const normalizedAlias = normalizePlantImportHeader(alias)
  if (!normalizedAlias) return false
  if (header === normalizedAlias) return true

  // "Price" is too broad for prefix matching because headers like
  // "Nursery Price (GST Inc)" should not become sell_price.
  if (normalizedAlias === "price") return false

  return header.startsWith(`${normalizedAlias} `)
}

function findHeader(headers: Array<{ header: string; normalized: string }>, aliases: readonly string[]) {
  return headers.find((entry) => aliases.some((alias) => headerMatchesAlias(entry.normalized, alias)))
}

export function detectPlantMapping(headers: string[]): PlantColumnMapping {
  const normalized = headers.map((header) => ({ header, normalized: normalizePlantImportHeader(header) }))
  return Object.fromEntries(
    Object.entries(plantFieldAliases).map(([field, aliases]) => {
      const match = findHeader(normalized, aliases as readonly string[])
      return [field, match?.header ?? ""]
    }),
  ) as PlantColumnMapping
}

export function parsePlantPrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const text = value == null ? "" : String(value).trim()
  if (!text || /^[-–—n/a]+$/i.test(text)) return null
  if (text.includes("%") && !/[$€£¥]|nzd|aud|usd|cad|gbp/i.test(text)) return null

  const match = text.replace(/\(([^)]+)\)/, "-$1").match(/-?\d[\d,]*(?:\.\d+)?/)
  if (!match) return null

  const parsed = Number(match[0].replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

export function plantPriceMappingWarnings(mapping: PlantColumnMapping) {
  const warnings: string[] = []

  if (!mapping.sell_price) {
    warnings.push("No sell price column detected. Plant options will import without sell prices unless a sell price column is mapped.")
  }

  if (mapping.cost_price && !mapping.sell_price) {
    warnings.push("Cost/nursery price was detected, but it will not be used as sell price.")
  }

  return warnings
}
