import type { PlantCalculatorResult } from "@/lib/calculators/planting"
import type { QuoteOption, QuoteOptionLineItem } from "@/lib/quote-options"

export type QuoteLineItem = {
  source_item_id?: string
  source_system?: string
  item_code: string
  item_name: string
  item_type: string
  description: string
  quantity: string | null
  unit: string
  rate: string | null
  knowledge_base_rate: string | null
  override_rate: string | null
  final_rate_used: string | null
  total: string | null
  account_code?: string
  sales_account_code?: string
  tax_code?: string
  tax_type?: string
  gst_rate?: number | null
  match_confidence: string
  match_reason: string
  needs_review: boolean
  warning: string
}

export type QuoteIntent = {
  quote_title: string
  job_type: string
  scope: string[]
  cadence: string
  notes: string[]
}

export type ProcessedQuote = {
  client_name: string
  site_address: string
  quote_title: string
  job_type: string
  selected_template_id: string
  selected_template_name: string
  template_match_confidence: string
  learned_rules_applied: string[]
  primary_quote: QuoteIntent
  optional_quotes: QuoteIntent[]
  customer_scope: string[]
  internal_notes: string[]
  labour_allowance: string
  materials: string[]
  greenwaste: string
  exclusions: string[]
  follow_up_tasks: string[]
  missing_information: string[]
  confidence_warnings: string[]
  line_items: QuoteLineItem[]
  plant_calculator_results?: PlantCalculatorResult[]
  quote_options?: QuoteOption[]
}

export type EditableQuoteSection = {
  key: string
  title: string
  content: string
  customer_visible: boolean
  internal_visible: boolean
  kind: "field" | "list" | "warnings"
}

export type SavedQuoteDraft = {
  id: string
  client_name: string | null
  site_address: string | null
  quote_title: string | null
  job_type: string | null
  raw_transcript: string | null
  quote_sections: unknown
  line_items: unknown
  /** Structured quote options persisted separately from quote_sections text. */
  quote_options?: unknown
}

export const EMPTY_PROCESSED_QUOTE: ProcessedQuote = {
  client_name: "",
  site_address: "",
  quote_title: "",
  job_type: "",
  selected_template_id: "",
  selected_template_name: "",
  template_match_confidence: "",
  learned_rules_applied: [],
  primary_quote: {
    quote_title: "",
    job_type: "",
    scope: [],
    cadence: "",
    notes: [],
  },
  optional_quotes: [],
  customer_scope: [],
  internal_notes: [],
  labour_allowance: "",
  materials: [],
  greenwaste: "",
  exclusions: [],
  follow_up_tasks: [],
  missing_information: [],
  confidence_warnings: [],
  line_items: [],
  plant_calculator_results: [],
  quote_options: [],
}

function lines(items: string[]) {
  return items.join("\n")
}

function quoteIntentLines(option: QuoteIntent) {
  return [
    option.quote_title ? `Title: ${option.quote_title}` : "",
    option.job_type ? `Job type: ${option.job_type}` : "",
    option.cadence ? `Cadence: ${option.cadence}` : "",
    ...option.scope.map((item) => `Scope: ${item}`),
    ...option.notes.map((item) => `Note: ${item}`),
  ].filter(Boolean)
}

function parseQuoteIntentSection(content: string): QuoteIntent {
  const scope: string[] = []
  const notes: string[] = []
  let quote_title = ""
  let job_type = ""
  let cadence = ""

  for (const line of splitLines(content)) {
    if (/^title:\s*/i.test(line)) {
      quote_title = line.replace(/^title:\s*/i, "").trim()
      continue
    }
    if (/^job type:\s*/i.test(line)) {
      job_type = line.replace(/^job type:\s*/i, "").trim()
      continue
    }
    if (/^cadence:\s*/i.test(line)) {
      cadence = line.replace(/^cadence:\s*/i, "").trim()
      continue
    }
    if (/^scope:\s*/i.test(line)) {
      scope.push(line.replace(/^scope:\s*/i, "").trim())
      continue
    }
    if (/^note:\s*/i.test(line)) {
      notes.push(line.replace(/^note:\s*/i, "").trim())
      continue
    }
    if (line.trim()) {
      notes.push(line.trim())
    }
  }

  return { quote_title, job_type, cadence, scope, notes }
}

function matchedLineItemLines(items: QuoteLineItem[]) {
  return items.map((item) =>
    [
      item.item_code ? `${item.item_code} · ${item.item_name}` : item.item_name || item.description || "Unmatched item",
      item.quantity
        ? `Qty ${item.quantity}${item.unit && !item.quantity.toLowerCase().includes(item.unit.toLowerCase()) ? ` ${item.unit}` : ""}`
        : "",
      item.knowledge_base_rate ? `KB rate ${item.knowledge_base_rate}` : "",
      item.override_rate ? `Override ${item.override_rate}` : "",
      item.final_rate_used ? `Final rate ${item.final_rate_used}` : item.rate ? `Rate ${item.rate}` : "",
      item.total ? `Total ${item.total}` : "",
      item.account_code ? `Account ${item.account_code}` : item.sales_account_code ? `Sales account ${item.sales_account_code}` : "",
      item.tax_type ? `Tax ${item.tax_type}` : item.tax_code ? `Tax code ${item.tax_code}` : "",
      item.match_confidence ? `Match ${item.match_confidence}` : "",
      item.match_reason ? `Reason: ${item.match_reason}` : "",
      item.warning ? `Warning: ${item.warning}` : "",
      item.needs_review ? "Needs review" : "",
    ]
      .filter(Boolean)
      .join(" | "),
  )
}

function quoteOptionLines(options: QuoteOption[] | undefined) {
  if (!Array.isArray(options) || options.length === 0) return []

  return options.flatMap((option) => {
    const lineItems = option.lineItems.map((item) =>
      [
        item.itemName,
        item.itemCode ? `Code: ${item.itemCode}` : "",
        item.accountCode ? `Account: ${item.accountCode}` : item.salesAccountCode ? `Sales account: ${item.salesAccountCode}` : "",
        item.taxType ? `Tax: ${item.taxType}` : item.taxCode ? `Tax code: ${item.taxCode}` : "",
        option.areaLabel ? `Area: ${option.areaLabel}` : "",
        `Qty ${item.quantity} ${item.unit}`,
        `Unit ${money(item.unitPrice)}`,
        `Total ${money(item.total)}`,
        item.supplier ? `Supplier: ${item.supplier}` : "",
        item.stockStatus ? `Stock: ${item.stockStatus}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    )

    return [
      `${option.label}: ${option.title}`,
      option.description ?? "",
      option.areaLabel ? `Area: ${option.areaLabel}` : "",
      `Category: ${option.category}`,
      `Source: ${option.source}`,
      `Subtotal: ${money(option.subtotal)}`,
      ...lineItems,
      ...(option.notes?.length ? option.notes.map((note) => `Note: ${note}`) : []),
      ...(option.warnings?.length ? option.warnings.map((warning) => `Warning: ${warning}`) : []),
    ].filter(Boolean)
  })
}

function money(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "Not priced"
}

function plantingCalculatorResultLines(results: PlantCalculatorResult[] | undefined) {
  if (!Array.isArray(results) || results.length === 0) return []

  return results.flatMap((result, resultIndex) => {
    const warnings = [
      ...result.warnings.map((warning) => warning.message),
      ...result.options.flatMap((option) => option.warnings.map((warning) => `${option.plant_name}: ${warning.message}`)),
    ]
    const optionLines = result.option_groups?.length
      ? result.option_groups.map((option) =>
          [
            option.option_label,
            option.plant_size || option.pot_size || "Size not captured",
            `${option.plant_count ?? "Plant count not captured"} plants`,
            money(option.plant_total),
            option.supplier ? `Supplier: ${option.supplier}` : "",
            option.stock_status ? `Stock: ${option.stock_status}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        )
      : result.options.length
        ? result.options.map((option, optionIndex) =>
            [
              `Option ${optionIndex + 1}`,
              option.plant_size || option.pot_size || "Size not captured",
              `${option.plant_count ?? "Plant count not captured"} plants`,
              money(option.total_price),
              option.supplier ? `Supplier: ${option.supplier}` : "",
              option.stock_status ? `Stock: ${option.stock_status}` : "",
            ]
              .filter(Boolean)
              .join(" | "),
          )
      : ["No Plant Library size options matched."]

    return [
      resultIndex > 0 ? "" : "Internal calculator output only.",
      result.area_label ? `Area: ${result.area_label}` : "",
      `Plant: ${result.plant_name ?? "Not captured"}`,
      `Confidence: ${result.library_match?.match_confidence ?? "none"}${typeof result.library_match?.confidence_score === "number" ? ` (${result.library_match.confidence_score})` : ""}`,
      `Spacing used: ${result.spacing_mm ? `${result.spacing_mm}mm` : "Not captured"}`,
      `Spacing source: ${result.spacing_source}`,
      `Plant count: ${result.plant_count ?? "Not calculated"}`,
      result.formula ? `Calculation: ${result.formula}` : "Calculation: spoken quantity or not available",
      ...optionLines,
      ...(warnings.length > 0 ? ["Warnings:", ...warnings.map((warning) => `Warning: ${warning}`)] : ["Warnings: none"]),
    ].filter((line) => line !== "")
  })
}

function plantingCalculatorNotes(notes: string[]) {
  return notes.filter((note) => note.trim().startsWith("Planting Calculator"))
}

function nonPlantingCalculatorNotes(notes: string[]) {
  return notes.filter((note) => !note.trim().startsWith("Planting Calculator"))
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function processedQuoteToEditableSections(quote: ProcessedQuote): EditableQuoteSection[] {
  const plantingNotes = plantingCalculatorNotes(quote.internal_notes)
  const internalNotes = nonPlantingCalculatorNotes(quote.internal_notes)

  return [
    {
      key: "selected_template",
      title: "Selected template",
      content: [
        quote.selected_template_name ? `Template: ${quote.selected_template_name}` : "",
        quote.selected_template_id ? `ID: ${quote.selected_template_id}` : "",
        quote.template_match_confidence ? `Confidence: ${quote.template_match_confidence}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      customer_visible: false,
      internal_visible: true,
      kind: "field",
    },
    {
      key: "learned_rules_applied",
      title: "Learned rules applied",
      content: lines(quote.learned_rules_applied),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "client_name",
      title: "Customer details",
      content: quote.client_name,
      customer_visible: true,
      internal_visible: true,
      kind: "field",
    },
    {
      key: "site_address",
      title: "Site address",
      content: quote.site_address,
      customer_visible: true,
      internal_visible: true,
      kind: "field",
    },
    {
      key: "job_type",
      title: "Job type",
      content: quote.job_type || quote.quote_title,
      customer_visible: true,
      internal_visible: true,
      kind: "field",
    },
    {
      key: "primary_quote",
      title: "Primary quote",
      content: lines(quoteIntentLines(quote.primary_quote)),
      customer_visible: true,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "optional_quotes",
      title: "Optional / secondary quotes",
      content: lines(quote.optional_quotes.flatMap(quoteIntentLines)),
      customer_visible: true,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "customer_scope",
      title: "Customer-facing scope",
      content: lines(quote.customer_scope),
      customer_visible: true,
      internal_visible: false,
      kind: "list",
    },
    {
      key: "internal_notes",
      title: "Internal notes",
      content: lines(internalNotes),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
    ...(plantingNotes.length > 0
      ? [
          {
            key: "planting_calculator",
            title: "Planting Calculator",
            content: lines(plantingNotes),
            customer_visible: false,
            internal_visible: true,
            kind: "list" as const,
          },
        ]
      : []),
    ...(quote.plant_calculator_results?.length
      ? [
          {
            key: "planting_calculator_review",
            title: "Planting Calculator Review",
            content: lines(plantingCalculatorResultLines(quote.plant_calculator_results)),
            customer_visible: false,
            internal_visible: true,
            kind: "list" as const,
          },
        ]
      : []),
    ...(quote.quote_options?.length
      ? [
          {
            key: "quote_options",
            title: "Quote Options",
            content: lines(quoteOptionLines(quote.quote_options)),
            customer_visible: false,
            internal_visible: true,
            kind: "list" as const,
          },
        ]
      : []),
    {
      key: "labour_allowance",
      title: "Labour allowance",
      content: quote.labour_allowance,
      customer_visible: false,
      internal_visible: true,
      kind: "field",
    },
    {
      key: "materials_greenwaste",
      title: "Materials / green waste",
      content: lines([...quote.materials, quote.greenwaste ? `Greenwaste: ${quote.greenwaste}` : ""]),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "matched_jms_line_items",
      title: "Matched JMS Line Items",
      content: lines(matchedLineItemLines(quote.line_items)),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "exclusions",
      title: "Exclusions",
      content: lines(quote.exclusions),
      customer_visible: true,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "follow_up_tasks",
      title: "Follow-up tasks",
      content: lines(quote.follow_up_tasks),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "missing_information",
      title: "Missing information",
      content: lines(quote.missing_information),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "confidence_warnings",
      title: "Confidence warnings",
      content: lines(quote.confidence_warnings),
      customer_visible: true,
      internal_visible: true,
      kind: "warnings",
    },
  ]
}

function isEditableQuoteSection(value: unknown): value is EditableQuoteSection {
  if (!value || typeof value !== "object") return false
  const section = value as Partial<EditableQuoteSection>

  return (
    typeof section.key === "string" &&
    typeof section.title === "string" &&
    typeof section.content === "string" &&
    typeof section.customer_visible === "boolean" &&
    typeof section.internal_visible === "boolean" &&
    (section.kind === "field" || section.kind === "list" || section.kind === "warnings")
  )
}

function quoteSectionsFromSaved(value: unknown, fallbackQuote: ProcessedQuote) {
  if (Array.isArray(value) && value.every(isEditableQuoteSection)) {
    if (value.some((section) => section.key === "matched_jms_line_items") || fallbackQuote.line_items.length === 0) {
      return value
    }

    const matchedSection = processedQuoteToEditableSections(fallbackQuote).find(
      (section) => section.key === "matched_jms_line_items",
    )
    return matchedSection ? [...value, matchedSection] : value
  }

  return processedQuoteToEditableSections(fallbackQuote)
}

function lineItemsFromSaved(value: unknown): QuoteLineItem[] {
  if (!Array.isArray(value)) return []

  return value.map((item) => {
    const lineItem = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const rate = stringOrNull(lineItem.rate ?? lineItem.unit_rate)
    const knowledgeBaseRate = stringOrNull(lineItem.knowledge_base_rate)
    const overrideRate = stringOrNull(lineItem.override_rate)
    const finalRateUsed = stringOrNull(lineItem.final_rate_used ?? rate)
    const quantity = stringOrNull(lineItem.quantity)
    const total = stringOrNull(lineItem.total ?? lineItem.amount)

    return {
      item_code: String(lineItem.item_code ?? ""),
      source_item_id: String(lineItem.source_item_id ?? ""),
      source_system: String(lineItem.source_system ?? ""),
      item_name: String(lineItem.item_name ?? lineItem.label ?? ""),
      item_type: String(lineItem.item_type ?? ""),
      description: String(lineItem.description ?? lineItem.detail ?? ""),
      quantity,
      unit: String(lineItem.unit ?? ""),
      rate,
      knowledge_base_rate: knowledgeBaseRate,
      override_rate: overrideRate,
      final_rate_used: finalRateUsed,
      total,
      account_code: String(lineItem.account_code ?? ""),
      sales_account_code: String(lineItem.sales_account_code ?? ""),
      tax_code: String(lineItem.tax_code ?? ""),
      tax_type: String(lineItem.tax_type ?? ""),
      gst_rate:
        typeof lineItem.gst_rate === "number" && Number.isFinite(lineItem.gst_rate)
          ? lineItem.gst_rate
          : null,
      match_confidence: String(lineItem.match_confidence ?? ""),
      match_reason: String(lineItem.match_reason ?? lineItem.confidence_note ?? ""),
      needs_review: Boolean(lineItem.needs_review),
      warning: String(lineItem.warning ?? ""),
    }
  })
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringArrayOrEmpty(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? "").trim()).filter(Boolean)
}

function quoteOptionLineItemFromSaved(value: unknown): QuoteOptionLineItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const quantity = numberOrNull(item.quantity)
  const unitPrice = numberOrNull(item.unitPrice)
  const total = numberOrNull(item.total)
  const itemName = String(item.itemName ?? "").trim()

  if (!itemName || quantity === null || unitPrice === null || total === null) return null

  return {
    itemName,
    itemCode: stringOrNull(item.itemCode) ?? undefined,
    sourceSystem: stringOrNull(item.sourceSystem) ?? undefined,
    accountCode: stringOrNull(item.accountCode) ?? undefined,
    salesAccountCode: stringOrNull(item.salesAccountCode) ?? undefined,
    taxCode: stringOrNull(item.taxCode) ?? undefined,
    taxType: stringOrNull(item.taxType) ?? undefined,
    gstRate: numberOrNull(item.gstRate),
    quantity,
    unit: String(item.unit ?? ""),
    unitPrice,
    total,
    supplier: stringOrNull(item.supplier) ?? undefined,
    stockStatus: stringOrNull(item.stockStatus) ?? undefined,
    sourceItemId: stringOrNull(item.sourceItemId) ?? undefined,
  }
}

const QUOTE_OPTION_CATEGORIES = new Set(["planting", "material", "labour", "general"])
const QUOTE_OPTION_SOURCES = new Set(["plant_calculator", "trade_calculator", "manual", "ai_extraction"])

function quoteOptionFromSaved(value: unknown): QuoteOption | null {
  if (!value || typeof value !== "object") return null
  const option = value as Record<string, unknown>
  const id = String(option.id ?? "").trim()
  const label = String(option.label ?? "").trim()
  const title = String(option.title ?? "").trim()
  const category = String(option.category ?? "")
  const source = String(option.source ?? "")
  const subtotal = numberOrNull(option.subtotal)

  if (!id || !label || !title || !QUOTE_OPTION_CATEGORIES.has(category) || !QUOTE_OPTION_SOURCES.has(source)) {
    return null
  }
  if (subtotal === null) return null

  const lineItems = Array.isArray(option.lineItems)
    ? option.lineItems.map(quoteOptionLineItemFromSaved).filter((item): item is QuoteOptionLineItem => item !== null)
    : []

  if (lineItems.length === 0) return null

  return {
    id,
    label,
    title,
    description: stringOrNull(option.description) ?? undefined,
    category: category as QuoteOption["category"],
    source: source as QuoteOption["source"],
    areaLabel: stringOrNull(option.areaLabel) ?? undefined,
    isPrimary: typeof option.isPrimary === "boolean" ? option.isPrimary : undefined,
    lineItems,
    subtotal,
    notes: stringArrayOrEmpty(option.notes),
    warnings: stringArrayOrEmpty(option.warnings),
  }
}

/** Restores structured quote options from a saved draft JSON column. */
export function quoteOptionsFromSaved(value: unknown): QuoteOption[] {
  if (!Array.isArray(value)) return []
  return value.map(quoteOptionFromSaved).filter((option): option is QuoteOption => option !== null)
}

/** Fields persisted to quote_drafts.quote_options — used on save and in acceptance tests. */
export function quoteDraftQuoteOptions(processedQuote: ProcessedQuote): QuoteOption[] {
  return processedQuote.quote_options ?? []
}

export function buildQuoteDraftPersistedFields(
  rawTranscript: string,
  processedQuote: ProcessedQuote,
  quoteSections: EditableQuoteSection[],
  userId: string,
) {
  return {
    user_id: userId,
    client_name: processedQuote.client_name || null,
    site_address: processedQuote.site_address || null,
    quote_title: processedQuote.quote_title || processedQuote.job_type || "Generated Quote",
    job_type: processedQuote.job_type || null,
    raw_transcript: rawTranscript,
    quote_sections: quoteSections,
    line_items: processedQuote.line_items,
    quote_options: quoteDraftQuoteOptions(processedQuote),
    status: "Needs Review",
  }
}

export function savedDraftToEditableState(draft: SavedQuoteDraft) {
  const fallbackQuote: ProcessedQuote = {
    ...EMPTY_PROCESSED_QUOTE,
    client_name: draft.client_name ?? "",
    site_address: draft.site_address ?? "",
    quote_title: draft.quote_title ?? "",
    job_type: draft.job_type ?? "",
    primary_quote: {
      quote_title: draft.quote_title ?? "",
      job_type: draft.job_type ?? "",
      scope: [],
      cadence: "",
      notes: [],
    },
    line_items: lineItemsFromSaved(draft.line_items),
    quote_options: quoteOptionsFromSaved(draft.quote_options),
  }
  const sections = quoteSectionsFromSaved(draft.quote_sections, fallbackQuote)
  const processedQuote = editableSectionsToProcessedQuote(sections, fallbackQuote)

  return {
    rawTranscript: draft.raw_transcript ?? "",
    processedQuote,
    sections,
  }
}

function uniqueNonEmptyLines(values: string[]) {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * Builds the ProcessedQuote passed to QuoteDraft after "Preview Customer Quote Draft".
 *
 * The customer review UI can show scope from customerPreview.scopeItems (including the
 * customer_scope card overlay) while the editable customer_scope section is still empty.
 * This syncs the visible customer-facing scope into the handoff quote.
 */
export function buildQuoteHandoffForDraftPreview({
  sections,
  baseQuote,
  customerScopeItems,
  dirtyKeys,
}: {
  sections: EditableQuoteSection[]
  baseQuote: ProcessedQuote
  customerScopeItems: string[]
  dirtyKeys: ReadonlySet<string>
}): ProcessedQuote {
  const usePreviewCustomerScope = !dirtyKeys.has("customer_scope") && customerScopeItems.length > 0

  let handoffSections = usePreviewCustomerScope
    ? sections.map((section) =>
        section.key === "customer_scope"
          ? { ...section, content: customerScopeItems.join("\n") }
          : section,
      )
    : sections

  if (!dirtyKeys.has("primary_quote")) {
    const primarySection = handoffSections.find((section) => section.key === "primary_quote")
    const parsedPrimary = parseQuoteIntentSection(primarySection?.content ?? "")
    if (parsedPrimary.scope.length === 0 && parsedPrimary.notes.length === 0) {
      const rebuiltPrimary = [
        ...baseQuote.primary_quote.scope.map((item) => `Scope: ${item}`),
        ...baseQuote.primary_quote.notes.map((item) => `Note: ${item}`),
      ].join("\n")
      if (rebuiltPrimary.trim()) {
        handoffSections = handoffSections.map((section) =>
          section.key === "primary_quote" ? { ...section, content: rebuiltPrimary } : section,
        )
      }
    }
  }

  let quote = editableSectionsToProcessedQuote(handoffSections, baseQuote)

  if (usePreviewCustomerScope) {
    quote = {
      ...quote,
      customer_scope: uniqueNonEmptyLines([...quote.customer_scope, ...customerScopeItems]),
    }
  }

  return quote
}

export function editableSectionsToProcessedQuote(
  sections: EditableQuoteSection[],
  baseQuote: ProcessedQuote,
): ProcessedQuote {
  const byKey = new Map(sections.map((section) => [section.key, section.content]))
  const materialsAndGreenwaste = splitLines(byKey.get("materials_greenwaste") ?? "")
  const greenwasteLine = materialsAndGreenwaste.find((item) => item.toLowerCase().startsWith("greenwaste:"))
  const parsedPrimary = parseQuoteIntentSection(byKey.get("primary_quote") ?? "")
  const customerScope = splitLines(byKey.get("customer_scope") ?? "")
  const labourAllowance = byKey.get("labour_allowance")?.trim()

  return {
    ...baseQuote,
    client_name: byKey.get("client_name")?.trim() || baseQuote.client_name,
    site_address: byKey.get("site_address")?.trim() || baseQuote.site_address,
    job_type: byKey.get("job_type")?.trim() || baseQuote.job_type || baseQuote.primary_quote.job_type,
    quote_title: baseQuote.quote_title || byKey.get("job_type")?.trim() || "Generated Quote",
    primary_quote: {
      ...baseQuote.primary_quote,
      quote_title: parsedPrimary.quote_title || baseQuote.primary_quote.quote_title || baseQuote.quote_title,
      job_type: parsedPrimary.job_type || baseQuote.primary_quote.job_type || byKey.get("job_type")?.trim() || "",
      cadence: parsedPrimary.cadence || baseQuote.primary_quote.cadence,
      scope: parsedPrimary.scope.length > 0 ? parsedPrimary.scope : baseQuote.primary_quote.scope,
      notes: parsedPrimary.notes.length > 0 ? parsedPrimary.notes : baseQuote.primary_quote.notes,
    },
    optional_quotes:
      splitLines(byKey.get("optional_quotes") ?? "").length > 0
        ? [
            {
              quote_title: "Optional quote",
              job_type: "",
              scope: splitLines(byKey.get("optional_quotes") ?? ""),
              cadence: "",
              notes: [],
            },
          ]
        : baseQuote.optional_quotes,
    customer_scope: customerScope.length > 0 ? customerScope : baseQuote.customer_scope,
    internal_notes: [...splitLines(byKey.get("internal_notes") ?? ""), ...splitLines(byKey.get("planting_calculator") ?? "")],
    labour_allowance: labourAllowance || baseQuote.labour_allowance,
    materials:
      materialsAndGreenwaste.filter((item) => !item.toLowerCase().startsWith("greenwaste:")).length > 0
        ? materialsAndGreenwaste.filter((item) => !item.toLowerCase().startsWith("greenwaste:"))
        : baseQuote.materials,
    greenwaste: greenwasteLine?.replace(/^greenwaste:\s*/i, "").trim() || baseQuote.greenwaste,
    exclusions: splitLines(byKey.get("exclusions") ?? ""),
    follow_up_tasks: splitLines(byKey.get("follow_up_tasks") ?? ""),
    missing_information: splitLines(byKey.get("missing_information") ?? ""),
    confidence_warnings: splitLines(byKey.get("confidence_warnings") ?? ""),
    selected_template_id: baseQuote.selected_template_id,
    selected_template_name: baseQuote.selected_template_name,
    template_match_confidence: baseQuote.template_match_confidence,
    learned_rules_applied: splitLines(byKey.get("learned_rules_applied") ?? ""),
    plant_calculator_results: baseQuote.plant_calculator_results,
    quote_options: baseQuote.quote_options,
  }
}
