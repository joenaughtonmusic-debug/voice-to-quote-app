import { BULK_MATERIALS, DEFAULT_DELIVERY_ALLOWANCE, WEEDMAT, matchBulkMaterial } from "./materials-prices"
import { DEFAULT_LABOUR_RATE, formatNzd, formatNzd2, lineGst, resolveSimplePricing } from "./pricing"
import type { ProjectArea, SimplePendingLine, SimplePricedLine, SimplePricing, SimpleQuote } from "./types"

/** Single entry point: routes project quotes to the project engine, others to the simple resolver. */
export function resolveQuotePricing(quote: SimpleQuote): SimplePricing {
  return quote.jobType === "project" ? projectPricing(quote) : resolveSimplePricing(quote)
}

/**
 * Deterministic project engine. Rules (Joe's, confirmed 15 Jul 2026):
 * - Labour $80/hr incl. GST (spoken rate wins); customer hours = base × (1 + 15%),
 *   rounded to 2dp, then × rate. Team keeps base hours.
 * - Bulk material m³ = area × depth × 1.10 waste, ordered in 0.5 m³ steps
 *   (pooled across areas into one order).
 * - Weedmat: 0.9m roll when the bed is ≤0.3m wide and one roll's cut strips cover
 *   it; otherwise 1.8m rolls. Pins pooled at one 150-pack per ~15 m² of mat.
 * - Delivery is an ALLOWANCE (editable, flagged) — it is not on any price list.
 * - Plants, disposal, unmatched materials: flagged "price to confirm", excluded
 *   from the total — never silently rolled in.
 */

const WASTE_FACTOR = 1.1
const BULK_ORDER_STEP_M3 = 0.5
export const DEFAULT_CONTINGENCY_PCT = 15
export const DEFAULT_DEPTH_MM = 50
export const DEFAULT_ASSUMED_WIDTH_M = 0.5

/** Fills an assumed width (flagged) so materials can be estimated before Joe measures. */
export function projectAreasWithDefaults(areas: ProjectArea[]): ProjectArea[] {
  return areas.map((area) =>
    area.widthM == null && area.lengthM != null
      ? { ...area, widthM: DEFAULT_ASSUMED_WIDTH_M, widthAssumed: true }
      : area,
  )
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function areaM2(area: ProjectArea): number | null {
  const rect = area.lengthM != null && area.widthM != null ? area.lengthM * area.widthM : null
  const extra = area.extraM2 ?? 0
  if (rect == null && extra === 0) return null
  return round2((rect ?? 0) + extra)
}

export function areaBaseHours(area: ProjectArea): number {
  if (area.blockHours != null && area.blockHours > 0) return area.blockHours
  return round2(area.tasks.reduce((sum, task) => sum + (task.hours ?? 0), 0))
}

export type AreaComputation = {
  area: ProjectArea
  m2: number | null
  baseHours: number
  quotedHours: number
  labour: number
  bulkKey: ReturnType<typeof matchBulkMaterial>
  bulkNeedM3: number | null
  weedmatNeedM2: number | null
  warnings: string[]
}

export type ProjectComputation = {
  areas: AreaComputation[]
  rate: number
  contingencyPct: number
  totalBaseHours: number
  totalQuotedHours: number
  labourLines: SimplePricedLine[]
  materialLines: SimplePricedLine[]
  pendingLines: SimplePendingLine[]
  reviewNotices: string[]
  total: number
  gst: number
}

function computeArea(area: ProjectArea, rate: number, contingencyPct: number): AreaComputation {
  const m2 = areaM2(area)
  const baseHours = areaBaseHours(area)
  const quotedHours = round2(baseHours * (1 + contingencyPct / 100))
  const labour = round2(quotedHours * rate)
  const warnings: string[] = []

  if (area.widthAssumed) warnings.push(`${area.name}: width assumed — measure before ordering materials`)
  if (m2 == null) warnings.push(`${area.name}: no dimensions — materials cannot be calculated`)
  if (baseHours === 0) warnings.push(`${area.name}: no labour hours given`)

  // Material key: the spoken surface material first; else fall back to the task text,
  // EXCLUDING removal tasks ("Remove old scoria" must never set the new surface, but
  // "Sprea[d] pebbles" — typos included — should). Still unmatched but material-ish →
  // loud warning, never a silent miss.
  const nonRemovalText = area.tasks
    .filter((task) => !/\b(remove|removal|dig|clear|excavat|rip|pull)\b/i.test(task.description))
    .map((task) => task.description)
    .join(" ")
  const bulkKey = matchBulkMaterial(area.surfaceMaterial) ?? matchBulkMaterial(nonRemovalText)
  if (area.surfaceMaterial.trim() && !bulkKey) {
    warnings.push(`${area.name}: material "${area.surfaceMaterial}" not on the price list — price to confirm`)
  } else if (!bulkKey && /\b(pebble|mulch|scoria|gap\s*\d|top\s*soil|sand|stone|chip)\b/i.test(nonRemovalText)) {
    warnings.push(`${area.name}: tasks mention a surface material but none is priced — set the material`)
  }

  const bulkNeedM3 = m2 != null && bulkKey ? round2(m2 * (area.depthMm / 1000) * WASTE_FACTOR * 1000) / 1000 : null
  const weedmatNeedM2 = area.needsWeedmat && m2 != null ? round2(m2 * WASTE_FACTOR) : null

  return { area, m2, baseHours, quotedHours, labour, bulkKey, bulkNeedM3, weedmatNeedM2, warnings }
}

export function computeProject(quote: SimpleQuote): ProjectComputation {
  const details = quote.project ?? { areas: [], contingencyPct: DEFAULT_CONTINGENCY_PCT, deliveryAmount: null }
  const rate = quote.spokenRate ?? DEFAULT_LABOUR_RATE
  const contingencyPct = details.contingencyPct
  const areas = details.areas.map((area) => computeArea(area, rate, contingencyPct))

  const labourLines: SimplePricedLine[] = areas
    .filter((entry) => entry.labour > 0)
    .map((entry) => ({ description: `Labour — ${entry.area.name}`, amount: entry.labour, kind: "labour" as const }))

  const materialLines: SimplePricedLine[] = []
  const pendingLines: SimplePendingLine[] = []
  const reviewNotices = areas.flatMap((entry) => entry.warnings)

  // Bulk materials pooled per material into one order (0.5 m³ steps).
  const bulkNeeds = new Map<string, number>()
  for (const entry of areas) {
    if (entry.bulkKey && entry.bulkNeedM3 != null) {
      bulkNeeds.set(entry.bulkKey, (bulkNeeds.get(entry.bulkKey) ?? 0) + entry.bulkNeedM3)
    }
  }
  for (const [key, need] of bulkNeeds) {
    const material = BULK_MATERIALS[key as keyof typeof BULK_MATERIALS]
    const orderM3 = Math.max(BULK_ORDER_STEP_M3, Math.ceil(need / BULK_ORDER_STEP_M3) * BULK_ORDER_STEP_M3)
    materialLines.push({
      description: `${material.label} — ${orderM3} m³`,
      amount: round2(orderM3 * material.sellPerM3),
      kind: "extra",
    })
  }

  // Weedmat rolls computed PER AREA (a crew cuts per bed; pooling strips across
  // separate beds with plants/obstacles undersupplies). Narrow (0.9m) roll for a
  // narrow bed one roll covers; otherwise wide (1.8m) rolls per area. Pins pooled
  // at one 150-pack per ~15 m² of mat.
  let narrowRolls = 0
  let wideRolls = 0
  let totalMatM2 = 0
  for (const entry of areas) {
    if (entry.weedmatNeedM2 == null) continue
    totalMatM2 += entry.weedmatNeedM2
    if ((entry.area.widthM ?? 1) <= WEEDMAT.narrow.widthM / 3 && entry.weedmatNeedM2 <= WEEDMAT.narrow.coverageM2) {
      narrowRolls += 1
    } else {
      wideRolls += Math.ceil(entry.weedmatNeedM2 / WEEDMAT.wide.coverageM2)
    }
  }
  if (narrowRolls > 0) {
    materialLines.push({
      description: `${WEEDMAT.narrow.label}${narrowRolls > 1 ? ` × ${narrowRolls}` : ""}`,
      amount: round2(narrowRolls * WEEDMAT.narrow.sell),
      kind: "extra",
    })
  }
  if (wideRolls > 0) {
    materialLines.push({
      description: `${WEEDMAT.wide.label}${wideRolls > 1 ? ` × ${wideRolls}` : ""}`,
      amount: round2(wideRolls * WEEDMAT.wide.sell),
      kind: "extra",
    })
  }
  if (totalMatM2 > 0) {
    const pinPacks = Math.max(1, Math.ceil(totalMatM2 / WEEDMAT.pins.coverageM2))
    materialLines.push({
      description: `${WEEDMAT.pins.label}${pinPacks > 1 ? ` × ${pinPacks}` : ""}`,
      amount: round2(pinPacks * WEEDMAT.pins.sell),
      kind: "extra",
    })
  }

  // Delivery: an allowance, never a list price — always labelled as such.
  if (details.deliveryAmount != null && details.deliveryAmount > 0) {
    materialLines.push({
      description: "Materials delivery (allowance)",
      amount: details.deliveryAmount,
      kind: "extra",
    })
  }

  // Plants: counted, never priced without a selected species/pot size.
  const totalPlants = details.areas.reduce((sum, area) => sum + (area.plantsCount ?? 0), 0)
  if (totalPlants > 0) {
    pendingLines.push({ description: `Supply of ${totalPlants} plants — species/pot size and price to confirm` })
  }

  // Disposal: any removal/excavation work generates spoil that is not yet priced.
  const hasRemoval = details.areas.some((area) =>
    area.tasks.some((task) => /\b(remove|removal|dig|excavat|clear)\b/i.test(task.description)),
  )
  if (hasRemoval) {
    pendingLines.push({ description: "Disposal of removed material (old weedmat, spoil, stone) — price to confirm" })
  }

  const priced = [...labourLines, ...materialLines]
  const total = round2(priced.reduce((sum, line) => sum + line.amount, 0))
  const gst = round2(priced.reduce((sum, line) => sum + lineGst(line.amount), 0))

  return {
    areas,
    rate,
    contingencyPct,
    totalBaseHours: round2(areas.reduce((sum, entry) => sum + entry.baseHours, 0)),
    totalQuotedHours: round2(areas.reduce((sum, entry) => sum + entry.quotedHours, 0)),
    labourLines,
    materialLines,
    pendingLines,
    reviewNotices,
    total,
    gst,
  }
}

/** Adapts the project computation to the SimplePricing shape the screen already renders. */
export function projectPricing(quote: SimpleQuote): SimplePricing {
  const computation = computeProject(quote)
  const lines = [...computation.labourLines, ...computation.materialLines]

  if (quote.manualTotal != null && quote.manualTotal > 0) {
    const gst = round2(lineGst(quote.manualTotal))
    return {
      labourAmount: quote.manualTotal,
      pricingSource: "manual",
      rateWasDefaulted: false,
      hoursUsed: computation.totalQuotedHours,
      rateUsed: computation.rate,
      lines: [{ description: "Project total (manually entered)", amount: quote.manualTotal, kind: "labour" }],
      pendingLines: computation.pendingLines,
      total: quote.manualTotal,
      gst,
    }
  }

  if (lines.length === 0) {
    return {
      labourAmount: null,
      pricingSource: "unpriced",
      rateWasDefaulted: false,
      hoursUsed: null,
      rateUsed: computation.rate,
      lines: [],
      pendingLines: computation.pendingLines,
      total: null,
      gst: null,
    }
  }

  return {
    labourAmount: round2(computation.labourLines.reduce((sum, line) => sum + line.amount, 0)),
    pricingSource: "computed_rules",
    rateWasDefaulted: false,
    hoursUsed: computation.totalQuotedHours,
    rateUsed: computation.rate,
    lines,
    pendingLines: computation.pendingLines,
    total: computation.total,
    gst: computation.gst,
  }
}

// --- Rendering ---

function cleanTask(description: string) {
  const cleaned = description.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function projectTitle(quote: SimpleQuote) {
  const address = quote.siteAddress.trim()
  return address ? `Garden Improvement Works – ${address}` : "Garden Improvement Works"
}

/** Customer body: per-area scope, no hours, no internal calculations. */
export function renderProjectBody(quote: SimpleQuote): string {
  const details = quote.project
  const paragraphs: string[] = [projectTitle(quote)]

  for (const area of details?.areas ?? []) {
    const tasks = area.tasks.map((task) => cleanTask(task.description)).filter(Boolean)
    // A block-hours area with no task list still gets an honest scope synthesized
    // from its CONFIRMED fields, so the customer never sees an empty section.
    if (tasks.length === 0) {
      tasks.push("Clear and prepare the area")
      if (area.needsWeedmat) tasks.push("Install new weedmat")
      const bulkKey = matchBulkMaterial(area.surfaceMaterial)
      if (bulkKey) tasks.push(`Spread ${BULK_MATERIALS[bulkKey].label.toLowerCase()}`)
    }
    const lines = [`${area.name}:`, ...tasks]
    if ((area.plantsCount ?? 0) > 0) lines.push(`Planting of ${area.plantsCount} plants (selection to be confirmed)`)
    paragraphs.push(lines.join("\n"))
  }

  const closers: string[] = []
  if (quote.greenwaste.treatment === "included") closers.push("All greenwaste removed and disposed of")
  closers.push("Blow down and tidy of work areas on completion")
  paragraphs.push(closers.join("\n"))

  return paragraphs.join("\n\n")
}

/** Internal view: dimensions, hours base→quoted, material workings, notices. */
export function renderProjectInternal(quote: SimpleQuote): string {
  const computation = computeProject(quote)
  const lines: string[] = [
    `Rate $${computation.rate}/hr incl. GST · contingency ${computation.contingencyPct}% (customer hours; team keeps base)`,
    `Hours: ${computation.totalBaseHours} base → ${computation.totalQuotedHours} quoted`,
  ]
  for (const entry of computation.areas) {
    const dims =
      entry.m2 != null
        ? `${entry.m2} m²${entry.area.widthAssumed ? " (WIDTH ASSUMED)" : ""}`
        : "no dimensions"
    lines.push(
      `${entry.area.name}: ${dims} · ${entry.baseHours}h → ${entry.quotedHours}h → ${formatNzd2(entry.labour)}` +
        (entry.bulkNeedM3 != null ? ` · bulk need ${entry.bulkNeedM3} m³` : ""),
    )
  }
  for (const notice of computation.reviewNotices) lines.push(`⚠ ${notice}`)
  for (const note of quote.internalNotes) {
    const cleaned = note.trim()
    if (cleaned) lines.push(cleaned)
  }
  return lines.join("\n")
}

/** Team view: per-area task list with BASE hours (the working allowance). */
export function renderProjectTeam(quote: SimpleQuote): string {
  const details = quote.project
  const sections: string[] = []
  for (const area of details?.areas ?? []) {
    const lines = [`${area.name} — ${areaBaseHours(area)}h allowance:`]
    for (const task of area.tasks) {
      lines.push(`- ${cleanTask(task.description)}${task.hours != null ? ` (${task.hours}h)` : ""}`)
    }
    sections.push(lines.join("\n"))
  }
  return sections.join("\n\n")
}

export { DEFAULT_DELIVERY_ALLOWANCE, formatNzd }
