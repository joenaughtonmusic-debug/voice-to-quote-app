export const EXPORT_MAPPING_PROVIDERS = ["xero", "jms"] as const
export type ExportMappingProvider = (typeof EXPORT_MAPPING_PROVIDERS)[number]

export const EXPORT_MAPPING_CATEGORIES = [
  "labour",
  "plants",
  "materials",
  "waste",
  "optional_works",
  "equipment",
  "generic",
] as const
export type ExportMappingCategory = (typeof EXPORT_MAPPING_CATEGORIES)[number]

export const ITEM_CODE_POLICIES = ["confirmed_inventory_only", "allow_imported", "never_export"] as const
export type ItemCodePolicy = (typeof ITEM_CODE_POLICIES)[number]

export type ExportCategoryMapping = {
  id?: string
  user_id?: string | null
  provider?: ExportMappingProvider | string | null
  category: ExportMappingCategory | string
  account_code?: string | null
  tax_type?: string | null
  export_enabled?: boolean | null
  item_code_policy?: ItemCodePolicy | string | null
  is_user_confirmed?: boolean | null
  source?: string | null
}

export type ExportMappingResolution = {
  category: ExportMappingCategory
  accountCode?: string
  taxType?: string
  exportEnabled: boolean
  itemCodePolicy: ItemCodePolicy
  isUserConfirmed: boolean
  source: string
  warnings: string[]
}

export type ExportMappableLine = {
  category?: string
  xeroAccountCode?: string
  xeroTaxType?: string
  itemCode?: string
  omittedItemCode?: string
}

export function displayExportMappingCategory(category: string) {
  if (category === "optional_works") return "Optional works"
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function normalizeExportMappingCategory(category: string | null | undefined): ExportMappingCategory {
  const normalized = (category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")

  if (normalized === "labour" || normalized === "labor") return "labour"
  if (normalized === "plants" || normalized === "plant") return "plants"
  if (normalized === "materials" || normalized === "material" || normalized === "chemical") return "materials"
  if (normalized === "waste" || normalized === "removal" || normalized === "disposal") return "waste"
  if (normalized === "optional_works" || normalized === "optional" || normalized === "extras") return "optional_works"
  if (normalized === "equipment" || normalized === "hire") return "equipment"

  return "generic"
}

export function normalizeItemCodePolicy(value: string | null | undefined): ItemCodePolicy {
  return ITEM_CODE_POLICIES.includes(value as ItemCodePolicy) ? (value as ItemCodePolicy) : "confirmed_inventory_only"
}

export function compatibilityExportMapping(category: ExportMappingCategory): ExportCategoryMapping {
  const tax_type = "OUTPUT2"

  if (category === "labour") {
    return { provider: "xero", category, account_code: "10010", tax_type, export_enabled: true, item_code_policy: "confirmed_inventory_only", is_user_confirmed: false, source: "compatibility_seed" }
  }

  if (category === "plants") {
    return { provider: "xero", category, account_code: "10115", tax_type, export_enabled: true, item_code_policy: "confirmed_inventory_only", is_user_confirmed: false, source: "compatibility_seed" }
  }

  if (category === "materials" || category === "waste") {
    return { provider: "xero", category, account_code: "10011", tax_type, export_enabled: true, item_code_policy: "confirmed_inventory_only", is_user_confirmed: false, source: "compatibility_seed" }
  }

  return { provider: "xero", category, account_code: "", tax_type, export_enabled: true, item_code_policy: "confirmed_inventory_only", is_user_confirmed: false, source: "compatibility_seed" }
}

export function compatibilityExportMappings() {
  return EXPORT_MAPPING_CATEGORIES.map((category) => compatibilityExportMapping(category))
}

function cleanMappingValue(value: string | null | undefined) {
  const text = value?.trim()
  return text || undefined
}

function findUserMapping(mappings: ExportCategoryMapping[] | undefined, category: ExportMappingCategory) {
  return (mappings ?? []).find((mapping) => normalizeExportMappingCategory(mapping.category) === category)
}

export function resolveExportMapping(line: ExportMappableLine, mappings: ExportCategoryMapping[] | undefined): ExportMappingResolution {
  const category = normalizeExportMappingCategory(line.category)
  const mapping = findUserMapping(mappings, category)
  const compatibility = compatibilityExportMapping(category)
  const isUserConfirmed = mapping?.is_user_confirmed === true
  const exportEnabled = mapping?.export_enabled ?? compatibility.export_enabled ?? true
  const itemCodePolicy = normalizeItemCodePolicy(mapping?.item_code_policy ?? compatibility.item_code_policy)
  const importedAccountCode = cleanMappingValue(line.xeroAccountCode)
  const importedTaxType = cleanMappingValue(line.xeroTaxType)
  const userAccountCode = isUserConfirmed ? cleanMappingValue(mapping?.account_code) : undefined
  const userTaxType = isUserConfirmed ? cleanMappingValue(mapping?.tax_type) : undefined
  const compatibilityAccountCode = cleanMappingValue(compatibility.account_code)
  const compatibilityTaxType = cleanMappingValue(compatibility.tax_type)
  const accountCode = importedAccountCode ?? userAccountCode ?? compatibilityAccountCode
  const taxType = importedTaxType ?? userTaxType ?? compatibilityTaxType
  const warnings: string[] = []

  if (!exportEnabled) {
    warnings.push(`Export disabled for ${displayExportMappingCategory(category)} lines by export mapping settings.`)
  }

  if (!importedAccountCode && !userAccountCode) {
    warnings.push(`No export mapping set for ${displayExportMappingCategory(category).toLowerCase()}. Choose a default account before final export.`)
  }

  if (!importedTaxType && !userTaxType) {
    warnings.push(`No tax mapping set for ${displayExportMappingCategory(category).toLowerCase()}. Choose a default tax type before final export.`)
  }

  return {
    category,
    accountCode,
    taxType,
    exportEnabled,
    itemCodePolicy,
    isUserConfirmed,
    source: importedAccountCode || importedTaxType ? "imported_item_metadata" : isUserConfirmed ? "user_mapping" : compatibility.source ?? "compatibility_seed",
    warnings,
  }
}

