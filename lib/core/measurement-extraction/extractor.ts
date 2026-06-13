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
const SPOKEN_HUNDRED_PATTERN =
  /\b((?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?\s+hundred)\b\s*(long|length|wide|width|across|out|deep|depth|high|height|tall)?/gi

const numberWords: Record<string, number> = {
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
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

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
  if (lower === "wide" || lower === "width" || lower === "across") return "width"
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

function contextDimension(text: string, start: number, end: number, explicitDimension: MeasurementDimension): MeasurementDimension {
  if (explicitDimension !== "unknown") return explicitDimension

  const before = text.slice(Math.max(0, start - 48), start)
  const after = text.slice(end, Math.min(text.length, end + 48))

  if (/\b(?:across|wide|width)\s*$/i.test(before) || /^\s*(?:across|wide|width)\b/i.test(after)) return "width"
  if (/\b(?:out|deep|depth)\s*$/i.test(before) || /^\s*(?:out|deep|depth)\b/i.test(after)) return "depth"
  if (/\b(?:long|length)\s*$/i.test(before) || /^\s*(?:long|length)\b/i.test(after)) return "length"
  if (/\b(?:high|height|tall|above\s+ground\s+at)\s*$/i.test(before) || /^\s*(?:high|height|tall)\b/i.test(after)) return "height"

  return "unknown"
}

function isConstructionDimension(value: number, dimension: MeasurementDimension) {
  return dimension !== "unknown" && value >= 100
}

function parseSpokenHundred(value: string) {
  const words = value.toLowerCase().replace(/-/g, " ").split(/\s+/).filter((word) => word && word !== "hundred")
  if (words.length === 0 || words.length > 2) return null

  const first = numberWords[words[0]]
  if (!first) return null

  if (words.length === 1) return first * 100

  const second = numberWords[words[1]]
  if (!second || first < 20 || second >= 10) return null
  return (first + second) * 100
}

function inferUnit(value: number, explicitUnit: string | undefined, dimension: MeasurementDimension): { unit: MeasurementUnit; inferred: boolean } {
  const unit = normaliseUnit(explicitUnit)
  if (unit !== "unknown") return { unit, inferred: false }

  if (isConstructionDimension(value, dimension)) return { unit: "mm", inferred: true }

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

    const dimension = contextDimension(text, start, end, dimensionFromWord(dimensionWord))
    if (!unitText && dimension === "unknown") continue

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

function spokenHundredMeasurements(text: string, occupiedRanges: Array<{ start: number; end: number }>) {
  const drafts: MeasurementDraft[] = []

  for (const match of text.matchAll(SPOKEN_HUNDRED_PATTERN)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (overlaps(start, end, occupiedRanges)) continue

    const value = parseSpokenHundred(match[1])
    if (value === null) continue

    const dimension = contextDimension(text, start, end, dimensionFromWord(match[2]))
    if (!isConstructionDimension(value, dimension)) continue

    const inferredUnit = inferUnit(value, undefined, dimension)
    const context = contextAround(text, start, end)

    drafts.push({
      value,
      unit: inferredUnit.unit,
      normalized_value_m: normalisedValueMetres(value, inferredUnit.unit),
      dimension,
      source_text: cleanSourceText(match[0]),
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
  const standaloneDrafts = standaloneMeasurements(text, pairResult.ranges)
  const occupiedRanges = [
    ...pairResult.ranges,
    ...standaloneDrafts.map((draft) => ({ start: draft.start_index, end: draft.end_index })),
  ]
  const drafts = [...pairResult.drafts, ...standaloneDrafts, ...spokenHundredMeasurements(text, occupiedRanges)].sort(
    (a, b) => a.start_index - b.start_index,
  )
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
