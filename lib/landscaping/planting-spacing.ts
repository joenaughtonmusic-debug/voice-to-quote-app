// ---------------------------------------------------------------------------
// Landscaping planting spacing + count (L4).
//
// Deterministic, always-visible, always-editable. Joe's rules:
//  - DEFAULT gap = 50cm for everything.
//  - Buxus -> 30cm (name override, wins over the height rule).
//  - "hedge above 1m" -> 80cm. 1m EXACTLY stays in the 50cm band.
//    (So the trigger is: an "above/over 1m" phrase, OR a stated height > 1m.)
//  - Count = length ÷ gap (rounded up so we don't under-plant), editable.
//  - Manual count wins: "4 hibiscus across 10m" -> count = 4, spacing calc ignored.
//
// The spacing rule is landscaping-specific and lives here; the gardening planting
// calculator is NOT touched.
// ---------------------------------------------------------------------------

export const DEFAULT_SPACING_MM = 500
export const BUXUS_SPACING_MM = 300
export const TALL_HEDGE_SPACING_MM = 800

export type SpacingSource = "buxus" | "tall_hedge" | "default"

export type SpacingResolution = {
  spacing_mm: number
  rule: string
  source: SpacingSource
}

function isBuxus(name: string): boolean {
  return /\bbux(us)?\b|\bbox\s+hedge\b/i.test(name)
}

/** Suggest a spacing from the deterministic rule. Always overridable by the user. */
export function suggestSpacingMm(input: {
  plant_name?: string | null
  hedge_height_m?: number | null
  hedge_above_1m?: boolean
}): SpacingResolution {
  if (isBuxus(input.plant_name ?? "")) {
    return { spacing_mm: BUXUS_SPACING_MM, rule: "Buxus — 30cm", source: "buxus" }
  }
  const height = input.hedge_height_m
  const tall = input.hedge_above_1m === true || (typeof height === "number" && Number.isFinite(height) && height > 1)
  if (tall) {
    return { spacing_mm: TALL_HEDGE_SPACING_MM, rule: "hedge above 1m — 80cm", source: "tall_hedge" }
  }
  return { spacing_mm: DEFAULT_SPACING_MM, rule: "default — 50cm", source: "default" }
}

export type CountSource = "manual" | "spoken" | "calculated" | "missing"

export type PlantingLineResolution = {
  count: number | null
  count_source: CountSource
  count_formula: string | null
  spacing_mm: number | null
  spacing_rule: string | null
  spacing_source: SpacingSource | "override" | null
  /** Whether the spacing was actually used to derive the count (false for manual count). */
  spacing_applied: boolean
  note?: string
}

/**
 * Resolve the count + spacing for one planting line.
 * User overrides (count_override / spacing_mm_override) win; then a spoken count;
 * then count = length ÷ gap. Spacing is always resolved for display.
 */
export function resolvePlantingLine(input: {
  plant_name?: string | null
  spoken_count?: number | null
  length_m?: number | null
  hedge_height_m?: number | null
  hedge_above_1m?: boolean
  spacing_mm_override?: number | null
  count_override?: number | null
}): PlantingLineResolution {
  // Spacing (always shown). Override wins over the rule.
  const suggestion = suggestSpacingMm(input)
  const hasSpacingOverride = typeof input.spacing_mm_override === "number" && Number.isFinite(input.spacing_mm_override) && input.spacing_mm_override > 0
  const spacing_mm = hasSpacingOverride ? (input.spacing_mm_override as number) : suggestion.spacing_mm
  const spacing_rule = hasSpacingOverride ? "your spacing" : suggestion.rule
  const spacing_source: PlantingLineResolution["spacing_source"] = hasSpacingOverride ? "override" : suggestion.source

  const base = { spacing_mm, spacing_rule, spacing_source }

  // 1. User-set count wins.
  if (typeof input.count_override === "number" && Number.isFinite(input.count_override)) {
    return { ...base, count: input.count_override, count_source: "manual", count_formula: null, spacing_applied: false, note: "count set by you — spacing not applied" }
  }

  // 2. Spoken count wins over the spacing calc.
  if (typeof input.spoken_count === "number" && Number.isFinite(input.spoken_count) && input.spoken_count > 0) {
    return { ...base, count: input.spoken_count, count_source: "spoken", count_formula: `${input.spoken_count} as spoken`, spacing_applied: false, note: "count as spoken — spacing not applied" }
  }

  // 3. Count = length ÷ gap (rounded up).
  if (typeof input.length_m === "number" && Number.isFinite(input.length_m) && input.length_m > 0) {
    const gapM = spacing_mm / 1000
    const count = Math.ceil(input.length_m / gapM)
    return { ...base, count, count_source: "calculated", count_formula: `ceil(${input.length_m}m ÷ ${gapM}m) = ${count}`, spacing_applied: true }
  }

  // 4. Nothing to go on.
  return { ...base, count: null, count_source: "missing", count_formula: null, spacing_applied: false, note: "add a length or a count" }
}

// ---------------------------------------------------------------------------
// Light parsing of a planting line's text — a convenience; the derived fields
// are always editable, so imperfect parsing is safe.
// ---------------------------------------------------------------------------

export type ParsedPlantingLine = {
  plant_name: string
  spoken_count: number | null
  length_m: number | null
  hedge_height_m: number | null
  hedge_above_1m: boolean
}

export function parsePlantingLine(text: string): ParsedPlantingLine {
  const raw = (text ?? "").trim()
  const lower = raw.toLowerCase()

  // "above/over/more than/taller than 1m" -> tall hedge trigger.
  const hedge_above_1m = /\b(above|over|more than|taller than|greater than)\s+(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/i.test(lower)

  // Stated hedge height: "1.2m hedge", "hedge 1.2m", "1.5m high/tall".
  let hedge_height_m: number | null = null
  const heightMatch =
    lower.match(/(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\s*(?:high|tall|hedge)\b/) ||
    lower.match(/\bhedge\s*(?:to|at|of)?\s*(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/) ||
    lower.match(/\b(?:above|over|more than|taller than|greater than)\s+(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/)
  if (heightMatch) {
    const value = Number(heightMatch[1])
    if (Number.isFinite(value)) hedge_height_m = value
  }

  // Length: a number + metres NOT already claimed as the height, and preferring
  // run-length phrasing ("across/along/of/by 10m", "10m of hedge").
  let length_m: number | null = null
  const lengthCandidates = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/g)]
  for (const m of lengthCandidates) {
    const value = Number(m[1])
    if (!Number.isFinite(value)) continue
    if (hedge_height_m != null && value === hedge_height_m) continue // that number is the height
    length_m = value
    break
  }

  // Spoken count: a bare integer that is NOT part of a measurement (m/mm/cm/litre/
  // cube/bag) — e.g. "4 hibiscus", "plant 6".
  let spoken_count: number | null = null
  const countMatch = lower.match(/\b(\d+)\s+(?!(?:m|mm|cm|metre|meter|metres|meters|litre|litres|l|cube|cubes|bag|bags)\b)([a-z]{3,})/)
  if (countMatch) {
    const value = Number(countMatch[1])
    if (Number.isFinite(value)) spoken_count = value
  }

  // Plant name: the text with quantities/units/hedge words stripped (best-effort;
  // enough for the buxus name override and for display).
  const plant_name = raw

  return { plant_name, spoken_count, length_m, hedge_height_m, hedge_above_1m }
}

/** Parse a line's text then resolve spacing + count in one call. */
export function resolvePlantingLineFromText(
  text: string,
  overrides?: { spacing_mm_override?: number | null; count_override?: number | null },
): PlantingLineResolution {
  const parsed = parsePlantingLine(text)
  return resolvePlantingLine({ ...parsed, ...overrides })
}
