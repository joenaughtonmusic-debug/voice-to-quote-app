import type { PlantCalculatorWarning, PlantLibraryMatch, PlantLibraryOption } from "../calculators/planting"
import { classifyPlantCatalogItem } from "../plant-item-classification"

export type KnowledgePlantRow = {
  id?: string
  source_system?: string | null
  item_type?: string | null
  item_code?: string | null
  item_name?: string | null
  description?: string | null
  aliases?: unknown
  category?: string | null
  source_category?: string | null
  sell_price?: number | string | null
  account_code?: string | null
  sales_account_code?: string | null
  tax_code?: string | null
  tax_type?: string | null
  gst_rate?: number | string | null
  raw_import?: unknown
}

type NormalizedPlant = PlantLibraryOption & {
  search_terms: string[]
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim()
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value == null || String(value).trim() === "") return null
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(toText).filter(Boolean)
}

function rawValue(rawImport: unknown, key: string) {
  return rawImport && typeof rawImport === "object" ? (rawImport as Record<string, unknown>)[key] : undefined
}

function rawFirstValue(rawImport: unknown, keys: string[]) {
  for (const key of keys) {
    const value = rawValue(rawImport, key)
    if (toText(value)) return value
  }

  return undefined
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9āēīōū\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function cleanPlantNameFromItemName(value: string) {
  return value
    .replace(/\b\d+(?:\.\d+)?\s*(?:l|litres?|liters?|m|mm|cm)\b/gi, "")
    .replace(/\bpb\s*\d+\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*pb\b/gi, "")
    .replace(/\bpb\b/gi, "")
    .replace(/\b(hedge\s+plant|plant\s+grade|grade|pot|container|bag)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizePlantIdentityName(value: string) {
  return normalizeSearchText(cleanPlantNameFromItemName(value))
}

function normalizePlantRow(row: KnowledgePlantRow): NormalizedPlant {
  const rawImport = row.raw_import
  const rawPlantName =
    toText(rawValue(rawImport, "plant_name")) ||
    toText(rawValue(rawImport, "Plant Name")) ||
    cleanPlantNameFromItemName(toText(row.item_name))
  const plantName = cleanPlantNameFromItemName(rawPlantName)
  const botanicalName =
    toText(rawValue(rawImport, "botanical_name")) ||
    toText(rawValue(rawImport, "Botanical Name")) ||
    toText(rawValue(rawImport, "Botanical"))
  const commonName =
    toText(rawValue(rawImport, "common_name")) ||
    toText(rawValue(rawImport, "Common Name")) ||
    plantName
  const plantSize = toText(rawValue(rawImport, "plant_size")) || toText(rawValue(rawImport, "Plant Type"))
  const potSize = toText(rawValue(rawImport, "pot_size")) || plantSize
  const spacingMm = toNumber(rawValue(rawImport, "spacing_mm"))
  const aliases = toStringArray(row.aliases)
  const searchTerms = unique([
    plantName,
    rawPlantName,
    botanicalName,
    commonName,
    toText(row.item_name),
    toText(row.item_code),
    ...aliases,
  ]).map(normalizeSearchText)

  return {
    id: row.id,
    source_system: toText(row.source_system) || toText(rawFirstValue(rawImport, ["source_system", "Source System"])) || undefined,
    item_code: toText(row.item_code) || toText(rawFirstValue(rawImport, ["item_code", "Item Code", "*ItemCode", "ItemCode", "Code"])),
    item_name: toText(row.item_name) || undefined,
    plant_name: plantName || toText(row.item_name) || "Unnamed plant",
    botanical_name: botanicalName || undefined,
    common_name: commonName || undefined,
    plant_size: plantSize || undefined,
    pot_size: potSize || undefined,
    aliases,
    spacing_mm: spacingMm,
    sell_price: toNumber(row.sell_price),
    account_code:
      toText(row.account_code) ||
      toText(rawFirstValue(rawImport, ["account_code", "Account Code", "Sales Account Code", "SalesAccount"])) ||
      undefined,
    sales_account_code:
      toText(row.sales_account_code) ||
      toText(rawFirstValue(rawImport, ["sales_account_code", "Sales Account Code", "SalesAccount", "Sales Account"])) ||
      undefined,
    tax_code:
      toText(row.tax_code) ||
      toText(rawFirstValue(rawImport, ["tax_code", "Tax Code", "Sales Tax Rate", "SalesTaxRate"])) ||
      undefined,
    tax_type:
      toText(row.tax_type) ||
      toText(rawFirstValue(rawImport, ["tax_type", "Tax Type", "Sales Tax Rate", "SalesTaxRate"])) ||
      undefined,
    gst_rate: toNumber(row.gst_rate) ?? toNumber(rawFirstValue(rawImport, ["gst_rate", "GST Rate", "Sales Tax Rate", "SalesTaxRate"])),
    supplier: toText(rawValue(rawImport, "supplier")) || toText(row.source_category) || undefined,
    stock_status: toText(rawValue(rawImport, "stock_status")) || undefined,
    raw_import: rawImport,
    search_terms: searchTerms.filter(Boolean),
  }
}

function isTruePlantRow(row: KnowledgePlantRow) {
  const rawImport = row.raw_import
  const classification = classifyPlantCatalogItem({
    explicitType: toText(row.item_type || rawValue(rawImport, "item_type_classification")),
    itemCode: toText(row.item_code),
    itemName: toText(row.item_name),
    plantName: toText(rawValue(rawImport, "plant_name")) || toText(rawValue(rawImport, "Plant Name")),
    plantType:
      toText(rawValue(rawImport, "plant_size")) ||
      toText(rawValue(rawImport, "pot_size")) ||
      toText(rawValue(rawImport, "Plant Type")),
    description: toText(row.description),
    category: toText(row.category) || toText(rawValue(rawImport, "category")) || toText(rawValue(rawImport, "Category")),
    supplier: toText(row.source_category) || toText(rawValue(rawImport, "supplier")) || toText(rawValue(rawImport, "Supplier")),
    notes:
      toText(rawValue(rawImport, "quote_app_notes")) ||
      toText(rawValue(rawImport, "notes")) ||
      toText(rawValue(rawImport, "Quote App Notes")),
  })

  return classification.is_true_plant
}

function levenshteinDistance(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, row) => [row])
  for (let column = 1; column <= b.length; column += 1) matrix[0][column] = column

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

function similarityScore(a: string, b: string) {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 0
  return 1 - levenshteinDistance(a, b) / longest
}

function plantNameQueryVariants(plantName: string) {
  const query = normalizeSearchText(plantName)
  const variants = new Set([query])
  if (/\bmichaelia\b/.test(query)) variants.add(query.replace(/\bmichaelia\b/, "michelia"))
  if (/\bmichelia\b/.test(query)) variants.add(query.replace(/\bmichelia\b/, "michaelia"))
  return Array.from(variants)
}

function scorePlantQuery(plant: NormalizedPlant, query: string) {
  const exactNameTerms = [plant.plant_name, plant.common_name ?? "", plant.botanical_name ?? ""].map(normalizeSearchText)

  if (exactNameTerms.some((term) => term && term === query)) {
    return { score: 1, reason: "Exact plant name match." }
  }

  const aliasTerms = plant.search_terms.filter((term) => !exactNameTerms.includes(term))
  if (aliasTerms.some((term) => term === query)) {
    return { score: 0.95, reason: "Exact alias match." }
  }

  if (exactNameTerms.some((term) => term && (term.includes(query) || query.includes(term)))) {
    return { score: 0.82, reason: "Botanical/common/plant name partial match." }
  }

  if (plant.search_terms.some((term) => term && (term.includes(query) || query.includes(term)))) {
    return { score: 0.72, reason: "Partial Plant Library match." }
  }

  const fuzzyScore = Math.max(0, ...plant.search_terms.map((term) => similarityScore(term, query)))
  if (fuzzyScore >= 0.78) {
    return { score: fuzzyScore, reason: "Fuzzy Plant Library match." }
  }

  const queryWords = query.split(" ").filter(Boolean)
  const species = queryWords[queryWords.length - 1]
  if (species && species.length >= 4) {
    for (const term of plant.search_terms) {
      if (!term.endsWith(species)) continue
      const genusScore = similarityScore(term.slice(0, term.length - species.length).trim(), queryWords.slice(0, -1).join(" "))
      if (genusScore >= 0.75) {
        return { score: Math.max(0.72, genusScore), reason: "Fuzzy genus match with exact species." }
      }
    }
  }

  return { score: 0, reason: "No Plant Library match." }
}

function scorePlant(plant: NormalizedPlant, plantName: string) {
  let best = { score: 0, reason: "No Plant Library match." }
  for (const query of plantNameQueryVariants(plantName)) {
    const scored = scorePlantQuery(plant, query)
    if (scored.score > best.score) best = scored
  }
  return best
}

function confidenceFromScore(score: number): PlantLibraryMatch["match_confidence"] {
  if (score >= 0.9) return "high"
  if (score >= 0.72) return "medium"
  if (score >= 0.55) return "low"
  return "none"
}

function unresolvedPlantMatch(plantName: string): PlantLibraryMatch {
  const warning: PlantCalculatorWarning = {
    code: "unresolved_plant",
    message: `No Plant Library match found for "${plantName}".`,
    field: "plant_name",
    severity: "warning",
  }

  return {
    plant_name: plantName,
    match_confidence: "none",
    confidence_score: 0,
    match_reason: warning.message,
    default_spacing_mm: null,
    options: [],
    warnings: [warning],
  }
}

export function matchPlantRowsFromLibrary(rows: KnowledgePlantRow[], plantName: string): PlantLibraryMatch {
  const normalizedPlants = rows.filter(isTruePlantRow).map(normalizePlantRow).filter((plant) => plant.plant_name)
  const scored = normalizedPlants
    .map((plant) => ({ plant, ...scorePlant(plant, plantName) }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score < 0.55) return unresolvedPlantMatch(plantName)

  const bestName = normalizePlantIdentityName(best.plant.plant_name)
  const options = normalizedPlants.filter((plant) => normalizePlantIdentityName(plant.plant_name) === bestName)
  const defaultSpacing = best.plant.spacing_mm ?? options.find((option) => option.spacing_mm)?.spacing_mm ?? null
  const matchConfidence = confidenceFromScore(best.score)
  const warnings: PlantCalculatorWarning[] = []

  if (matchConfidence === "medium") {
    warnings.push({
      code: "unresolved_plant",
      message: `Plant Library match needs review (${best.reason}). Spoken name: "${plantName}".`,
      field: "plant_name",
      severity: "warning",
    })
  }

  return {
    plant_name: best.plant.plant_name,
    match_confidence: matchConfidence,
    confidence_score: Number(best.score.toFixed(2)),
    match_reason: best.reason,
    default_spacing_mm: defaultSpacing,
    options: options.map(({ search_terms: _searchTerms, ...option }) => option),
    warnings,
  }
}

export async function matchPlantFromLibrary(userId: string, plantName: string): Promise<PlantLibraryMatch> {
  if (!userId || !plantName.trim()) return unresolvedPlantMatch(plantName || "Unknown plant")

  const { supabase } = await import("../supabase")
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("id, source_system, item_type, item_code, item_name, description, aliases, category, source_category, sell_price, account_code, sales_account_code, tax_code, tax_type, gst_rate, raw_import")
    .eq("user_id", userId)
    .eq("item_type", "plant")

  if (error) {
    return {
      ...unresolvedPlantMatch(plantName),
      match_reason: `Could not read Plant Library: ${error.message}`,
    }
  }

  return matchPlantRowsFromLibrary((data ?? []) as KnowledgePlantRow[], plantName)
}
