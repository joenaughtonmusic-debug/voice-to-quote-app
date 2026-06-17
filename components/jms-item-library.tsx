"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle, FileSpreadsheet, Loader2, Pencil, Save, Trash2, Upload, X } from "lucide-react"
import * as XLSX from "xlsx"
import { useAuth } from "@/hooks/use-auth"
import { classifyPlantCatalogItem } from "@/lib/plant-item-classification"
import { supabase } from "@/lib/supabase"

const SOURCE_SYSTEMS = ["Tradify", "Jobber", "ServiceM8", "Xero", "Fergus", "SimPRO", "Other CSV", "Supplier Price List"] as const
const ITEM_TYPES = ["labour", "material", "plant", "waste", "equipment", "service", "chemical", "vehicle", "other"] as const

type SourceSystem = (typeof SOURCE_SYSTEMS)[number]
type KnowledgeField =
  | "item_type"
  | "item_code"
  | "item_name"
  | "description"
  | "unit"
  | "cost_price"
  | "sell_price"
  | "account_code"
  | "sales_account_code"
  | "tax_code"
  | "tax_type"
  | "gst_rate"
  | "category"
  | "source_category"
  | "supplier"
  | "archived"
  | "external_item_id"

type ParsedRow = Record<string, unknown>
type ColumnMapping = Partial<Record<KnowledgeField, string>>
type MappingConfidence = "high" | "medium" | "low"
type MappingConfidences = Partial<Record<KnowledgeField, MappingConfidence>>
type DetectionResult = {
  mapping: ColumnMapping
  confidences: MappingConfidences
}
type PriceDiagnostics = {
  cost_price_column: string
  sell_price_column: string
  cost_price_reasoning: string
  sell_price_reasoning: string
}

type ImportItem = {
  source_system: SourceSystem
  item_type: string
  item_code: string
  item_name: string
  description: string
  unit: string
  cost_price: number | null
  sell_price: number | null
  account_code: string
  sales_account_code: string
  tax_code: string
  tax_type: string
  gst_rate: number | null
  aliases: string[]
  category: string
  source_category: string
  external_item_id: string
  raw_import: ParsedRow
  supplier: string
  archived: boolean
  item_type_uncertain: boolean
}

type KnowledgeItem = ImportItem & {
  id: string
  user_id?: string
  import_batch_id?: string | null
}

const FIELD_ALIASES: Record<KnowledgeField, string[]> = {
  item_type: ["item type", "type", "product type", "service type"],
  item_code: ["item code", "code", "sku", "product code"],
  item_name: ["item name", "name", "product", "service", "product name", "description name"],
  description: ["description", "item description", "product description", "details"],
  unit: ["unit", "unit of measure", "uom", "measure"],
  cost_price: ["buy price", "cost price", "cost", "purchase price", "unit cost", "buy rate"],
  sell_price: ["sell price", "sales price", "sale price", "unit price", "charge out rate", "charge rate", "standard price", "standard markup", "rate", "customer price"],
  account_code: ["account code", "sales account", "sales account code", "revenue account", "income account"],
  sales_account_code: ["sales account", "sales account code", "sales account number", "sales code"],
  tax_code: ["tax code", "sales tax code", "sales tax rate", "gst code"],
  tax_type: ["tax type", "sales tax type", "sales tax rate", "xero tax type"],
  gst_rate: ["gst rate", "gst", "tax rate", "tax", "salestaxrate", "sales tax rate"],
  category: ["category", "item category", "group"],
  source_category: ["source category", "supplier category", "account", "sales account"],
  supplier: ["supplier", "supplier name", "vendor", "vendor name"],
  archived: ["archived", "is archived", "active", "is active", "status"],
  external_item_id: ["external item id", "item id", "product id", "id", "uuid"],
}

const SOURCE_PROFILES: Record<SourceSystem, Partial<Record<KnowledgeField, string[]>>> = {
  Tradify: {
    item_code: ["Item Code", "Code"],
    item_name: ["Item Name", "Name"],
    description: ["Description"],
    unit: ["Unit", "Unit of Measure"],
    cost_price: ["Buy Price"],
    sell_price: ["Sell Price", "Standard Markup"],
    account_code: ["Sales Account Code", "Account Code"],
    sales_account_code: ["Sales Account", "Sales Account Code"],
    tax_code: ["Sales Tax Rate", "Sales Tax Code", "Tax Code"],
    tax_type: ["Sales Tax Rate", "Sales Tax Type", "Tax Type"],
    gst_rate: ["Sales Tax Rate"],
    category: ["Category"],
    source_category: ["Supplier"],
    supplier: ["Supplier"],
    archived: ["Archived"],
    external_item_id: ["Item ID", "ID"],
  },
  Jobber: {
    item_code: ["Product/Service Code", "Item Code", "SKU"],
    item_name: ["Product/Service Name", "Name"],
    description: ["Description"],
    unit: ["Unit"],
    cost_price: ["Unit Cost", "Cost"],
    sell_price: ["Unit Price", "Price"],
    account_code: ["Sales Account Code", "Account Code"],
    sales_account_code: ["Sales Account", "Sales Account Code"],
    tax_code: ["Tax Code"],
    tax_type: ["Tax Type"],
    gst_rate: ["Tax Rate"],
    category: ["Category"],
    supplier: ["Supplier"],
    archived: ["Active", "Archived"],
    external_item_id: ["Product/Service ID", "ID"],
  },
  ServiceM8: {
    item_code: ["Item Number", "Item Code", "Code"],
    item_name: ["Item Name", "Name"],
    description: ["Description"],
    unit: ["Unit"],
    cost_price: ["Cost", "Buy Price"],
    sell_price: ["Price", "Sell Price"],
    account_code: ["Sales Account Code", "Account Code"],
    sales_account_code: ["Sales Account", "Sales Account Code"],
    tax_code: ["Tax Code"],
    tax_type: ["Tax Type"],
    gst_rate: ["Tax Rate", "GST Rate"],
    category: ["Category"],
    supplier: ["Supplier"],
    archived: ["Archived", "Active"],
    external_item_id: ["Item ID", "ID"],
  },
  Xero: {
    item_code: ["Item Code", "Code"],
    item_name: ["Item Name", "Name"],
    description: ["Sales Description", "Description"],
    unit: ["Unit"],
    cost_price: ["Purchase Unit Price", "Purchase Price", "Cost Price"],
    sell_price: ["Sales Unit Price", "Unit Price", "Sales Price"],
    account_code: ["Sales Account Code", "Account Code"],
    sales_account_code: ["Sales Account", "Sales Account Code"],
    tax_code: ["Sales Tax Rate", "Sales Tax Code", "Tax Code"],
    tax_type: ["Sales Tax Rate", "Sales Tax Type", "Tax Type"],
    gst_rate: ["Sales Tax Rate", "Tax Rate"],
    category: ["Sales Account", "Category"],
    supplier: ["Supplier"],
    archived: ["Is Active", "Archived"],
    external_item_id: ["Item ID", "ID"],
  },
  Fergus: {
    item_code: ["Code", "Item Code", "SKU"],
    item_name: ["Name", "Item Name"],
    description: ["Description"],
    unit: ["Unit", "UOM"],
    cost_price: ["Cost Price", "Cost"],
    sell_price: ["Sell Price", "Charge Rate"],
    account_code: ["Sales Account Code", "Account Code"],
    sales_account_code: ["Sales Account", "Sales Account Code"],
    tax_code: ["Tax Code"],
    tax_type: ["Tax Type"],
    gst_rate: ["GST Rate", "Tax Rate"],
    category: ["Category"],
    supplier: ["Supplier"],
    archived: ["Archived", "Active"],
    external_item_id: ["ID", "Item ID"],
  },
  SimPRO: {
    item_code: ["Part No", "Item Code", "Code"],
    item_name: ["Part Name", "Item Name", "Name"],
    description: ["Description"],
    unit: ["UOM", "Unit"],
    cost_price: ["Trade Price", "Cost Price", "Cost"],
    sell_price: ["Sell Price", "Customer Price"],
    account_code: ["Sales Account Code", "Account Code"],
    sales_account_code: ["Sales Account", "Sales Account Code"],
    tax_code: ["Tax Code"],
    tax_type: ["Tax Type"],
    gst_rate: ["Tax Rate", "GST Rate"],
    category: ["Catalogue", "Category"],
    supplier: ["Supplier"],
    archived: ["Archived", "Active"],
    external_item_id: ["Part ID", "ID"],
  },
  "Other CSV": {},
  "Supplier Price List": {
    item_name: ["Item", "Item Name", "Description", "Product", "Material", "Name"],
    unit: ["Unit", "UOM", "Unit of Measure"],
    cost_price: ["Buy Price", "Cost", "Cost Price", "Trade Price", "Net Price", "Buy"],
    sell_price: ["Price", "Sell Price", "Retail Price", "RRP", "Rate", "Unit Price"],
    source_category: ["Category", "Supplier", "Supplier Category", "Group"],
    supplier: ["Supplier", "Vendor"],
  },
}

const EDITABLE_MAPPING_FIELDS: KnowledgeField[] = [
  "item_code",
  "item_name",
  "unit",
  "cost_price",
  "sell_price",
  "category",
  "account_code",
  "sales_account_code",
  "tax_code",
  "tax_type",
  "gst_rate",
]

function normalizeHeader(value: string) {
  return value
    .replace(/^\*+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[()[\]{}*]/g, " ")
    .replace(/[+%$€£¥]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isStandardMarkupHeader(value: string) {
  return /^standard\s+mark\s*up(?:\s+price)?$/i.test(normalizeHeader(value))
}

function findHeader(headers: string[], matcher: (header: string) => boolean) {
  return headers.find(matcher)
}

function forceTradifyMapping(
  sourceSystem: SourceSystem,
  headers: string[],
  mapping: ColumnMapping,
  confidences: MappingConfidences,
): DetectionResult {
  if (sourceSystem !== "Tradify") return { mapping, confidences }

  const buyPriceHeader = findHeader(headers, (header) => normalizeHeader(header) === "buy price")
  const standardMarkupHeader = findHeader(headers, isStandardMarkupHeader)
  const nextMapping = { ...mapping }
  const nextConfidences = { ...confidences }

  if (buyPriceHeader) {
    nextMapping.cost_price = buyPriceHeader
    nextConfidences.cost_price = "high"
  }
  if (standardMarkupHeader) {
    nextMapping.sell_price = standardMarkupHeader
    nextConfidences.sell_price = "high"
  }

  return { mapping: nextMapping, confidences: nextConfidences }
}

function detectColumnMapping(headers: string[], rows: ParsedRow[], sourceSystem: SourceSystem): DetectionResult {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }))
  const mapping: ColumnMapping = {}
  const confidences: MappingConfidences = {}
  const profile = SOURCE_PROFILES[sourceSystem]

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [KnowledgeField, string[]][]) {
    const profileAliases = profile[field] ?? []
    const profileMatch = profileAliases
      .map((alias) => normalizedHeaders.find(({ normalized }) => normalized === normalizeHeader(alias)))
      .find(Boolean)

    if (profileMatch) {
      if (
        field !== "sell_price" ||
        !isStandardMarkupHeader(profileMatch.header) ||
        sourceSystem === "Tradify" ||
        standardMarkupLooksLikeRate(profileMatch.header, rows)
      ) {
        mapping[field] = profileMatch.header
        confidences[field] = field === "sell_price" && isStandardMarkupHeader(profileMatch.header) ? "medium" : "high"
        continue
      }
    }

    if (field === "cost_price" || field === "sell_price") {
      const forbidden =
        field === "sell_price"
          ? /\b(buy|cost|purchase|tax|gst)\b/
          : /\b(sell|sale|sales|charge|standard)\b/
      const priceMatch = normalizedHeaders
        .filter(({ normalized }) => !forbidden.test(normalized))
        .filter(({ header, normalized }) => {
          if (field !== "sell_price" || !isStandardMarkupHeader(header)) return true
          const numericValues = rows.map((row) => toNumber(row[header])).filter((value): value is number => value != null)
          if (numericValues.length === 0) return false
          return numericValues.filter((value) => value > 1).length / numericValues.length >= 0.6
        })
        .map((entry) => ({
          ...entry,
          score: Math.max(
            ...aliases.map((alias, index) =>
              entry.normalized === alias ? 1000 - index : entry.normalized.includes(alias) ? 500 - index : 0,
            ),
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)[0]
      if (priceMatch) mapping[field] = priceMatch.header
      if (priceMatch) confidences[field] = priceMatch.score >= 1000 ? "high" : "medium"
      continue
    }

    const exact = normalizedHeaders.find(({ normalized }) => aliases.includes(normalized))
    const partial =
      normalizedHeaders.find(({ normalized }) => {
        if (field === "item_name" && /\b(code|sku|id)\b/.test(normalized)) return false
        if (field === "description" && /\b(code|sku|id)\b/.test(normalized)) return false
        return aliases.some((alias) => normalized.length >= 4 && (normalized.includes(alias) || alias.includes(normalized)))
      })
    const match = exact ?? partial
    if (match) mapping[field] = match.header
    if (match) confidences[field] = exact ? "high" : "low"
  }

  return forceTradifyMapping(sourceSystem, headers, mapping, confidences)
}

function standardMarkupLooksLikeRate(header: string, rows: ParsedRow[]) {
  const numericValues = rows.map((row) => toNumber(row[header])).filter((value): value is number => value != null)
  if (numericValues.length === 0) return false
  return numericValues.filter((value) => value > 1).length / numericValues.length >= 0.6
}

function getPriceDiagnostics(mapping: ColumnMapping, rows: ParsedRow[]): PriceDiagnostics {
  const sellHeader = mapping.sell_price ?? ""
  const standardMarkupValues =
    isStandardMarkupHeader(sellHeader)
      ? rows.map((row) => toNumber(row[sellHeader])).filter((value): value is number => value != null)
      : []
  const greaterThanOne = standardMarkupValues.filter((value) => value > 1).length

  return {
    cost_price_column: mapping.cost_price ?? "Not detected",
    sell_price_column: sellHeader || "Not detected",
    cost_price_reasoning: mapping.cost_price
      ? `${mapping.cost_price} matched a buy/cost price header.`
      : "No reliable buy/cost price column was detected.",
    sell_price_reasoning:
      isStandardMarkupHeader(sellHeader)
        ? `${sellHeader} contains customer-rate values greater than 1 (${greaterThanOne} of ${standardMarkupValues.length} numeric rows), so it is treated as sell_price rather than a percentage.`
        : sellHeader
          ? `${sellHeader} matched a recognised sell/customer rate header.`
          : "No reliable sell/customer price column was detected.",
  }
}

function mappingStorageKey(userId: string, sourceSystem: SourceSystem) {
  return `jms-item-mapping:${userId}:${sourceSystem}`
}

function loadSavedMapping(userId: string, sourceSystem: SourceSystem, headers: string[]) {
  try {
    const saved = JSON.parse(localStorage.getItem(mappingStorageKey(userId, sourceSystem)) ?? "{}") as ColumnMapping
    return Object.fromEntries(Object.entries(saved).filter(([, header]) => typeof header === "string" && headers.includes(header))) as ColumnMapping
  } catch {
    return {}
  }
}

function saveMapping(userId: string, sourceSystem: SourceSystem, mapping: ColumnMapping) {
  localStorage.setItem(mappingStorageKey(userId, sourceSystem), JSON.stringify(mapping))
}

function valueFrom(row: ParsedRow, mapping: ColumnMapping, field: KnowledgeField) {
  const header = mapping[field]
  return header ? row[header] : undefined
}

function toText(value: unknown) {
  if (value == null) return ""
  return String(value).trim()
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const text = toText(value)
  if (!text) return null
  const parsed = Number(text.replace(/[$,%\s,]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function taxMetadataFromMappedRow(row: ParsedRow, mapping: ColumnMapping) {
  const taxType = toText(valueFrom(row, mapping, "tax_type"))
  const taxCode = toText(valueFrom(row, mapping, "tax_code"))
  const gstRateText = toText(valueFrom(row, mapping, "gst_rate"))
  const fallbackTax = gstRateText && !/^\d+(?:\.\d+)?%?$/.test(gstRateText.replace(/\s+/g, "")) ? gstRateText : ""

  return {
    tax_code: taxCode || fallbackTax,
    tax_type: taxType || fallbackTax,
    gst_rate: toNumber(gstRateText),
  }
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function generateAliases(itemName: string, itemCode: string) {
  const aliases = [itemCode, itemName]
  const withoutPrefix = itemName.replace(/^[A-Z]\s*-\s*/i, "").trim()
  if (withoutPrefix !== itemName) aliases.push(withoutPrefix)

  const spacedCode = itemCode.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim()
  if (spacedCode && spacedCode !== itemCode) aliases.push(spacedCode)

  const size = itemName.match(/\b(\d{2,4})\s*[xX×]\s*(\d{1,4})\b/)
  if (size) {
    aliases.push(`${size[1]}x${size[2]}`, `${size[1]} by ${size[2]}`)
  }

  const lowerName = itemName.toLowerCase()
  const retaining = lowerName.includes("retaining")
  const hClass = itemName.match(/\bH\d\b/i)?.[0]
  if (retaining && hClass) aliases.push(`${hClass.toUpperCase()} retaining`)
  if (retaining && lowerName.includes("rough sawn")) aliases.push("rough sawn retaining")
  if (/\blabour\s*(hrs?|hours?)?\b/i.test(`${itemCode} ${itemName}`)) aliases.push("labour hours", "labour", "hourly labour")
  if (/\bgreen\s*waste\b|\bgreenwaste\b/i.test(`${itemCode} ${itemName}`)) aliases.push("greenwaste", "green waste", "waste removal")
  if (/\bchipper\b/i.test(`${itemCode} ${itemName}`)) aliases.push("wood chipper", "chipper hire")
  if (/\bstump grinder\b/i.test(`${itemCode} ${itemName}`)) aliases.push("stump grinder", "stump grinder hire")
  if (/\b(vehicle|travel|mileage)\b/i.test(`${itemCode} ${itemName}`)) aliases.push("vehicle fee", "travel charge")

  return unique(aliases)
}

function toBoolean(value: unknown, header = "") {
  const text = toText(value).toLowerCase()
  if (!text) return false
  if (normalizeHeader(header).includes("active")) return ["false", "no", "0", "inactive", "archived"].includes(text)
  return ["true", "yes", "1", "archived", "inactive"].includes(text)
}

function classifyItem(values: {
  explicitType: string
  itemCode: string
  itemName: string
  description: string
  category: string
  supplier: string
}) {
  const explicit = values.explicitType.toLowerCase()
  const validTypes = ["labour", "material", "plant", "waste", "equipment", "service", "chemical", "vehicle", "other"]
  const plantClassification = classifyPlantCatalogItem({
    explicitType: values.explicitType,
    itemCode: values.itemCode,
    itemName: values.itemName,
    description: values.description,
    category: values.category,
    supplier: values.supplier,
  })

  if (explicit === "plant" && !plantClassification.is_true_plant) {
    return { itemType: plantClassification.item_type, uncertain: false }
  }

  if (validTypes.includes(explicit)) return { itemType: explicit, uncertain: false }

  const text = `${values.itemCode} ${values.itemName} ${values.description} ${values.category} ${values.supplier}`.toLowerCase()
  const rules: [string, RegExp][] = [
    ["labour", /\b(labour|labor|labourhrs|gardenlabour|man hours?|crew hours?|hourly labour)\b/],
    ["waste", /\b(green\s?waste|general waste|hardfill|tip fee|waste removal|disposal)\b/],
    ["equipment", /\b(chipper|stump grinder|ladder hire|equipment hire|tool hire|digger|excavator|compactor|hireage)\b/],
    ["chemical", /\b(plant\s+soap|soap|wetting\s+agents?|weedkiller|herbicide|mavrik|copper|hydrocotyl|fertiliser|fertilizer|spray|pesticide|fungicide|surfactant|chemical|treatment)\b/],
    ["vehicle", /\b(vehicle|travel fee|mileage|truck fee|delivery vehicle)\b/],
    ["material", /\b(materials?|timber|aggregate|gravel|mulch|soil|compost|concrete|fasteners?|pavers?|retaining|rough sawn)\b/],
    ["plant", /\b(plants?|trees?|shrubs?|seedlings?|pot size|pb\d+|hedging plants?)\b/],
    ["service", /\b(service|maintenance|tidy|trimming|weeding|mowing|pruning|installation)\b/],
  ]

  const match = rules.find(([, pattern]) => pattern.test(text))
  return match ? { itemType: match[0], uncertain: false } : { itemType: "other", uncertain: true }
}

function mapImportRow(row: ParsedRow, mapping: ColumnMapping, sourceSystem: SourceSystem): ImportItem {
  const itemCode = toText(valueFrom(row, mapping, "item_code"))
  const description = toText(valueFrom(row, mapping, "description"))
  const itemName = toText(valueFrom(row, mapping, "item_name")) || description
  const sourceCategory = toText(valueFrom(row, mapping, "source_category"))
  const category = toText(valueFrom(row, mapping, "category")) || sourceCategory
  const supplier = toText(valueFrom(row, mapping, "supplier"))
  const classification = classifyItem({
    explicitType: toText(valueFrom(row, mapping, "item_type")),
    itemCode,
    itemName,
    description,
    category,
    supplier,
  })
  const archivedHeader = mapping.archived ?? ""
  const taxMetadata = taxMetadataFromMappedRow(row, mapping)

  return {
    source_system: sourceSystem,
    item_type: classification.itemType,
    item_code: itemCode,
    item_name: itemName,
    description,
    unit: toText(valueFrom(row, mapping, "unit")),
    cost_price: toNumber(valueFrom(row, mapping, "cost_price")),
    sell_price: toNumber(valueFrom(row, mapping, "sell_price")),
    account_code: toText(valueFrom(row, mapping, "account_code")),
    sales_account_code: toText(valueFrom(row, mapping, "sales_account_code")),
    tax_code: taxMetadata.tax_code,
    tax_type: taxMetadata.tax_type,
    gst_rate: taxMetadata.gst_rate,
    aliases: generateAliases(itemName, itemCode),
    category: category || classification.itemType,
    source_category: sourceCategory,
    external_item_id: toText(valueFrom(row, mapping, "external_item_id")),
    raw_import: row,
    supplier,
    archived: toBoolean(valueFrom(row, mapping, "archived"), archivedHeader),
    item_type_uncertain: classification.uncertain,
  }
}

function formatPrice(value: number | null | undefined, missingLabel: string) {
  return value == null ? missingLabel : new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value)
}

export function JmsItemLibrary({ onCountChange, fixedSourceSystem }: { onCountChange?: () => void; fixedSourceSystem?: SourceSystem }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { user } = useAuth()
  const [sourceSystem, setSourceSystem] = useState<SourceSystem>(fixedSourceSystem ?? "Tradify")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [mappingConfidences, setMappingConfidences] = useState<MappingConfidences>({})
  const [priceDiagnostics, setPriceDiagnostics] = useState<PriceDiagnostics>({
    cost_price_column: "Not detected",
    sell_price_column: "Not detected",
    cost_price_reasoning: "No file analysed yet.",
    sell_price_reasoning: "No file analysed yet.",
  })
  const [previewItems, setPreviewItems] = useState<ImportItem[]>([])
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [clearSourceSystem, setClearSourceSystem] = useState<SourceSystem>(fixedSourceSystem ?? "Tradify")
  const [clearBatchId, setClearBatchId] = useState("all")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadItems = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from("knowledge_items")
      .select(
        "id, user_id, source_system, item_type, item_code, item_name, description, unit, cost_price, sell_price, account_code, sales_account_code, tax_code, tax_type, gst_rate, aliases, category, source_category, external_item_id, raw_import, import_batch_id",
      )
      .eq("user_id", user.id)
      .order("item_name", { ascending: true })
    setLoading(false)

    if (error) {
      setError(`Could not load item library: ${error.message}`)
      return
    }

    setItems((data ?? []) as KnowledgeItem[])
  }, [user])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError("")
    setMessage("")

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!firstSheet) throw new Error("No worksheet was found in this file.")

      const parsedRows = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: "" })
      if (parsedRows.length === 0) throw new Error("No item rows were detected.")

      const parsedHeaders = unique(parsedRows.flatMap((row) => Object.keys(row)))
      const detected = detectColumnMapping(parsedHeaders, parsedRows, sourceSystem)
      const savedMapping = user ? loadSavedMapping(user.id, sourceSystem, parsedHeaders) : {}
      const combinedMapping = { ...detected.mapping, ...savedMapping }
      const combinedConfidences = { ...detected.confidences }
      for (const field of Object.keys(savedMapping) as KnowledgeField[]) combinedConfidences[field] = "high"
      const forced = forceTradifyMapping(sourceSystem, parsedHeaders, combinedMapping, combinedConfidences)
      const detectedMapping = forced.mapping
      const detectedConfidences = forced.confidences
      setRows(parsedRows)
      setHeaders(parsedHeaders)
      setMapping(detectedMapping)
      setMappingConfidences(detectedConfidences)
      setPriceDiagnostics(getPriceDiagnostics(detectedMapping, parsedRows))
      setPreviewItems(parsedRows.map((row) => mapImportRow(row, detectedMapping, sourceSystem)))
    } catch (parseError) {
      setRows([])
      setHeaders([])
      setMapping({})
      setMappingConfidences({})
      setPriceDiagnostics({
        cost_price_column: "Not detected",
        sell_price_column: "Not detected",
        cost_price_reasoning: "File parsing failed.",
        sell_price_reasoning: "File parsing failed.",
      })
      setPreviewItems([])
      setError(parseError instanceof Error ? parseError.message : "Could not parse this file.")
    }
  }

  async function importItems() {
    if (!user || previewItems.length === 0) return
    setImporting(true)
    setError("")
    setMessage("")

    const importBatchId = crypto.randomUUID()
    const updatedAt = new Date().toISOString()
    const validItems = previewItems.filter((item) => item.item_name)

    for (let index = 0; index < validItems.length; index += 200) {
      const batch = validItems.slice(index, index + 200).map((item) => ({
        user_id: user.id,
        source_system: item.source_system,
        item_type: item.item_type,
        item_code: item.item_code,
        item_name: item.item_name,
        description: item.description,
        unit: item.unit,
        cost_price: item.cost_price,
        sell_price: item.sell_price,
        account_code: item.account_code,
        sales_account_code: item.sales_account_code,
        tax_code: item.tax_code,
        tax_type: item.tax_type,
        gst_rate: item.gst_rate,
        aliases: item.aliases,
        category: item.category,
        source_category: item.source_category,
        external_item_id: item.external_item_id,
        raw_import: item.raw_import,
        import_batch_id: importBatchId,
        updated_from_import_at: updatedAt,
      }))
      const { error } = await supabase.from("knowledge_items").insert(batch)
      if (error) {
        setImporting(false)
        setError(`Could not import items: ${error.message}`)
        return
      }
    }

    setImporting(false)
    setRows([])
    setHeaders([])
    setMapping({})
    setMappingConfidences({})
    setPriceDiagnostics({
      cost_price_column: "Not detected",
      sell_price_column: "Not detected",
      cost_price_reasoning: "No file analysed yet.",
      sell_price_reasoning: "No file analysed yet.",
    })
    setPreviewItems([])
    if (inputRef.current) inputRef.current.value = ""
    setMessage(`${validItems.length} items imported successfully.`)
    await loadItems()
    onCountChange?.()
  }

  function startEdit(item: KnowledgeItem) {
    setEditingId(item.id)
    setEditItem({ ...item, aliases: [...(item.aliases ?? [])] })
    setMessage("")
    setError("")
  }

  async function saveItem() {
    if (!user || !editItem) return
    setSavingId(editItem.id)
    setError("")
    setMessage("")

    const { error } = await supabase
      .from("knowledge_items")
      .update({
        source_system: editItem.source_system,
        item_type: editItem.item_type,
        item_code: editItem.item_code,
        item_name: editItem.item_name,
        unit: editItem.unit,
        sell_price: editItem.sell_price,
        account_code: editItem.account_code,
        sales_account_code: editItem.sales_account_code,
        tax_code: editItem.tax_code,
        tax_type: editItem.tax_type,
        gst_rate: editItem.gst_rate,
        aliases: editItem.aliases,
        category: editItem.category,
      })
      .eq("id", editItem.id)
      .eq("user_id", user.id)

    setSavingId(null)
    if (error) {
      setError(`Could not save item: ${error.message}`)
      return
    }

    setEditingId(null)
    setEditItem(null)
    setMessage("Item saved.")
    await loadItems()
  }

  async function clearImportedItems() {
    if (!user) return
    const scope = clearBatchId === "all" ? `${clearSourceSystem} imports` : "the selected import batch"
    if (!window.confirm(`Clear ${scope}?`)) return

    setClearing(true)
    setError("")
    setMessage("")

    let query = supabase
      .from("knowledge_items")
      .delete()
      .eq("user_id", user.id)
      .eq("source_system", clearSourceSystem)

    if (clearBatchId !== "all") query = query.eq("import_batch_id", clearBatchId)

    const { error } = await query
    setClearing(false)

    if (error) {
      setError(`Could not clear imported items: ${error.message}`)
      return
    }

    setMessage("Imported items cleared.")
    setClearBatchId("all")
    await loadItems()
    onCountChange?.()
  }

  function applyMapping(nextMapping: ColumnMapping, nextConfidences = mappingConfidences) {
    setMapping(nextMapping)
    setMappingConfidences(nextConfidences)
    setPriceDiagnostics(getPriceDiagnostics(nextMapping, rows))
    setPreviewItems(rows.map((row) => mapImportRow(row, nextMapping, sourceSystem)))
    if (user) saveMapping(user.id, sourceSystem, nextMapping)
  }

  const warnings = [
    !mapping.sell_price ? "No reliable sell price column detected. Items will import without sell prices." : "",
    sourceSystem === "Tradify" && headers.some(isStandardMarkupHeader) && !isStandardMarkupHeader(mapping.sell_price ?? "")
      ? "A Standard Markup column exists but was not mapped to sell_price."
      : "",
    isStandardMarkupHeader(mapping.sell_price ?? "")
      ? "Standard Markup may represent either a markup percentage or a final sell price. It is currently mapped to sell_price based on the uploaded values; confirm the mapping before import."
      : "",
    previewItems.filter((item) => !item.item_name).length
      ? `${previewItems.filter((item) => !item.item_name).length} rows are missing item names and will not import.`
      : "",
    previewItems.filter((item) => !item.item_code).length
      ? `${previewItems.filter((item) => !item.item_code).length} rows are missing item codes.`
      : "",
    previewItems.filter((item) => item.sell_price == null).length
      ? `${previewItems.filter((item) => item.sell_price == null).length} rows are missing sell prices.`
      : "",
    previewItems.filter((item) => item.sell_price != null && item.cost_price != null && item.sell_price === item.cost_price).length
      ? `${previewItems.filter((item) => item.sell_price != null && item.cost_price != null && item.sell_price === item.cost_price).length} rows have a sell price that appears to be the cost price.`
      : "",
    previewItems.filter(
      (item) =>
        (item.item_type === "labour" || item.item_type === "equipment") &&
        item.sell_price != null &&
        (item.sell_price < 20 || (item.cost_price != null && item.sell_price <= item.cost_price)),
    ).length
      ? `${previewItems.filter(
          (item) =>
            (item.item_type === "labour" || item.item_type === "equipment") &&
            item.sell_price != null &&
            (item.sell_price < 20 || (item.cost_price != null && item.sell_price <= item.cost_price)),
        ).length} labour/equipment rows have sell prices that appear unusually low.`
      : "",
    previewItems.filter((item) => item.item_type_uncertain).length
      ? `${previewItems.filter((item) => item.item_type_uncertain).length} rows have an uncertain item type.`
      : "",
    previewItems.filter((item) => item.archived).length
      ? `${previewItems.filter((item) => item.archived).length} archived items detected.`
      : "",
  ].filter(Boolean)
  const displayedItems = fixedSourceSystem
    ? items.filter((item) => item.source_system === fixedSourceSystem)
    : items.filter((item) => item.source_system !== "Supplier Price List")

  const availableBatches = unique(
    displayedItems
      .filter((item) => item.source_system === clearSourceSystem)
      .map((item) => item.import_batch_id ?? "")
      .filter(Boolean),
  )

  return (
    <div className="grid gap-5 pb-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">
              {fixedSourceSystem === "Supplier Price List" ? "Supplier Price List Import" : "JMS Item Library Import"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {fixedSourceSystem === "Supplier Price List"
                ? "Import material prices from a supplier CSV or XLSX. Items are used for estimating only — not exported as individual Xero items."
                : "Import products, materials, services, and pricing from CSV or XLSX."}
            </p>
          </div>
        </div>

        {!fixedSourceSystem && (
          <label className="mt-4 grid gap-1 text-sm font-medium text-foreground">
            Source system
            <select
              value={sourceSystem}
              onChange={(event) => {
                const nextSource = event.target.value as SourceSystem
                setSourceSystem(nextSource)
                setClearSourceSystem(nextSource)
                if (rows.length > 0) {
                  const detected = detectColumnMapping(headers, rows, nextSource)
                  const savedMapping = user ? loadSavedMapping(user.id, nextSource, headers) : {}
                  const combinedMapping = { ...detected.mapping, ...savedMapping }
                  const combinedConfidences = { ...detected.confidences }
                  for (const field of Object.keys(savedMapping) as KnowledgeField[]) combinedConfidences[field] = "high"
                  const forced = forceTradifyMapping(nextSource, headers, combinedMapping, combinedConfidences)
                  const nextMapping = forced.mapping
                  const nextConfidences = forced.confidences
                  setMapping(nextMapping)
                  setMappingConfidences(nextConfidences)
                  setPriceDiagnostics(getPriceDiagnostics(nextMapping, rows))
                  setPreviewItems(rows.map((row) => mapImportRow(row, nextMapping, nextSource)))
                }
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {SOURCE_SYSTEMS.map((source) => <option key={source}>{source}</option>)}
            </select>
          </label>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
        >
          <Upload className="h-4 w-4" />
          Choose CSV or XLSX
        </button>
      </section>

      {(message || error) && (
        <p className={`rounded-xl border px-3 py-2 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"}`}>
          {error || message}
        </p>
      )}

      {rows.length > 0 && (
        <ImportPreview
          items={previewItems}
          mapping={mapping}
          mappingConfidences={mappingConfidences}
          headers={headers}
          rawRows={rows}
          sourceSystem={sourceSystem}
          priceDiagnostics={priceDiagnostics}
          warnings={warnings}
          importing={importing}
          onMappingChange={(field, header) => {
            const nextMapping = { ...mapping }
            if (header) nextMapping[field] = header
            else delete nextMapping[field]
            applyMapping(nextMapping, { ...mappingConfidences, [field]: header ? "high" : "low" })
          }}
          onImport={() => void importItems()}
        />
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {fixedSourceSystem === "Supplier Price List" ? "Supplier Price List" : "Materials Library"}
            </h2>
            <p className="text-xs text-muted-foreground">{displayedItems.length} imported items</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-3">
          {displayedItems.map((item) =>
            editingId === item.id && editItem ? (
              <ItemEditor
                key={item.id}
                item={editItem}
                fixedSourceSystem={fixedSourceSystem}
                saving={savingId === item.id}
                onChange={setEditItem}
                onCancel={() => {
                  setEditingId(null)
                  setEditItem(null)
                }}
                onSave={() => void saveItem()}
              />
            ) : (
              <ItemCard key={item.id} item={item} onEdit={() => startEdit(item)} />
            ),
          )}
          {!loading && displayedItems.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No imported items yet.</div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-destructive/20 bg-card p-3">
        <h2 className="text-sm font-semibold text-foreground">Clear Imported Items</h2>
        <p className="mt-1 text-xs text-muted-foreground">Delete an incorrect import by source system or import batch.</p>
        <div className="mt-3 grid gap-2">
          {!fixedSourceSystem && (
            <select
              value={clearSourceSystem}
              onChange={(event) => {
                setClearSourceSystem(event.target.value as SourceSystem)
                setClearBatchId("all")
              }}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              {SOURCE_SYSTEMS.map((source) => <option key={source}>{source}</option>)}
            </select>
          )}
          <select
            value={clearBatchId}
            onChange={(event) => setClearBatchId(event.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
          >
            <option value="all">All imports from {clearSourceSystem}</option>
            {availableBatches.map((batchId) => <option key={batchId} value={batchId}>Batch {batchId.slice(0, 8)}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void clearImportedItems()}
            disabled={clearing || !items.some((item) => item.source_system === clearSourceSystem)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2.5 text-sm font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-60"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear Imported Items
          </button>
        </div>
      </section>
    </div>
  )
}

function ImportPreview({
  items,
  mapping,
  mappingConfidences,
  headers,
  rawRows,
  sourceSystem,
  priceDiagnostics,
  warnings,
  importing,
  onMappingChange,
  onImport,
}: {
  items: ImportItem[]
  mapping: ColumnMapping
  mappingConfidences: MappingConfidences
  headers: string[]
  rawRows: ParsedRow[]
  sourceSystem: SourceSystem
  priceDiagnostics: PriceDiagnostics
  warnings: string[]
  importing: boolean
  onMappingChange: (field: KnowledgeField, header: string) => void
  onImport: () => void
}) {
  const labourHoursItem = items.find((item) => /labour\s*hrs|labourhrs/i.test(`${item.item_code} ${item.item_name}`))

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-foreground">Import preview</h2>
      <p className="mt-1 text-sm text-muted-foreground">{items.length} rows detected</p>

      <div className="mt-4 max-h-[60vh] overflow-y-auto overscroll-contain rounded-xl border border-border bg-background/40 p-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exact detected CSV headers</h3>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/50 p-2 text-xs text-foreground">
            {JSON.stringify(headers, null, 2)}
          </pre>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">First 3 raw parsed rows</h3>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/50 p-2 text-xs text-foreground">
            {JSON.stringify(rawRows.slice(0, 3), null, 2)}
          </pre>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected mapping</h3>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            {(["cost_price", "sell_price", "item_code", "item_name"] as KnowledgeField[]).map((field) => (
              <div key={field} className="rounded-lg bg-secondary/50 px-2 py-2">
                <dt className="font-semibold text-foreground">{field}</dt>
                <dd className="break-words text-muted-foreground">{mapping[field] ?? "Not mapped"}</dd>
              </div>
            ))}
          </dl>
        </div>

        {sourceSystem === "Tradify" && labourHoursItem && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-accent/40 px-3 py-2 text-xs">
            <h3 className="font-semibold text-foreground">LabourHrs expected</h3>
            <p className="mt-1 text-muted-foreground">
              cost_price {labourHoursItem.cost_price ?? "null"} · sell_price {labourHoursItem.sell_price ?? "null"}
            </p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detected column mapping</h3>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {Object.entries(mapping).map(([field, header]) => (
              <div key={field} className="min-w-0 rounded-lg bg-secondary/50 px-2 py-1.5">
                <dt className="flex items-center justify-between gap-2 font-semibold text-foreground">
                  <span>{field.replaceAll("_", " ")}</span>
                  <ConfidenceBadge confidence={mappingConfidences[field as KnowledgeField] ?? "low"} />
                </dt>
                <dd className="break-words text-muted-foreground">{header}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adjust key mappings</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {EDITABLE_MAPPING_FIELDS.map((field) => (
              <label key={field} className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">
                {field.replaceAll("_", " ")}
                <select
                  value={mapping[field] ?? ""}
                  onChange={(event) => onMappingChange(field, event.target.value)}
                  className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm font-normal text-foreground outline-none focus:border-primary"
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price detection diagnostics</h3>
          <dl className="mt-2 grid gap-2 text-xs">
            <div className="rounded-lg bg-secondary/50 px-2 py-2">
              <dt className="font-semibold text-foreground">{priceDiagnostics.cost_price_column} → cost_price</dt>
              <dd className="mt-0.5 break-words leading-relaxed text-muted-foreground">{priceDiagnostics.cost_price_reasoning}</dd>
            </div>
            <div className="rounded-lg bg-secondary/50 px-2 py-2">
              <dt className="font-semibold text-foreground">{priceDiagnostics.sell_price_column} → sell_price</dt>
              <dd className="mt-0.5 break-words leading-relaxed text-muted-foreground">{priceDiagnostics.sell_price_reasoning}</dd>
            </div>
          </dl>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 break-words pl-4 pr-2 text-xs leading-relaxed text-warning-foreground">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}

        <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
          <table className="min-w-[780px] text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr><th className="p-2">Code</th><th className="p-2">Item</th><th className="p-2">Type</th><th className="p-2">Unit</th><th className="p-2">Cost</th><th className="p-2">Sell</th><th className="p-2">Category</th></tr>
            </thead>
            <tbody>
              {items.slice(0, 10).map((item, index) => (
                <tr key={`${item.item_code}-${index}`} className="border-t border-border">
                  <td className="p-2">{item.item_code || "—"}</td>
                  <td className="p-2">{item.item_name || "Missing name"}</td>
                  <td className="p-2">{item.item_type}</td>
                  <td className="p-2">{item.unit || "—"}</td>
                  <td className="p-2">{formatPrice(item.cost_price, "No cost price detected")}</td>
                  <td className="p-2">{formatPrice(item.sell_price, "No sell price detected")}</td>
                  <td className="p-2">{item.category || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        type="button"
        onClick={onImport}
        disabled={importing || !items.some((item) => item.item_name)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        Import Items
      </button>
    </section>
  )
}

function ConfidenceBadge({ confidence }: { confidence: MappingConfidence }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase ${
        confidence === "high"
          ? "bg-success/15 text-success"
          : confidence === "medium"
            ? "bg-warning/30 text-warning-foreground"
            : "bg-destructive/10 text-destructive"
      }`}
    >
      {confidence}
    </span>
  )
}

function ItemCard({ item, onEdit }: { item: KnowledgeItem; onEdit: () => void }) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate font-semibold text-foreground">{item.item_name}</p>
            {item.sell_price == null && (
              <span className="shrink-0 rounded-full bg-warning/30 px-2 py-0.5 text-[10px] font-semibold uppercase text-warning-foreground">
                Needs sell price
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{item.item_code || "No code"} · {item.item_type} · {item.unit || "No unit"} · {item.source_system}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div>
              <dt className="text-muted-foreground">Cost price</dt>
              <dd className="font-medium text-foreground">{formatPrice(item.cost_price, "No cost price detected")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sell price</dt>
              <dd className="font-medium text-foreground">{formatPrice(item.sell_price, "No sell price detected")}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-muted-foreground">{item.category || "Uncategorised"}</p>
          {item.aliases?.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Aliases: {item.aliases.join(", ")}</p>}
        </div>
        <button type="button" onClick={onEdit} aria-label={`Edit ${item.item_name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </article>
  )
}

function ItemEditor({
  item,
  fixedSourceSystem,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  item: KnowledgeItem
  fixedSourceSystem?: SourceSystem
  saving: boolean
  onChange: (item: KnowledgeItem) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <article className="grid gap-3 rounded-xl border border-primary/40 bg-card p-3 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <ItemInput label="Item code" value={item.item_code} onChange={(value) => onChange({ ...item, item_code: value })} />
        <ItemInput label="Unit" value={item.unit} onChange={(value) => onChange({ ...item, unit: value })} />
      </div>
      <ItemInput label="Item name" value={item.item_name} onChange={(value) => onChange({ ...item, item_name: value })} />
      <div className="grid grid-cols-2 gap-2">
        <ItemInput label="Sell price" value={item.sell_price?.toString() ?? ""} onChange={(value) => onChange({ ...item, sell_price: toNumber(value) })} />
        <ItemInput label="Category" value={item.category} onChange={(value) => onChange({ ...item, category: value })} />
      </div>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Item type
        <select
          value={item.item_type}
          onChange={(event) => onChange({ ...item, item_type: event.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-2 text-sm font-normal text-foreground outline-none focus:border-primary"
        >
          {ITEM_TYPES.map((type) => <option key={type}>{type}</option>)}
        </select>
      </label>
      {!fixedSourceSystem && (
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Source system
          <select
            value={item.source_system}
            onChange={(event) => onChange({ ...item, source_system: event.target.value as SourceSystem })}
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm font-normal text-foreground outline-none focus:border-primary"
          >
            {SOURCE_SYSTEMS.map((source) => <option key={source}>{source}</option>)}
          </select>
        </label>
      )}
      <ItemInput label="Aliases, comma separated" value={item.aliases.join(", ")} onChange={(value) => onChange({ ...item, aliases: unique(value.split(",")) })} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-sm font-semibold">
          <X className="h-4 w-4" /> Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
      </div>
    </article>
  )
}

function ItemInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-sm font-normal text-foreground outline-none focus:border-primary" />
    </label>
  )
}
