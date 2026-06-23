import type { ProcessedQuote } from "../processed-quote"
import { customerViewLines, exportViewLines, type QuotePresentationLine, type QuotePresentationModel } from "./index"
import { materialLineIsPriced } from "./planting"

export type PresentationPreviewItem = {
  title: string
  detail?: string
  quantity?: string
  unitPrice?: string
  subtotal?: string
}

export type PresentationPreviewSection = {
  title: string
  items: PresentationPreviewItem[]
}

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeReviewKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function linesForSection(model: QuotePresentationModel, sectionId: string) {
  return customerViewLines(model).filter((line) => line.sectionId === sectionId && line.role !== "review_notice")
}

function findLine(model: QuotePresentationModel, role: QuotePresentationLine["role"]) {
  return customerViewLines(model).find((line) => line.role === role)
}

function plantingSummaryLines(model: QuotePresentationModel) {
  return linesForSection(model, "planting_details")
}

function plantDisplayName(model: QuotePresentationModel) {
  const details = plantingSummaryLines(model)
  const fromDetails = details.find((line) => line.plantName)?.plantName?.trim()
  if (fromDetails) return fromDetails

  const fromOption = linesForSection(model, "plant_options").find((line) => line.plantName)?.plantName?.trim()
  if (fromOption) return fromOption.replace(/\s+\d+(?:\.\d+)?\s*(?:l|litre|litres|m)\b.*$/i, "").trim()

  const fromTitle = linesForSection(model, "plant_options")[0]?.customerTitle
  if (fromTitle) return fromTitle.replace(/\s+\d+(?:\.\d+)?\s*(?:l|litre|litres|m)\b.*$/i, "").trim()

  return null
}

function quoteText(model: QuotePresentationModel) {
  return customerViewLines(model)
    .flatMap((line) => [line.customerTitle, line.customerDescription])
    .filter(Boolean)
    .join(" ")
}

function mentionsRoots(model: QuotePresentationModel) {
  return /\broot/i.test(quoteText(model))
}

function hasPlantingCommercialContent(model: QuotePresentationModel) {
  const details = plantingSummaryLines(model)
  const options = linesForSection(model, "plant_options")
  return (
    options.length > 0 ||
    details.some((line) => Boolean(line.plantName?.trim()) || typeof line.plantingLengthM === "number")
  )
}

function scopeOfWorkItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  if (!hasPlantingCommercialContent(model)) return []

  const plantName = plantDisplayName(model)
  const items: PresentationPreviewItem[] = []

  items.push({
    title: plantName
      ? `Supply and plant ${plantName} hedge to the agreed planting area.`
      : "Supply and plant agreed plants to the agreed planting area.",
  })
  items.push({
    title: "Prepare planting area, dig planting holes, install plants, backfill with garden mix, water in, and tidy on completion.",
  })

  if (mentionsRoots(model)) {
    items.push({
      title: "Allow for additional digging around existing roots where required.",
    })
  }

  return items
}

function plantOptionItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  return linesForSection(model, "plant_options").map((line) => {
    const subtotal = typeof line.subtotal === "number" ? money(line.subtotal) : undefined
    return {
      title: subtotal ? `${line.customerTitle} — ${subtotal}` : line.customerTitle,
    }
  })
}

function materialCustomerTitle(line: QuotePresentationLine): string {
  if (materialLineIsPriced(line)) return `${line.customerTitle} included`
  return `${line.customerTitle} to be allowed for separately`
}

function materialItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  return linesForSection(model, "materials").map((line) => ({
    title: materialCustomerTitle(line),
  }))
}

function labourItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  const lines = linesForSection(model, "labour")
  if (lines.length === 0) return []

  return [{ title: "Planting labour included as described above." }]
}

function optionalWorkSpecificityScore(title: string) {
  let score = 0
  if (/\b\d+\s*x\s*\d+\b/i.test(title)) score += 10
  if (/\b\d+\s*(?:by|x)\s*\d+\b/i.test(title)) score += 8
  if (/\btimber\b/i.test(title)) score += 2
  if (/\bborder\b/i.test(title)) score += 2
  if (/\binstallation\b/i.test(title)) score -= 2
  if (/\blater\b/i.test(title)) score -= 1
  return score
}

function optionalWorkGroupKey(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/, if required$/i, "")
    .replace(/\boptional note for (?:a|an)\s+/i, "")
    .replace(/\bto do later\b/gi, "")
    .replace(/\b(\d+)\s*(?:by|x)\s*(\d+)\b/g, "$1x$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

  if (/\btimber\b/.test(normalized) && /\bborder\b/.test(normalized)) return "timber-border"
  return normalized
}

export function dedupeOptionalWorkTitles(titles: string[]): string[] {
  const bestByGroup = new Map<string, { title: string; score: number }>()

  for (const rawTitle of titles) {
    const title = polishOptionalWork(rawTitle)
    const group = optionalWorkGroupKey(title)
    const score = optionalWorkSpecificityScore(title)
    const existing = bestByGroup.get(group)
    if (!existing || score > existing.score) {
      bestByGroup.set(group, { title, score })
    }
  }

  return Array.from(bestByGroup.values()).map((entry) => entry.title)
}

function optionalWorkItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  const titles = linesForSection(model, "optional_works").map((line) => line.customerTitle)
  return dedupeOptionalWorkTitles(titles).map((title) => ({ title }))
}

function polishOptionalWork(value: string) {
  const cleaned = value
    .replace(/\boptional note for (?:a|an)\s+/i, "")
    .replace(/\bto do later\b/gi, "")
    .replace(/\b(\d+)\s*(?:by|x)\s*(\d+)\b/gi, "$1x$2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+,/g, ",")
    .replace(/[.,]+$/g, "")

  if (!cleaned) return value
  const base = cleaned.replace(/, if required$/i, "").trim()
  return `${base}, if required`
}

function exclusionItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  return linesForSection(model, "exclusions").map((line) => ({
    title: /irrigation/i.test(line.customerTitle) ? "Irrigation not included" : line.customerTitle,
  }))
}

function formatFuzzyPlantMatchNotice(model: QuotePresentationModel, notice: string) {
  const spokenMatch = notice.match(/Spoken name:\s*"([^"]+)"/i)
  const matchedPlant = findLine(model, "plant_option")?.plantName || findLine(model, "planting_summary")?.plantName
  const spoken = spokenMatch?.[1]
  if (spoken && matchedPlant && spoken.toLowerCase() !== matchedPlant.toLowerCase()) {
    return `Plant match was fuzzy: "${spoken}" matched to "${matchedPlant}".`
  }
  if (spoken && matchedPlant) {
    return `Plant match was fuzzy: "${spoken}" matched to "${matchedPlant}".`
  }
  return notice.replace(/^Plant Library match needs review\s*\([^)]+\)\.\s*/i, "Plant match was fuzzy: ")
}

function hasPlantingOptions(model: QuotePresentationModel): boolean {
  return model.lines.some((line) => line.sectionId === "plant_options" && line.role === "plant_option")
}

function hasDeliveryCaptured(model: QuotePresentationModel): boolean {
  if (model.deliveryCaptured) return true

  const text = model.lines
    .flatMap((line) => [line.customerTitle, line.customerDescription ?? "", ...(line.warnings ?? [])])
    .concat(model.reviewNotices)
    .join(" ")
    .toLowerCase()

  return /\b(?:plant\s+)?delivery\b|\bfreight\b|\btransport\b|\bcartage\b|\bdelivery\s+fee\b/.test(text)
}

export function plantingMaterialOptionReviewNotes(quote: Pick<ProcessedQuote, "quote_options">): string[] {
  const notes: string[] = []
  const seen = new Set<string>()

  for (const option of quote.quote_options ?? []) {
    if (option.source !== "trade_calculator" || option.category !== "material") continue
    if (option.areaLabel !== "Planting materials") continue

    if (option.subtotal === 0) {
      const message = "Pricing not configured — review required."
      if (!seen.has(message)) {
        seen.add(message)
        notes.push(message)
      }
    }

    for (const warning of option.warnings ?? []) {
      const cleaned = warning.replace(/\s+/g, " ").trim()
      if (!cleaned || seen.has(cleaned)) continue
      seen.add(cleaned)
      notes.push(cleaned)
    }
  }

  return notes
}

export function mergePlantingInternalReviewNotes(
  presentationNotes: string[],
  quote: Pick<ProcessedQuote, "quote_options">,
): string[] {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const note of [...presentationNotes, ...plantingMaterialOptionReviewNotes(quote)]) {
    const cleaned = note.replace(/\s+/g, " ").trim()
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    merged.push(cleaned)
  }

  return merged
}

export function collectPresentationReviewNotes(model: QuotePresentationModel): string[] {
  const seen = new Set<string>()
  const notes: string[] = []

  function add(note: string) {
    const cleaned = note.replace(/\s+/g, " ").trim()
    const key = normalizeReviewKey(cleaned)
    if (!cleaned || seen.has(key)) return
    seen.add(key)
    notes.push(cleaned)
  }

  const spacingLine = findLine(model, "spacing")
  if (spacingLine?.spacingMm != null && spacingLine.librarySpacingMm != null && spacingLine.spacingMm !== spacingLine.librarySpacingMm) {
    add(
      `Spoken spacing is ${spacingLine.spacingMm}mm. Plant library default is ${spacingLine.librarySpacingMm}mm. Please confirm spacing before sending.`,
    )
  }

  for (const notice of model.reviewNotices) {
    if (/plant match was fuzzy:/i.test(notice)) {
      add(notice)
      continue
    }
    if (/needs review/i.test(notice) && /spoken name/i.test(notice)) {
      add(formatFuzzyPlantMatchNotice(model, notice))
      continue
    }
    if (/differs from plant library default/i.test(notice)) continue
    add(notice)
  }

  for (const line of model.lines) {
    for (const warning of line.warnings ?? []) {
      if (/differs from plant library default/i.test(warning)) continue
      if (/needs review/i.test(warning) && /spoken name/i.test(warning)) {
        add(formatFuzzyPlantMatchNotice(model, warning))
        continue
      }
      if (/no price found near this material/i.test(warning)) {
        add(`${line.customerTitle} rate missing.`)
        continue
      }
      if (/Plant Library match needs review/i.test(warning)) {
        add(formatFuzzyPlantMatchNotice(model, warning))
      }
    }

    if (line.role === "material" && line.reviewRequired && !materialLineIsPriced(line)) {
      add(`${line.customerTitle} rate missing.`)
    }
  }

  if (hasPlantingOptions(model) && !hasDeliveryCaptured(model)) {
    add("Plant delivery fee not captured. Add delivery fee if required.")
  }

  return notes
}

function reviewNoteItems(model: QuotePresentationModel): PresentationPreviewItem[] {
  return collectPresentationReviewNotes(model).map((note) => ({ title: note }))
}

export function buildPresentationInternalReviewNotes(model: QuotePresentationModel): PresentationPreviewSection[] {
  const items = reviewNoteItems(model)
  return items.length > 0 ? [{ title: "Review Notes", items }] : []
}

const CUSTOMER_SECTIONS: Array<{
  title: string
  sectionId: string
  build: (model: QuotePresentationModel) => PresentationPreviewItem[]
}> = [
  { title: "Scope of Work", sectionId: "planting_details", build: scopeOfWorkItems },
  { title: "Planting Options", sectionId: "plant_options", build: plantOptionItems },
  { title: "Materials", sectionId: "materials", build: materialItems },
  { title: "Labour", sectionId: "labour", build: labourItems },
  { title: "Optional Works", sectionId: "optional_works", build: optionalWorkItems },
  { title: "Exclusions", sectionId: "exclusions", build: exclusionItems },
]

export function buildPresentationCustomerPreview(model: QuotePresentationModel): PresentationPreviewSection[] {
  return CUSTOMER_SECTIONS.map(({ title, build }) => {
    const items = build(model)
    return items.length > 0 ? { title, items } : null
  }).filter((section): section is PresentationPreviewSection => section !== null)
}

export function isUsablePlantingCustomerQuote(sections: PresentationPreviewSection[]) {
  const scopeOfWork = sections.find((section) => section.title === "Scope of Work")
  const plantingOptions = sections.find((section) => section.title === "Planting Options")
  return Boolean(scopeOfWork?.items.length || plantingOptions?.items.length)
}

export function renderPresentationCustomerPreviewText(model: QuotePresentationModel): string {
  return renderPlantingCustomerQuoteText(buildPresentationCustomerPreview(model))
}

export function renderPlantingCustomerQuoteText(sections: PresentationPreviewSection[]): string {
  return sections
    .flatMap((section) => [
      section.title,
      ...section.items.flatMap((item) => {
        const lines = [item.title]
        if (item.detail && item.detail !== item.title) lines.push(item.detail)
        return lines
      }),
    ])
    .join("\n")
}

export function presentationModelRetainsExportMetadata(model: QuotePresentationModel) {
  const exportLines = exportViewLines(model)
  return exportLines.some((line) => typeof line.unitPrice === "number" && typeof line.subtotal === "number")
}

export function presentationModelRetainsInternalPlantingCalculations(model: QuotePresentationModel) {
  const lines = model.lines
  return (
    lines.some((line) => typeof line.plantingLengthM === "number") &&
    lines.some((line) => typeof line.spacingMm === "number") &&
    lines.some((line) => typeof line.plantCount === "number") &&
    lines.some((line) => typeof line.unitPrice === "number")
  )
}
