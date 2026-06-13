import { measurementConfidence, overallMeasurementConfidence } from "./confidence"
import { reviewNoticesForMeasurements } from "./review"
import type {
  Measurement,
  MeasurementDimension,
  MeasurementDraft,
  MeasurementExtractionResult,
  MeasurementUnit,
} from "./types"

const APPROXIMATE_PATTERN = /\b(about|approx\.?|approximately|roughly|around|estimated|estimate)\b/i
const UNCERTAIN_PATTERN = /\b(maybe|possibly|perhaps|not sure|rough guess)\b/i
const UNIT_PATTERN = /(millimetres?|millimeters?|metres?|meters?|centimetres?|centimeters?|mm|cm|m)/i
const DIMENSION_PAIR_PATTERN =
  /(\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|metres?|meters?|centimetres?|centimeters?|mm|cm|m)\s*(?:x|\u00d7|by)\s*(\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|metres?|meters?|centimetres?|centimeters?|mm|cm|m)?/gi
const STANDALONE_PATTERN =
  /(?:(about|approx\.?|approximately|roughly|around|estimated|estimate|maybe|possibly|perhaps)\s+)?(\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|metres?|meters?|centimetres?|centimeters?|mm|cm|m)?\s*(long|length|wide|width|out|deep|depth|high|height|tall)?/gi

function normaliseUnit(unit: string | undefined): MeasurementUnit {
  if (!unit) return "unknown"
  const lower = unit.toLowerCase()
  if (lower === "m" || lower.startsWith("met")) return "m"
  if (lower === "mm" || lower.startsWith("milli")) return "mm"
  if (lower === "cm" || lower.startsWith("centi")) return "cm"
  return "unknown"
}

function dimensionFromWord(value: string | undefined): MeasurementDimension {
  const lower = value?.toLowerCase() ?? ""
  if (lower === "long" || lower === "length") return "length"
  if (lower === "wide" || lower === "width") return "width"
  if (lower === "high" || lower === "height" || lower === "tall") return "height"
  if (lower === "out" || lower === "deep" || lower === "depth") return "depth"
  return "unknown"
}

function normalisedValueMetres(value: number, unit: MeasurementUnit) {
  if (!Number.isFinite(value)) return null
  if (unit === "m") return value
  if (unit === "mm") return Number((value / 1000).toFixed(4))
  if (unit === "cm") return Number((value / 100).toFixed(4))
  return null
}

function contextAround(text: string, start: number, end: number) {
  return text.slice(Math.max(0, start - 64), Math.min(text.length, end + 64))
}

function cleanSourceText(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function inferUnit(value: number, explicitUnit: string | undefined, dimension: MeasurementDimension): { unit: MeasurementUnit; inferred: boolean } {
  const unit = normaliseUnit(explicitUnit)
  if (unit !== "unknown") return { unit, inferred: false }

  if (dimension === "height" && value >= 100) return { unit: "mm", inferred: true }

  return { unit: "unknown", inferred: false }
}

function overlaps(start: number, end: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => start < range.end && end > range.start)
}

function makeMeasurement(draft: MeasurementDraft, index: number): Measurement {
  return {
    ...draft,
    id: `measurement-${index + 1}`,
    confidence: measurementConfidence(draft),
  }
}

function dimensionPairMeasurements(text: string) {
  const drafts: MeasurementDraft[] = []
  const ranges: Array<{ start: number; end: number }> = []

  for (const match of text.matchAll(DIMENSION_PAIR_PATTERN)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const context = contextAround(text, start, end)
    const approximate = APPROXIMATE_PATTERN.test(context)
    const uncertain = UNCERTAIN_PATTERN.test(context)
    const firstValue = Number(match[1])
    const secondValue = Number(match[3])
    const firstUnit = inferUnit(firstValue, match[2], "length")
    const secondUnit = inferUnit(secondValue, match[4] ?? match[2], "width")
    const sourceText = cleanSourceText(match[0])

    drafts.push(
      {
        value: firstValue,
        unit: firstUnit.unit,
        normalized_value_m: normalisedValueMetres(firstValue, firstUnit.unit),
        dimension: "length",
        source_text: sourceText,
        approximate,
        uncertain,
        unit_inferred: firstUnit.inferred,
        start_index: start,
        end_index: end,
      },
      {
        value: secondValue,
        unit: secondUnit.unit,
        normalized_value_m: normalisedValueMetres(secondValue, secondUnit.unit),
        dimension: "width",
        source_text: sourceText,
        approximate,
        uncertain,
        unit_inferred: secondUnit.inferred,
        start_index: start,
        end_index: end,
      },
    )
    ranges.push({ start, end })
  }

  return { drafts, ranges }
}

function standaloneMeasurements(text: string, occupiedRanges: Array<{ start: number; end: number }>) {
  const drafts: MeasurementDraft[] = []

  for (const match of text.matchAll(STANDALONE_PATTERN)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (overlaps(start, end, occupiedRanges)) continue

    const value = Number(match[2])
    if (!Number.isFinite(value)) continue

    const unitText = match[3]
    const dimensionWord = match[4]
    if (!unitText && !dimensionWord) continue

    const dimension = dimensionFromWord(dimensionWord)
    const inferredUnit = inferUnit(value, unitText, dimension)
    const context = contextAround(text, start, end)
    const sourceText = cleanSourceText(match[0])

    drafts.push({
      value,
      unit: inferredUnit.unit,
      normalized_value_m: normalisedValueMetres(value, inferredUnit.unit),
      dimension,
      source_text: sourceText,
      approximate: APPROXIMATE_PATTERN.test(context),
      uncertain: UNCERTAIN_PATTERN.test(context),
      unit_inferred: inferredUnit.inferred,
      start_index: start,
      end_index: end,
    })
  }

  return drafts
}

export function extractMeasurements(text: string): MeasurementExtractionResult {
  const pairResult = dimensionPairMeasurements(text)
  const drafts = [...pairResult.drafts, ...standaloneMeasurements(text, pairResult.ranges)]
  const measurements = drafts.map(makeMeasurement)

  return {
    measurements,
    confidence: overallMeasurementConfidence(measurements),
    notices: reviewNoticesForMeasurements(measurements),
    source_text: text,
  }
}

export function containsMeasurement(text: string) {
  return UNIT_PATTERN.test(text) || /\d+(?:\.\d+)?\s*(?:x|\u00d7|by)\s*\d+(?:\.\d+)?/i.test(text)
}
