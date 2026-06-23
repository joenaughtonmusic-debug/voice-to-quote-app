import { associateMaterialPrices } from "../core/material-price-association"
import type { CustomerQuotePreview } from "../customer-quote-preview"
import type { ProcessedQuote } from "../processed-quote"
import type { QuoteOption } from "../quote-options"
import type {
  QuotePresentationLine,
  QuotePresentationLineRole,
  QuotePresentationLineSource,
  QuotePresentationModel,
  QuotePresentationSection,
} from "./types"

export type PlantingPresentationInput = {
  quote: ProcessedQuote
  rawTranscript?: string | null
  customerPreview?: CustomerQuotePreview
}

const PLANTING_SECTIONS: QuotePresentationSection[] = [
  { sectionId: "planting_details", title: "Planting Details", kind: "planting_details" },
  { sectionId: "plant_options", title: "Planting Options", kind: "plant_options" },
  { sectionId: "materials", title: "Materials", kind: "materials" },
  { sectionId: "labour", title: "Labour", kind: "labour" },
  { sectionId: "optional_works", title: "Optional Works", kind: "optional_works" },
  { sectionId: "exclusions", title: "Exclusions", kind: "exclusions" },
  { sectionId: "review", title: "Review", kind: "review" },
]

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function quoteText(quote: ProcessedQuote, rawTranscript?: string | null) {
  return [
    rawTranscript ?? "",
    quote.labour_allowance,
    ...(quote.materials ?? []),
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote.scope ?? []),
    ...(quote.primary_quote.notes ?? []),
    ...(quote.follow_up_tasks ?? []),
    ...(quote.internal_notes ?? []),
  ].join("\n")
}

function librarySpacingMm(result: NonNullable<ProcessedQuote["plant_calculator_results"]>[number]) {
  return (
    result.library_match?.default_spacing_mm ??
    result.options.find((option) => typeof option.spacing_mm === "number" && option.spacing_mm > 0)?.spacing_mm ??
    null
  )
}

function spacingConflictWarnings(
  spacingMm: number | null | undefined,
  spacingSource: string | undefined,
  librarySpacing: number | null,
) {
  if (
    spacingSource === "spoken" &&
    typeof spacingMm === "number" &&
    Number.isFinite(spacingMm) &&
    typeof librarySpacing === "number" &&
    Number.isFinite(librarySpacing) &&
    spacingMm !== librarySpacing
  ) {
    return [
      `Spoken spacing (${spacingMm}mm) differs from plant library default (${librarySpacing}mm). Review plant count.`,
    ]
  }

  return []
}

function pushLine(
  lines: QuotePresentationLine[],
  line: Omit<QuotePresentationLine, "customerVisible"> & { customerVisible?: boolean },
) {
  lines.push({
    customerVisible: true,
    ...line,
  })
}

function plantingDetailsLines(
  quote: ProcessedQuote,
  reviewNotices: string[],
): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []

  for (const [index, result] of (quote.plant_calculator_results ?? []).entries()) {
    const librarySpacing = librarySpacingMm(result)
    const conflictWarnings = spacingConflictWarnings(result.spacing_mm, result.spacing_source, librarySpacing)
    for (const notice of conflictWarnings) {
      if (!reviewNotices.includes(notice)) reviewNotices.push(notice)
    }

    if (typeof result.length_m === "number" && Number.isFinite(result.length_m)) {
      pushLine(lines, {
        lineId: `planting-length-${index}`,
        sectionId: "planting_details",
        role: "planting_summary",
        customerTitle: "Planting length",
        customerDescription: `${result.length_m}m`,
        plantingLengthM: result.length_m,
        source: "plant_calculator",
        sourceRef: `plant_calculator_results[${index}]`,
      })
    }

    const spokenPlantName = result.plant_name?.trim()
    const libraryPlantName = result.library_match?.plant_name?.trim()
    const displayPlantName = libraryPlantName || spokenPlantName
    if (displayPlantName) {
      if (
        spokenPlantName &&
        libraryPlantName &&
        spokenPlantName.toLowerCase() !== libraryPlantName.toLowerCase()
      ) {
        const notice = `Plant match was fuzzy: "${spokenPlantName}" matched to "${libraryPlantName}".`
        if (!reviewNotices.includes(notice)) reviewNotices.push(notice)
      }

      pushLine(lines, {
        lineId: `plant-name-${index}`,
        sectionId: "planting_details",
        role: "planting_summary",
        customerTitle: "Plant",
        customerDescription: displayPlantName,
        plantName: displayPlantName,
        source: "plant_calculator",
        sourceRef: `plant_calculator_results[${index}]`,
      })
    }

    if (typeof result.spacing_mm === "number" && Number.isFinite(result.spacing_mm)) {
      pushLine(lines, {
        lineId: `planting-spacing-${index}`,
        sectionId: "planting_details",
        role: "spacing",
        customerTitle: "Plant spacing",
        customerDescription: `${result.spacing_mm}mm (${result.spacing_source ?? "unknown"})`,
        spacingMm: result.spacing_mm,
        spacingSource: result.spacing_source,
        spokenSpacingMm: result.spacing_source === "spoken" ? result.spacing_mm : null,
        librarySpacingMm: librarySpacing,
        reviewRequired: conflictWarnings.length > 0,
        warnings: conflictWarnings,
        source: "plant_calculator",
        sourceRef: `plant_calculator_results[${index}]`,
      })
    }

    if (typeof result.plant_count === "number" && Number.isFinite(result.plant_count)) {
      pushLine(lines, {
        lineId: `plant-count-summary-${index}`,
        sectionId: "planting_details",
        role: "planting_summary",
        customerTitle: "Plant count",
        customerDescription: `${result.plant_count} plants`,
        plantCount: result.plant_count,
        source: "plant_calculator",
        sourceRef: `plant_calculator_results[${index}]`,
      })
    }

    for (const warning of result.warnings ?? []) {
      const notice = warning.message
      if (!reviewNotices.includes(notice)) reviewNotices.push(notice)
    }
  }

  return lines
}

function plantOptionLines(quote: ProcessedQuote): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []
  const plantingOptions = (quote.quote_options ?? []).filter((option) => option.category === "planting")

  for (const option of plantingOptions) {
    if (option.lineItems.length === 0) {
      pushLine(lines, {
        lineId: `${option.id}-unpriced`,
        sectionId: "plant_options",
        role: "plant_option",
        customerTitle: option.title,
        customerDescription: option.description,
        reviewRequired: true,
        warnings: option.warnings ?? ["Plant option is not priced"],
        source: "quote_option",
        sourceRef: option.id,
        exportable: false,
      })
      continue
    }

    for (const [lineIndex, lineItem] of option.lineItems.entries()) {
      const hasPrice =
        typeof lineItem.unitPrice === "number" &&
        Number.isFinite(lineItem.unitPrice) &&
        typeof lineItem.total === "number" &&
        Number.isFinite(lineItem.total)

      pushLine(lines, {
        lineId: `${option.id}-line-${lineIndex}`,
        sectionId: "plant_options",
        role: "plant_option",
        customerTitle: option.title,
        customerDescription:
          option.description ??
          (hasPrice ? `${lineItem.quantity} x ${money(lineItem.unitPrice)} = ${money(lineItem.total)}` : undefined),
        quantity: lineItem.quantity,
        unit: lineItem.unit,
        unitPrice: lineItem.unitPrice,
        subtotal: lineItem.total,
        plantCount: lineItem.quantity,
        plantName: lineItem.itemName,
        reviewRequired: !hasPrice,
        warnings: option.warnings,
        source: "quote_option",
        sourceRef: option.id,
        itemCode: lineItem.itemCode,
        sourceItemId: lineItem.sourceItemId,
        accountCode: lineItem.accountCode,
        salesAccountCode: lineItem.salesAccountCode,
        taxCode: lineItem.taxCode,
        taxType: lineItem.taxType,
        exportable: hasPrice,
      })
    }
  }

  if (plantingOptions.length === 0) {
    for (const [resultIndex, result] of (quote.plant_calculator_results ?? []).entries()) {
      for (const [optionIndex, group] of result.option_groups.entries()) {
        const hasPrice =
          typeof group.unit_sell_price === "number" &&
          Number.isFinite(group.unit_sell_price) &&
          typeof group.plant_total === "number" &&
          Number.isFinite(group.plant_total)

        pushLine(lines, {
          lineId: `plant-calculator-${resultIndex}-option-${optionIndex}`,
          sectionId: "plant_options",
          role: "plant_option",
          customerTitle: [group.plant_name, group.plant_size || group.pot_size].filter(Boolean).join(" "),
          customerDescription: group.option_label,
          quantity: group.plant_count,
          unit: "each",
          unitPrice: group.unit_sell_price,
          subtotal: group.plant_total,
          plantCount: group.plant_count,
          plantName: group.plant_name,
          reviewRequired: !hasPrice,
          warnings: group.warnings?.map((warning) => warning.message),
          source: "plant_calculator",
          sourceRef: `plant_calculator_results[${resultIndex}].option_groups[${optionIndex}]`,
          itemCode: group.item_code,
          sourceItemId: group.item_code,
          accountCode: group.account_code,
          salesAccountCode: group.sales_account_code,
          taxCode: group.tax_code,
          taxType: group.tax_type,
          exportable: hasPrice,
        })
      }
    }
  }

  return lines
}

const GARDEN_MIX_PATTERN =
  /\b(?:garden|planting)\s+(?:soil\s+)?mix\b|\bplanting\s+mix\b|\bgarden\s+mix\b/i

function normalizeMaterialLabel(text: string): string | null {
  if (GARDEN_MIX_PATTERN.test(text)) return "Garden mix"
  if (/\bmulch\b/i.test(text)) return "Mulch"
  return null
}

function parseLineItemRate(item: ProcessedQuote["line_items"][number]): number | null {
  for (const candidate of [item.final_rate_used, item.knowledge_base_rate, item.override_rate, item.rate]) {
    if (candidate == null || candidate === "") continue
    const parsed = Number(String(candidate).replace(/[^\d.]/g, ""))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function parseLineItemQuantity(item: ProcessedQuote["line_items"][number]): number | null {
  const raw = item.quantity?.trim()
  if (!raw) return null
  const parsed = Number(raw.replace(/[^\d.]/g, ""))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function materialLineIsPriced(line: QuotePresentationLine): boolean {
  if (typeof line.subtotal === "number" && Number.isFinite(line.subtotal) && line.subtotal > 0) return true
  if (typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice) && line.unitPrice > 0) return true
  return false
}

function finalizeMaterialLine(line: QuotePresentationLine): QuotePresentationLine {
  const subtotal =
    line.subtotal ??
    (line.unitPrice != null && line.quantity != null ? line.unitPrice * line.quantity : null)
  const priced = materialLineIsPriced({ ...line, subtotal })
  const warnings = priced
    ? (line.warnings ?? []).filter((warning) => !/no price found near this material/i.test(warning))
    : line.warnings

  return {
    ...line,
    subtotal,
    warnings,
    reviewRequired: !priced,
    exportable: priced,
  }
}

function quoteCapturesDelivery(quote: ProcessedQuote, rawTranscript?: string | null): boolean {
  const text = [
    ...(quote.materials ?? []),
    ...(quote.customer_scope ?? []),
    ...quote.line_items.flatMap((item) => [item.item_name, item.description, item.match_reason]),
    rawTranscript ?? "",
  ].join(" ")

  return /\b(?:plant\s+)?delivery\b|\bfreight\b|\btransport\b|\bcartage\b|\bdelivery\s+fee\b/i.test(text)
}

function parseMaterialQuantity(text: string) {
  const match = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(bags?|m3|m³|cubic\s+metres?|cubic\s+meters?|loads?|trailer\s+loads?)\b/i)
  if (!match) return { quantity: null as number | null, unit: undefined as string | undefined, detail: undefined as string | undefined }

  const wordToNumber: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  }

  const rawQuantity = match[1].toLowerCase()
  const quantity = wordToNumber[rawQuantity] ?? Number(rawQuantity)
  const unit = match[2].toLowerCase().replace(/\s+/g, " ")
  const detail = Number.isFinite(quantity) ? `${quantity} ${unit}` : undefined

  return {
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit,
    detail,
  }
}

function processedQuoteMaterialLines(quote: ProcessedQuote): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []
  const seen = new Set<string>()
  const sourceItems = [
    ...(quote.materials ?? []),
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote.scope ?? []),
  ]

  for (const [index, item] of sourceItems.entries()) {
    const label = normalizeMaterialLabel(item)
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())

    const parsed = parseMaterialQuantity(item)
    pushLine(lines, {
      lineId: `processed-material-${index}`,
      sectionId: "materials",
      role: "material",
      customerTitle: label,
      customerDescription: parsed.detail ?? item,
      quantity: parsed.quantity,
      unit: parsed.unit,
      source: "processed_quote",
      sourceRef: `materials[${index}]`,
      exportable: false,
    })
  }

  return lines
}

function materialAssociationLines(quote: ProcessedQuote, rawTranscript?: string | null): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []
  const text = quoteText(quote, rawTranscript)
  const seen = new Set<string>()

  const candidates = [
    {
      id: "garden-mix",
      description: "Garden mix",
      aliases: ["garden mix", "planting mix", "garden soil mix", "planting soil mix"],
    },
    { id: "mulch", description: "Mulch", aliases: ["mulch"] },
  ]

  for (const candidate of candidates) {
    const [association] = associateMaterialPrices(text, [candidate])
    if (!association || association.confidence === "none") continue

    const key = candidate.id
    if (seen.has(key)) continue
    seen.add(key)

    const quantityText =
      typeof association.quantity === "number" && Number.isFinite(association.quantity)
        ? `${association.quantity}${association.unit ? ` ${association.unit}` : ""}`
        : undefined

    const unitPrice = association.unitAmount ?? null
    const quantity = association.quantity ?? null
    const subtotal =
      association.totalAmount ??
      (unitPrice != null && quantity != null ? unitPrice * quantity : null)

    pushLine(lines, {
      lineId: `material-${candidate.id}`,
      sectionId: "materials",
      role: "material",
      customerTitle: candidate.description,
      customerDescription: quantityText,
      quantity,
      unit: association.unit,
      unitPrice,
      subtotal,
      reviewRequired: unitPrice == null,
      warnings: association.warning ? [association.warning] : undefined,
      source: "material_association",
      sourceRef: candidate.id,
      exportable: unitPrice != null,
    })
  }

  return lines
}

function resolverMaterialLines(quote: ProcessedQuote): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []
  const seen = new Set<string>()

  for (const [index, item] of quote.line_items.entries()) {
    const text = [item.item_name, item.description, item.item_code, item.match_reason].join(" ")
    const label = normalizeMaterialLabel(text)
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())

    const quantity = parseLineItemQuantity(item)
    const unitPrice = parseLineItemRate(item)
    const parsedTotal = item.total ? Number(String(item.total).replace(/[^\d.]/g, "")) : null
    const subtotal =
      parsedTotal != null && Number.isFinite(parsedTotal) && parsedTotal > 0
        ? parsedTotal
        : unitPrice != null && quantity != null
          ? unitPrice * quantity
          : null

    pushLine(lines, {
      lineId: `line-item-material-${index}`,
      sectionId: "materials",
      role: "material",
      customerTitle: label,
      customerDescription: item.quantity?.trim() || undefined,
      quantity,
      unit: item.unit || undefined,
      unitPrice,
      subtotal,
      reviewRequired: unitPrice == null,
      warnings: item.warning ? [item.warning] : undefined,
      source: "line_item",
      sourceRef: item.item_code || String(index),
      itemCode: item.item_code,
      sourceItemId: item.source_item_id,
      accountCode: item.account_code,
      salesAccountCode: item.sales_account_code,
      taxCode: item.tax_code,
      taxType: item.tax_type,
      exportable: Boolean(unitPrice != null && (quantity != null || subtotal != null)),
    })
  }

  return lines
}

function previewMaterialLines(customerPreview?: CustomerQuotePreview): QuotePresentationLine[] {
  if (!customerPreview) return []

  return customerPreview.materialLines.map((line) => ({
    lineId: `preview-material-${line.id}`,
    sectionId: "materials",
    role: "material" as QuotePresentationLineRole,
    customerTitle: line.label,
    customerDescription: line.detail,
    customerVisible: true,
    quantity: line.detail ? Number(line.detail.replace(/[^\d.]/g, "")) || null : null,
    subtotal: line.amount ? Number(line.amount.replace(/[^\d.]/g, "")) || null : null,
    source: "customer_preview" as QuotePresentationLineSource,
    sourceRef: line.id,
    exportable: Boolean(line.amount),
  }))
}

function mergeMaterialLines(...groups: QuotePresentationLine[][]): QuotePresentationLine[] {
  const merged = new Map<string, QuotePresentationLine>()

  for (const group of groups) {
    for (const line of group) {
      const key = line.customerTitle.toLowerCase()
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, line)
        continue
      }

      merged.set(key, {
        ...existing,
        ...line,
        quantity: line.quantity ?? existing.quantity,
        unit: line.unit ?? existing.unit,
        unitPrice: line.unitPrice ?? existing.unitPrice,
        subtotal: line.subtotal ?? existing.subtotal,
        itemCode: line.itemCode ?? existing.itemCode,
        sourceItemId: line.sourceItemId ?? existing.sourceItemId,
        accountCode: line.accountCode ?? existing.accountCode,
        taxCode: line.taxCode ?? existing.taxCode,
        warnings: [...(existing.warnings ?? []), ...(line.warnings ?? [])],
        reviewRequired: existing.reviewRequired || line.reviewRequired,
        exportable: existing.exportable || line.exportable,
      })
    }
  }

  return Array.from(merged.values()).map(finalizeMaterialLine)
}

function labourLines(quote: ProcessedQuote, customerPreview?: CustomerQuotePreview): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []

  if (quote.labour_allowance.trim()) {
    pushLine(lines, {
      lineId: "labour-allowance",
      sectionId: "labour",
      role: "labour",
      customerTitle: "Labour allowance",
      customerDescription: quote.labour_allowance.trim(),
      source: "processed_quote",
      sourceRef: "labour_allowance",
      exportable: false,
    })
  }

  if (customerPreview?.labourLine) {
    const amount = customerPreview.labourLine.amount
      ? Number(customerPreview.labourLine.amount.replace(/[^\d.]/g, "")) || null
      : null
    pushLine(lines, {
      lineId: "labour-preview",
      sectionId: "labour",
      role: "labour",
      customerTitle: customerPreview.labourLine.label,
      customerDescription: customerPreview.labourLine.amount,
      subtotal: amount,
      source: "customer_preview",
      sourceRef: customerPreview.labourLine.id,
      exportable: amount != null,
    })
  }

  for (const [index, item] of quote.line_items.entries()) {
    if (!/\blabou?r\b/i.test([item.item_name, item.description, item.item_type].join(" "))) continue
    pushLine(lines, {
      lineId: `labour-line-item-${index}`,
      sectionId: "labour",
      role: "labour",
      customerTitle: item.item_name || item.description || "Labour",
      customerDescription: item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : undefined,
      quantity: item.quantity ? Number(item.quantity.replace(/[^\d.]/g, "")) || null : null,
      unit: item.unit || undefined,
      unitPrice: item.final_rate_used ? Number(item.final_rate_used) : null,
      subtotal: item.total ? Number(item.total) : null,
      reviewRequired: item.needs_review,
      warnings: item.warning ? [item.warning] : undefined,
      source: "line_item",
      sourceRef: item.item_code || String(index),
      itemCode: item.item_code,
      sourceItemId: item.source_item_id,
      accountCode: item.account_code,
      taxCode: item.tax_code,
      exportable: Boolean(item.total),
    })
  }

  return lines
}

function normalizeOptionalWorkKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\boptional note for (?:a|an)\s+/g, "")
    .replace(/\bto do later\b/g, "")
    .replace(/\b(\d+)\s*(?:by|x)\s*(\d+)\b/g, "$1x$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function optionalWorkLines(quote: ProcessedQuote, rawTranscript?: string | null): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []
  const tasks = [...(quote.follow_up_tasks ?? [])]
  const seen = new Set(tasks.map(normalizeOptionalWorkKey))

  const optionalTranscriptMatches = (rawTranscript ?? "").match(
    /\boptional(?:\s+note|\s+works?)?[^.!?]*[.!?]/gi,
  )
  if (optionalTranscriptMatches) {
    for (const match of optionalTranscriptMatches) {
      const cleaned = match.replace(/\s+/g, " ").trim()
      const key = normalizeOptionalWorkKey(cleaned)
      if (cleaned && key && !seen.has(key)) {
        seen.add(key)
        tasks.push(cleaned)
      }
    }
  }

  for (const [index, task] of tasks.entries()) {
    pushLine(lines, {
      lineId: `optional-work-${index}`,
      sectionId: "optional_works",
      role: "optional_work",
      customerTitle: task,
      optional: true,
      reviewRequired: true,
      source: quote.follow_up_tasks.includes(task) ? "processed_quote" : "transcript",
      sourceRef: `follow_up_tasks[${index}]`,
      exportable: false,
    })
  }

  for (const [index, optionalQuote] of quote.optional_quotes.entries()) {
    for (const [scopeIndex, scopeLine] of optionalQuote.scope.entries()) {
      pushLine(lines, {
        lineId: `optional-quote-${index}-${scopeIndex}`,
        sectionId: "optional_works",
        role: "optional_work",
        customerTitle: scopeLine,
        optional: true,
        reviewRequired: true,
        source: "processed_quote",
        sourceRef: `optional_quotes[${index}].scope[${scopeIndex}]`,
        exportable: false,
      })
    }
  }

  return lines
}

function exclusionLines(quote: ProcessedQuote): QuotePresentationLine[] {
  return quote.exclusions.map((exclusion, index) => ({
    lineId: `exclusion-${index}`,
    sectionId: "exclusions",
    role: "exclusion" as QuotePresentationLineRole,
    customerTitle: exclusion,
    customerVisible: true,
    source: "processed_quote" as QuotePresentationLineSource,
    sourceRef: `exclusions[${index}]`,
    exportable: false,
  }))
}

function reviewNoticeLines(reviewNotices: string[]): QuotePresentationLine[] {
  return reviewNotices.map((notice, index) => ({
    lineId: `review-notice-${index}`,
    sectionId: "review",
    role: "review_notice" as QuotePresentationLineRole,
    customerTitle: notice,
    customerVisible: false,
    reviewRequired: true,
    warnings: [notice],
    source: "processed_quote" as QuotePresentationLineSource,
    sourceRef: `reviewNotices[${index}]`,
    exportable: false,
  }))
}

function activeSections(lines: QuotePresentationLine[]): QuotePresentationSection[] {
  const sectionIds = new Set(lines.map((line) => line.sectionId))
  return PLANTING_SECTIONS.filter((section) => sectionIds.has(section.sectionId))
}

export function buildPlantingPresentationModel(input: PlantingPresentationInput): QuotePresentationModel {
  const { quote, rawTranscript, customerPreview } = input
  const reviewNotices = [...(quote.confidence_warnings ?? []), ...(quote.missing_information ?? [])]

  const lines = [
    ...plantingDetailsLines(quote, reviewNotices),
    ...plantOptionLines(quote),
    ...mergeMaterialLines(
      processedQuoteMaterialLines(quote),
      materialAssociationLines(quote, rawTranscript),
      resolverMaterialLines(quote),
      previewMaterialLines(customerPreview),
    ),
    ...labourLines(quote, customerPreview),
    ...optionalWorkLines(quote, rawTranscript),
    ...exclusionLines(quote),
    ...reviewNoticeLines(reviewNotices),
  ]

  return {
    workflow: "planting",
    title: quote.quote_title || quote.primary_quote.quote_title || "Planting Quote",
    clientName: quote.client_name,
    siteAddress: quote.site_address,
    sections: activeSections(lines),
    lines,
    reviewNotices,
    deliveryCaptured: quoteCapturesDelivery(quote, rawTranscript),
  }
}

export function isPlantingWorkflow(quote: ProcessedQuote) {
  const text = [
    quote.job_type,
    quote.quote_title,
    quote.primary_quote.job_type,
    quote.primary_quote.quote_title,
    ...(quote.customer_scope ?? []),
    ...(quote.primary_quote.scope ?? []),
  ].join(" ")

  const hasPlantCalculator = (quote.plant_calculator_results ?? []).some(
    (result) => result.plant_name || result.plant_count || result.length_m,
  )
  const hasPlantOptions = (quote.quote_options ?? []).some((option) => option.category === "planting")

  return (
    hasPlantCalculator ||
    hasPlantOptions ||
    /\b(planting|hedge\s+planting|plant\s+install|plant\s+supply)\b/i.test(text)
  )
}

export function plantingOptionCount(options: QuoteOption[] | undefined) {
  return (options ?? []).filter((option) => option.category === "planting").length
}
