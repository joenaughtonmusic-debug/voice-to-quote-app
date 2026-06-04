export type QuoteLineItem = {
  item_code: string
  item_name: string
  item_type: string
  description: string
  quantity: string
  unit: string
  rate: string
  total: string
  match_confidence: string
  match_reason: string
  needs_review: boolean
}

export type QuoteOption = {
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
  primary_quote: QuoteOption
  optional_quotes: QuoteOption[]
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
}

function lines(items: string[]) {
  return items.join("\n")
}

function quoteOptionLines(option: QuoteOption) {
  return [
    option.quote_title ? `Title: ${option.quote_title}` : "",
    option.job_type ? `Job type: ${option.job_type}` : "",
    option.cadence ? `Cadence: ${option.cadence}` : "",
    ...option.scope.map((item) => `Scope: ${item}`),
    ...option.notes.map((item) => `Note: ${item}`),
  ].filter(Boolean)
}

function matchedLineItemLines(items: QuoteLineItem[]) {
  return items.map((item) =>
    [
      item.item_code ? `${item.item_code} · ${item.item_name}` : item.item_name || item.description || "Unmatched item",
      item.quantity ? `Qty ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : "",
      item.rate ? `Rate ${item.rate}` : "",
      item.total ? `Total ${item.total}` : "",
      item.match_confidence ? `Match ${item.match_confidence}` : "",
      item.match_reason ? `Reason: ${item.match_reason}` : "",
      item.needs_review ? "Needs review" : "",
    ]
      .filter(Boolean)
      .join(" | "),
  )
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function processedQuoteToEditableSections(quote: ProcessedQuote): EditableQuoteSection[] {
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
      content: lines(quoteOptionLines(quote.primary_quote)),
      customer_visible: true,
      internal_visible: true,
      kind: "list",
    },
    {
      key: "optional_quotes",
      title: "Optional / secondary quotes",
      content: lines(quote.optional_quotes.flatMap(quoteOptionLines)),
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
      content: lines(quote.internal_notes),
      customer_visible: false,
      internal_visible: true,
      kind: "list",
    },
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

    return {
      item_code: String(lineItem.item_code ?? ""),
      item_name: String(lineItem.item_name ?? lineItem.label ?? ""),
      item_type: String(lineItem.item_type ?? ""),
      description: String(lineItem.description ?? lineItem.detail ?? ""),
      quantity: String(lineItem.quantity ?? ""),
      unit: String(lineItem.unit ?? ""),
      rate: String(lineItem.rate ?? lineItem.unit_rate ?? ""),
      total: String(lineItem.total ?? lineItem.amount ?? ""),
      match_confidence: String(lineItem.match_confidence ?? ""),
      match_reason: String(lineItem.match_reason ?? lineItem.confidence_note ?? ""),
      needs_review: Boolean(lineItem.needs_review),
    }
  })
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
  }
  const sections = quoteSectionsFromSaved(draft.quote_sections, fallbackQuote)
  const processedQuote = editableSectionsToProcessedQuote(sections, fallbackQuote)

  return {
    rawTranscript: draft.raw_transcript ?? "",
    processedQuote,
    sections,
  }
}

export function editableSectionsToProcessedQuote(
  sections: EditableQuoteSection[],
  baseQuote: ProcessedQuote,
): ProcessedQuote {
  const byKey = new Map(sections.map((section) => [section.key, section.content]))
  const materialsAndGreenwaste = splitLines(byKey.get("materials_greenwaste") ?? "")
  const greenwasteLine = materialsAndGreenwaste.find((item) => item.toLowerCase().startsWith("greenwaste:"))

  return {
    ...baseQuote,
    client_name: byKey.get("client_name")?.trim() ?? "",
    site_address: byKey.get("site_address")?.trim() ?? "",
    job_type: byKey.get("job_type")?.trim() ?? "",
    quote_title: baseQuote.quote_title || byKey.get("job_type")?.trim() || "Generated Quote",
    primary_quote: {
      ...baseQuote.primary_quote,
      quote_title: baseQuote.primary_quote.quote_title || baseQuote.quote_title,
      job_type: baseQuote.primary_quote.job_type || byKey.get("job_type")?.trim() || "",
      notes: splitLines(byKey.get("primary_quote") ?? ""),
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
    customer_scope: splitLines(byKey.get("customer_scope") ?? ""),
    internal_notes: splitLines(byKey.get("internal_notes") ?? ""),
    labour_allowance: byKey.get("labour_allowance")?.trim() ?? "",
    materials: materialsAndGreenwaste.filter((item) => !item.toLowerCase().startsWith("greenwaste:")),
    greenwaste: greenwasteLine?.replace(/^greenwaste:\s*/i, "").trim() ?? "",
    exclusions: splitLines(byKey.get("exclusions") ?? ""),
    follow_up_tasks: splitLines(byKey.get("follow_up_tasks") ?? ""),
    missing_information: splitLines(byKey.get("missing_information") ?? ""),
    confidence_warnings: splitLines(byKey.get("confidence_warnings") ?? ""),
    selected_template_id: baseQuote.selected_template_id,
    selected_template_name: baseQuote.selected_template_name,
    template_match_confidence: baseQuote.template_match_confidence,
    learned_rules_applied: splitLines(byKey.get("learned_rules_applied") ?? ""),
  }
}
