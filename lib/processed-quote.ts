export type QuoteLineItem = {
  label: string
  detail: string
  quantity: string
  unit_rate: string
  amount: string
  confidence_note: string
}

export type ProcessedQuote = {
  client_name: string
  site_address: string
  quote_title: string
  job_type: string
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

export const EMPTY_PROCESSED_QUOTE: ProcessedQuote = {
  client_name: "",
  site_address: "",
  quote_title: "",
  job_type: "",
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

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function processedQuoteToEditableSections(quote: ProcessedQuote): EditableQuoteSection[] {
  return [
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
    customer_scope: splitLines(byKey.get("customer_scope") ?? ""),
    internal_notes: splitLines(byKey.get("internal_notes") ?? ""),
    labour_allowance: byKey.get("labour_allowance")?.trim() ?? "",
    materials: materialsAndGreenwaste.filter((item) => !item.toLowerCase().startsWith("greenwaste:")),
    greenwaste: greenwasteLine?.replace(/^greenwaste:\s*/i, "").trim() ?? "",
    exclusions: splitLines(byKey.get("exclusions") ?? ""),
    follow_up_tasks: splitLines(byKey.get("follow_up_tasks") ?? ""),
    missing_information: splitLines(byKey.get("missing_information") ?? ""),
    confidence_warnings: splitLines(byKey.get("confidence_warnings") ?? ""),
  }
}
