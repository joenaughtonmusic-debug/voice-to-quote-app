import type { PlantCalculatorResult } from "./calculators/planting"
import { quoteFactsFromProcessedQuote } from "./core/quote-facts"
import { renderDeckingCustomerScopeFromQuoteFacts } from "./trades/decking/customer-renderer"
import { renderRetainingCustomerScopeFromQuoteFacts } from "./trades/retaining/customer-renderer"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote, type QuoteLineItem } from "./processed-quote"
import type { QuoteOption } from "./quote-options"
import { renderQuoteTemplate, type SelectedQuoteTemplate, type TemplateRenderOutput } from "./template-renderer"

export type CustomerPreviewLineItem = {
  source_item_id?: string
  source_system?: string
  item_code?: string
  item_name?: string
  item_type?: string
  description?: string
  quantity?: string | null
  unit?: string
  rate?: string | null
  knowledge_base_rate?: string | null
  override_rate?: string | null
  final_rate_used?: string | null
  total?: string | null
  account_code?: string
  sales_account_code?: string
  tax_code?: string
  tax_type?: string
  gst_rate?: number | null
  match_confidence?: string
  match_reason?: string
  needs_review?: boolean
  warning?: string
}

export type CustomerPreviewQuote = {
  line_items: CustomerPreviewLineItem[]
  materials?: string[]
  greenwaste?: string
  customer_scope?: string[]
  internal_notes?: string[]
  primary_quote?: {
    scope?: string[]
    notes?: string[]
  }
  quote_options?: QuoteOption[]
  plant_calculator_results?: PlantCalculatorResult[]
  selected_template?: SelectedQuoteTemplate | null
}

export type CustomerPreviewPlantOption = {
  id: string
  label: string
  title: string
  quantityText: string
  subtotalText: string
  isBase: boolean
}

export type CustomerPreviewMaterialLine = {
  id: string
  label: string
  detail?: string
  amount?: string
}

export type CustomerQuotePreview = {
  scopeItems: string[]
  rendered: TemplateRenderOutput
  labourLine?: CustomerPreviewMaterialLine
  plantOptions: CustomerPreviewPlantOption[]
  materialLines: CustomerPreviewMaterialLine[]
}

export type CustomerQuotePreviewOptions = {
  includeDeckingScope?: boolean
  includeRetainingScope?: boolean
}

type CustomerPreviewQuoteExtras = {
  client_name?: string
  site_address?: string
  quote_title?: string
  job_type?: string
  selected_template_id?: string
  selected_template_name?: string
  template_match_confidence?: string
  learned_rules_applied?: string[]
  optional_quotes?: ProcessedQuote["optional_quotes"]
  primary_quote?: CustomerPreviewQuote["primary_quote"] & Partial<ProcessedQuote["primary_quote"]>
  exclusions?: string[]
  follow_up_tasks?: string[]
  missing_information?: string[]
  confidence_warnings?: string[]
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function numberFromValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (!value) return null
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function cleanOptionTitle(title: string, areaLabel?: string) {
  const withoutArea = areaLabel
    ? title.replace(new RegExp(`^${areaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+-\\s+`, "i"), "")
    : title

  return withoutArea.replace(/\s+/g, " ").trim()
}

function plantQuantity(option: QuoteOption) {
  return option.lineItems.reduce((total, item) => total + (Number.isFinite(item.quantity) ? item.quantity : 0), 0)
}

function combinePlantOptions(options: QuoteOption[] | undefined) {
  const combined = new Map<string, { title: string; quantity: number; subtotal: number; firstId: string }>()

  for (const option of options ?? []) {
    if (option.category !== "planting") continue
    const title = cleanOptionTitle(option.title, option.areaLabel)
    const quantity = plantQuantity(option)
    if (!title || quantity <= 0 || !Number.isFinite(option.subtotal)) continue

    const key = title.toLowerCase().replace(/[^a-z0-9āēīōū]/gi, "")
    const current = combined.get(key)
    if (current) {
      combined.set(key, {
        ...current,
        quantity: current.quantity + quantity,
        subtotal: current.subtotal + option.subtotal,
      })
    } else {
      combined.set(key, {
        title,
        quantity,
        subtotal: option.subtotal,
        firstId: option.id,
      })
    }
  }

  return Array.from(combined.values()).sort((a, b) => a.subtotal - b.subtotal)
}

function customerAmountFromLineItem(item: CustomerPreviewLineItem) {
  const total = numberFromValue(item.total)
  return total === null ? "" : money(total)
}

function lineItemText(item: CustomerPreviewLineItem) {
  return [item.item_code, item.item_name, item.item_type, item.description, item.match_reason].join(" ")
}

function findLabourLine(quote: CustomerPreviewQuote): CustomerPreviewMaterialLine | undefined {
  const labourItems = quote.line_items.filter((item) => /\blabou?r\b/i.test(lineItemText(item)))
  const priced = labourItems
    .map((item) => ({ item, total: numberFromValue(item.total) }))
    .filter((entry): entry is { item: CustomerPreviewLineItem; total: number } => entry.total !== null)
    .sort((a, b) => b.total - a.total)

  const labour = priced[0]
  if (!labour) return undefined

  return {
    id: "planting-labour",
    label: "Planting labour",
    amount: money(labour.total),
  }
}

function materialLine(item: CustomerPreviewLineItem, label: string, fallbackDetail = "To confirm"): CustomerPreviewMaterialLine {
  const quantity = item.quantity?.trim()
  const unit = item.unit?.trim()
  const amount = customerAmountFromLineItem(item)

  return {
    id: `${label}-${item.item_name || item.description}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    detail: quantity ? [quantity, unit && !quantity.toLowerCase().includes(unit.toLowerCase()) ? unit : ""].filter(Boolean).join(" ") : fallbackDetail,
    amount: amount || undefined,
  }
}

function findMaterialLines(quote: CustomerPreviewQuote) {
  const lines: CustomerPreviewMaterialLine[] = []
  const seen = new Set<string>()

  for (const item of quote.line_items) {
    const text = lineItemText(item)
    const line =
      /\bgarden\s+mix\b/i.test(text)
        ? materialLine(item, "Garden mix")
        : /\bhardfill|old\s+soil|soil\s+removal|removal\s+of\s+old\s+soil\b/i.test(text)
          ? materialLine(item, "Hardfill / soil removal")
          : null

    if (!line || seen.has(line.label)) continue
    seen.add(line.label)
    lines.push(line)
  }

  return lines
}

function normalisedLineItem(item: CustomerPreviewLineItem): QuoteLineItem {
  return {
    source_item_id: item.source_item_id,
    source_system: item.source_system,
    item_code: item.item_code ?? "",
    item_name: item.item_name ?? "",
    item_type: item.item_type ?? "",
    description: item.description ?? "",
    quantity: item.quantity ?? null,
    unit: item.unit ?? "",
    rate: item.rate ?? null,
    knowledge_base_rate: item.knowledge_base_rate ?? null,
    override_rate: item.override_rate ?? null,
    final_rate_used: item.final_rate_used ?? null,
    total: item.total ?? null,
    account_code: item.account_code,
    sales_account_code: item.sales_account_code,
    tax_code: item.tax_code,
    tax_type: item.tax_type,
    gst_rate: item.gst_rate,
    match_confidence: item.match_confidence ?? "",
    match_reason: item.match_reason ?? "",
    needs_review: item.needs_review ?? false,
    warning: item.warning ?? "",
  }
}

function normalisedProcessedQuote(quote: CustomerPreviewQuote): ProcessedQuote {
  const extras = quote as CustomerPreviewQuote & CustomerPreviewQuoteExtras

  return {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: extras.client_name ?? EMPTY_PROCESSED_QUOTE.client_name,
    site_address: extras.site_address ?? EMPTY_PROCESSED_QUOTE.site_address,
    quote_title: extras.quote_title ?? EMPTY_PROCESSED_QUOTE.quote_title,
    job_type: extras.job_type ?? EMPTY_PROCESSED_QUOTE.job_type,
    selected_template_id: extras.selected_template_id ?? EMPTY_PROCESSED_QUOTE.selected_template_id,
    selected_template_name: extras.selected_template_name ?? EMPTY_PROCESSED_QUOTE.selected_template_name,
    template_match_confidence: extras.template_match_confidence ?? EMPTY_PROCESSED_QUOTE.template_match_confidence,
    learned_rules_applied: extras.learned_rules_applied ?? [],
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      ...(extras.primary_quote ?? {}),
      scope: extras.primary_quote?.scope ?? [],
      notes: extras.primary_quote?.notes ?? [],
    },
    optional_quotes: extras.optional_quotes ?? [],
    customer_scope: quote.customer_scope ?? [],
    internal_notes: quote.internal_notes ?? [],
    materials: quote.materials ?? [],
    greenwaste: quote.greenwaste ?? "",
    exclusions: extras.exclusions ?? [],
    follow_up_tasks: extras.follow_up_tasks ?? [],
    missing_information: extras.missing_information ?? [],
    confidence_warnings: extras.confidence_warnings ?? [],
    line_items: quote.line_items.map(normalisedLineItem),
    quote_options: quote.quote_options ?? [],
    plant_calculator_results: quote.plant_calculator_results ?? [],
  }
}

export function buildCustomerQuotePreview(
  quote: CustomerPreviewQuote,
  options: CustomerQuotePreviewOptions = {},
): CustomerQuotePreview {
  const plantOptions = combinePlantOptions(quote.quote_options).map((option, index) => ({
    id: option.firstId,
    label: index === 0 ? "Included plant price" : "Upgrade option",
    title: option.title,
    quantityText: `${option.quantity} plants`,
    subtotalText: money(option.subtotal),
    isBase: index === 0,
  }))

  const materialLines = findMaterialLines(quote)
  const rendered = renderQuoteTemplate(quote, quote.selected_template)
  const quoteFacts = options.includeDeckingScope || options.includeRetainingScope
    ? quoteFactsFromProcessedQuote(normalisedProcessedQuote(quote))
    : []
  const deckingScopeItems = options.includeDeckingScope ? renderDeckingCustomerScopeFromQuoteFacts(quoteFacts) : []
  const retainingScopeItems = options.includeRetainingScope ? renderRetainingCustomerScopeFromQuoteFacts(quoteFacts) : []
  const scopeItems =
    retainingScopeItems.length > 0 ? retainingScopeItems : deckingScopeItems.length > 0 ? deckingScopeItems : rendered.customerScope

  return {
    scopeItems,
    rendered,
    labourLine: findLabourLine(quote),
    plantOptions,
    materialLines,
  }
}
