"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle, Leaf, Loader2, Upload } from "lucide-react"
import * as XLSX from "xlsx"
import { useAuth } from "@/hooks/use-auth"
import {
  detectPlantMapping,
  parsePlantPrice,
  plantPriceMappingWarnings,
  resolvePlantRowSellPrice,
  type PlantColumnMapping,
  type PlantFieldKey,
} from "@/lib/plant-library-import"
import { type SellPriceSource } from "@/lib/pricing/cost-markup"
import { classifyPlantCatalogItem, type KnowledgeItemType } from "@/lib/plant-item-classification"
import { supabase } from "@/lib/supabase"

type ParsedRow = Record<string, unknown>

type PlantImportItem = {
  item_type: KnowledgeItemType
  item_code: string
  plant_name: string
  item_name: string
  category: string
  plant_type: string
  default_spacing: string
  spacing_mm: number | null
  cost_price: number | null
  sell_price: number | null
  sell_price_source: SellPriceSource
  sell_price_rule: string | null
  account_code: string
  sales_account_code: string
  tax_code: string
  tax_type: string
  gst_rate: number | null
  supplier: string
  stock_status: string
  notes: string
  aliases: string[]
  raw_import: ParsedRow
  is_true_plant: boolean
  classification_reason: string
}

type PlantItem = {
  id: string
  item_type?: string | null
  item_code: string | null
  item_name: string | null
  description?: string | null
  category: string | null
  source_category?: string | null
  cost_price: number | null
  sell_price: number | null
  aliases: string[] | null
  raw_import: Record<string, unknown> | null
}

function toText(value: unknown) {
  return value == null ? "" : String(value).trim()
}

function parseSpacingMm(value: unknown) {
  const text = toText(value).toLowerCase()
  if (!text) return null
  const match = text.match(/(\d+(?:\.\d+)?)\s*(mm|m|metres?|meters?)?/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = match[2] ?? "mm"
  return unit.startsWith("m") && unit !== "mm" ? Math.round(amount * 1000) : Math.round(amount)
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

function generatePlantAliases(plantName: string, itemCode: string, row: ParsedRow) {
  const text = Object.values(row).map(toText).join(" ")
  const aliases = [itemCode, plantName]
  const words = plantName.split(/\s+/).filter(Boolean)
  if (words.length > 1) aliases.push(words.slice(0, 2).join(" "))

  for (const match of text.matchAll(/\b\d+(?:\.\d+)?\s*(?:l|litre|litres|pb\d+|m|mm|cm)\b/gi)) {
    aliases.push(match[0])
  }

  if (/ficus\s+tuff/i.test(text)) aliases.push("Ficus Tuffi", "Ficus Tuffy", "Tuffi hedge")
  if (/griselinia|grislynia|grisalinea/i.test(text)) aliases.push("Griselinia", "grislynia", "grisalinea")
  if (/buxus|box hedge/i.test(text)) aliases.push("Buxus", "box hedge")
  if (/pittosporum/i.test(text)) aliases.push("Pittosporum")

  return unique(aliases)
}

function mapPlantRow(row: ParsedRow, mapping: PlantColumnMapping): PlantImportItem {
  const plantName = toText(row[mapping.plant_name])
  const itemCode = toText(row[mapping.item_code])
  const defaultSpacing = toText(row[mapping.default_spacing])
  // Cost -> sell via the default markup rule. An explicit sell column always
  // wins; otherwise sell is computed from cost (deterministic), editable per line.
  const costPrice = parsePlantPrice(row[mapping.cost_price])
  const sellResolution = resolvePlantRowSellPrice(row, mapping)
  const rawImport = {
    ...row,
    plant_name: plantName,
    plant_size: toText(row[mapping.plant_type]),
    pot_size: toText(row[mapping.plant_type]),
    spacing_mm: parseSpacingMm(defaultSpacing),
    markup_percent: toText(row[mapping.markup_percent]),
    sell_price_source: sellResolution.source,
    sell_price_rule: sellResolution.rule_label,
    account_code: toText(row[mapping.account_code]),
    sales_account_code: toText(row[mapping.sales_account_code]),
    tax_code: toText(row[mapping.tax_code]),
    tax_type: toText(row[mapping.tax_type]),
    gst_rate: parsePlantPrice(row[mapping.gst_rate]),
    supplier: toText(row[mapping.supplier]),
    stock_status: toText(row[mapping.stock_status]),
    quote_app_notes: toText(row[mapping.notes]),
  }
  const classification = classifyPlantCatalogItem({
    itemCode,
    itemName: [plantName, toText(row[mapping.plant_type])].filter(Boolean).join(" "),
    plantName,
    plantType: toText(row[mapping.plant_type]),
    category: toText(row[mapping.category]),
    supplier: toText(row[mapping.supplier]),
    notes: toText(row[mapping.notes]),
  })

  return {
    item_type: classification.item_type,
    item_code: itemCode,
    plant_name: plantName,
    item_name: [plantName, toText(row[mapping.plant_type])].filter(Boolean).join(" "),
    category: classification.category,
    plant_type: toText(row[mapping.plant_type]),
    default_spacing: defaultSpacing,
    spacing_mm: parseSpacingMm(defaultSpacing),
    cost_price: costPrice,
    sell_price: sellResolution.sell_price,
    sell_price_source: sellResolution.source,
    sell_price_rule: sellResolution.rule_label,
    account_code: toText(row[mapping.account_code]),
    sales_account_code: toText(row[mapping.sales_account_code]),
    tax_code: toText(row[mapping.tax_code]),
    tax_type: toText(row[mapping.tax_type]),
    gst_rate: parsePlantPrice(row[mapping.gst_rate]),
    supplier: toText(row[mapping.supplier]),
    stock_status: toText(row[mapping.stock_status]),
    notes: toText(row[mapping.notes]),
    aliases: generatePlantAliases(plantName, itemCode, rawImport),
    raw_import: rawImport,
    is_true_plant: classification.is_true_plant,
    classification_reason: classification.reason,
  }
}

function formatPrice(value: number | null | undefined) {
  return value == null ? "No sell price" : new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value)
}

export function PlantLibrary({ onCountChange }: { onCountChange?: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { user } = useAuth()
  const [items, setItems] = useState<PlantItem[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [previewItems, setPreviewItems] = useState<PlantImportItem[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<PlantColumnMapping | null>(null)
  const [mappingWarnings, setMappingWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const loadPlants = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from("knowledge_items")
      .select("id, item_type, item_code, item_name, description, category, source_category, cost_price, sell_price, aliases, raw_import")
      .eq("user_id", user.id)
      .eq("item_type", "plant")
      .order("item_name", { ascending: true })
    setLoading(false)

    if (error) {
      setError(`Could not load plant library: ${error.message}`)
      return
    }

    const truePlants = ((data ?? []) as PlantItem[]).filter((item) =>
      classifyPlantCatalogItem({
        explicitType: item.item_type ?? "",
        itemCode: item.item_code ?? "",
        itemName: item.item_name ?? "",
        plantName: toText(item.raw_import?.plant_name),
        plantType: toText(item.raw_import?.plant_size) || toText(item.raw_import?.pot_size),
        description: item.description ?? "",
        category: item.category ?? "",
        supplier: item.source_category ?? "",
        notes: toText(item.raw_import?.quote_app_notes),
      }).is_true_plant,
    )

    setItems(truePlants)
  }, [user])

  useEffect(() => {
    void loadPlants()
  }, [loadPlants])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError("")
    setMessage("")

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error("No worksheet was found in this file.")
      const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" })
      if (rows.length === 0) throw new Error("No plant rows were detected.")
      const detectedHeaders = unique(rows.flatMap((row) => Object.keys(row)))
      const detectedMapping = detectPlantMapping(detectedHeaders)
      const mapped = rows.map((row) => mapPlantRow(row, detectedMapping))
      setRows(rows)
      setHeaders(detectedHeaders)
      setMapping(detectedMapping)
      setMappingWarnings(plantPriceMappingWarnings(detectedMapping))
      setPreviewItems(mapped)
    } catch (parseError) {
      setPreviewItems([])
      setRows([])
      setHeaders([])
      setMapping(null)
      setMappingWarnings([])
      setError(parseError instanceof Error ? parseError.message : "Could not parse this plant file.")
    }
  }

  function updateMapping(field: PlantFieldKey, header: string) {
    if (!mapping) return
    const nextMapping = { ...mapping, [field]: header }
    setMapping(nextMapping)
    setMappingWarnings(plantPriceMappingWarnings(nextMapping))
    setPreviewItems(rows.map((row) => mapPlantRow(row, nextMapping)))
  }

  async function importPlants() {
    if (!user) return
    const validItems = previewItems.filter((item) => item.item_name || item.plant_name)
    if (validItems.length === 0) return

    setImporting(true)
    setError("")
    setMessage("")

    const importBatchId = crypto.randomUUID()
    const updatedAt = new Date().toISOString()
    for (let index = 0; index < validItems.length; index += 200) {
      const batch = validItems.slice(index, index + 200).map((item) => ({
        user_id: user.id,
        source_system: "Plant Library",
        item_type: item.item_type,
        item_code: item.item_code,
        item_name: item.item_name,
        description: item.notes,
        unit: "each",
        cost_price: item.cost_price,
        sell_price: item.sell_price,
        account_code: item.account_code,
        sales_account_code: item.sales_account_code,
        tax_code: item.tax_code,
        tax_type: item.tax_type,
        gst_rate: item.gst_rate,
        aliases: item.aliases,
        category: item.is_true_plant ? item.category || "plant" : item.category || item.item_type,
        source_category: item.supplier,
        external_item_id: item.item_code,
        raw_import: {
          ...item.raw_import,
          item_type_classification: item.item_type,
          item_type_classification_reason: item.classification_reason,
          is_true_plant: item.is_true_plant,
        },
        import_batch_id: importBatchId,
        updated_from_import_at: updatedAt,
      }))

      const { error } = await supabase.from("knowledge_items").insert(batch)
      if (error) {
        setImporting(false)
        setError(`Could not import plants: ${error.message}`)
        return
      }
    }

    setImporting(false)
    setRows([])
    setPreviewItems([])
    setHeaders([])
    setMapping(null)
    setMappingWarnings([])
    if (inputRef.current) inputRef.current.value = ""
    setMessage(`${validItems.length} nursery items imported successfully.`)
    await loadPlants()
    onCountChange?.()
  }

  return (
    <div className="grid gap-5 pb-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Leaf className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Plant Price Library Import</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Import plant price lists with spacing, pot sizes, supplier, stock status, and sell prices.
            </p>
          </div>
        </div>

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
          Choose Plant CSV or XLSX
        </button>
      </section>

      {(message || error) && (
        <p className={`rounded-xl border px-3 py-2 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"}`}>
          {error || message}
        </p>
      )}

      {previewItems.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-semibold text-foreground">Import preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {previewItems.length} nursery rows detected · {previewItems.filter((item) => item.is_true_plant).length} live plant options
          </p>
          <div className="mt-3 max-h-[58vh] overflow-y-auto rounded-xl border border-border bg-background/40 p-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detected headers</h3>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/50 p-2 text-xs text-foreground">
                {JSON.stringify(headers, null, 2)}
              </pre>
            </div>
            {mapping && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mapping</h3>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  {Object.entries(mapping).map(([field, header]) => (
                    <div key={field} className="rounded-lg bg-secondary/50 px-2 py-2">
                      <dt className="font-semibold text-foreground">{field.replaceAll("_", " ")}</dt>
                      <dd className="mt-1">
                        <select
                          value={header}
                          onChange={(event) => updateMapping(field as PlantFieldKey, event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                        >
                          <option value="">Not mapped</option>
                          {headers.map((detectedHeader) => (
                            <option key={`${field}-${detectedHeader}`} value={detectedHeader}>
                              {detectedHeader}
                            </option>
                          ))}
                        </select>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {mappingWarnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                <h3 className="font-semibold">Import warnings</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {mappingWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="min-w-[760px] text-left text-xs">
                <thead className="bg-card text-muted-foreground">
                  <tr><th className="p-2">SKU</th><th className="p-2">Item</th><th className="p-2">Class</th><th className="p-2">Type/size</th><th className="p-2">Spacing</th><th className="p-2">Cost</th><th className="p-2">Sell</th><th className="p-2">Stock</th></tr>
                </thead>
                <tbody>
                  {previewItems.slice(0, 10).map((item, index) => (
                    <tr key={`${item.item_code}-${index}`} className="border-t border-border">
                      <td className="p-2">{item.item_code || "—"}</td>
                      <td className="p-2">{item.item_name || "Missing name"}</td>
                      <td className="p-2">
                        <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
                          {item.item_type}
                        </span>
                        {!item.is_true_plant && <p className="mt-1 max-w-[180px] text-muted-foreground">{item.classification_reason}</p>}
                      </td>
                      <td className="p-2">{item.plant_type || "—"}</td>
                      <td className="p-2">{item.spacing_mm ? `${item.spacing_mm}mm` : "—"}</td>
                      <td className="p-2">{formatPrice(item.cost_price)}</td>
                      <td className="p-2">{formatPrice(item.sell_price)}</td>
                      <td className="p-2">{item.stock_status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void importPlants()}
            disabled={importing || !previewItems.some((item) => item.item_name || item.plant_name)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Import Plants
          </button>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plant Library</h2>
            <p className="text-xs text-muted-foreground">{items.length} imported plant options</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid gap-3">
          {items.map((item) => {
            const raw = item.raw_import ?? {}
            return (
              <article key={item.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <p className="font-semibold text-foreground">{item.item_name}</p>
                <p className="text-xs text-muted-foreground">{item.item_code || "No SKU"} · {item.category || "plant"} · {formatPrice(item.sell_price)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Spacing: {typeof raw.spacing_mm === "number" ? `${raw.spacing_mm}mm` : "Not set"} · Supplier: {toText(raw.supplier) || "Not set"} · Stock: {toText(raw.stock_status) || "Not set"}
                </p>
                {item.aliases && item.aliases.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Aliases: {item.aliases.join(", ")}</p>}
              </article>
            )
          })}
          {!loading && items.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No plants imported yet.</div>
          )}
        </div>
      </section>
    </div>
  )
}
