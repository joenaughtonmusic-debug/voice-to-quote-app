import { extractSpokenSpacingMmFromText } from "../calculators/planting"
import { extractPerTaskHourAllowances } from "../core/labour-allowance-extraction"
import { parseLabourAllowanceText } from "../export/labour-line-builder"
import type { QuoteIntent } from "../processed-quote"
import type {
  BucketMeasurements,
  BuildQuotePlanInput,
  LabourAllocation,
  MaterialNeed,
  PlanConfidence,
  PlanUncertainty,
  QuotePlan,
  WorkBucket,
} from "./types"

/**
 * Deterministic QuotePlan builder (design/validation slice — not wired into the
 * pipeline). It READS an already-extracted quote and re-attributes labour,
 * materials and measurements to explicit main/optional buckets so the model can
 * express "labour that belongs to an optional work". No OpenAI, no mutation.
 *
 * The key mechanism: each optional bucket CLAIMS the transcript sentences whose
 * distinctive words are unique to it; the main bucket keeps the rest. Labour and
 * measurements are then parsed per bucket from its own claimed text, so an optional
 * sentence's labour (e.g. the Ficus hedge's "two people one day") can never leak
 * into the main allowance.
 */

const OPTIONALITY_MARKER =
  /\b(optional|option\s+for|as\s+an?\s+option|optionally|if\s+(?:required|wanted|desired)|it\s+would\s+be\s+(?:great|good|nice)\s+(?:to|if)\s+(?:also\s+)?|labour\s+for\s+that)\b/i

const TOKEN_PATTERN = /[a-zāēīōū]{5,}/gi
const LENGTH_PATTERN = /\b(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s+(?:long|length|planting)\b/i

function tokensOf(text: string): Set<string> {
  const tokens = new Set<string>()
  for (const match of text.toLowerCase().matchAll(TOKEN_PATTERN)) tokens.add(match[0])
  return tokens
}

function splitSentences(transcript: string): string[] {
  return transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function intentTokens(intent: QuoteIntent | undefined): Set<string> {
  return tokensOf([intent?.quote_title ?? "", ...(intent?.scope ?? [])].join(" "))
}

function labourFromText(sourceText: string): LabourAllocation[] {
  const allocations: LabourAllocation[] = []

  const dayPeople = parseLabourAllowanceText(sourceText)
  if (dayPeople && dayPeople.hours > 0) {
    allocations.push({
      raw: dayPeople.sourceText,
      people: dayPeople.people,
      days: dayPeople.days,
      hours: dayPeople.hours,
      determinacy: "explicit",
    })
  }

  for (const task of extractPerTaskHourAllowances(sourceText)) {
    if (task.hours > 0) {
      allocations.push({ raw: task.label, hours: task.hours, determinacy: "explicit" })
    }
  }

  return allocations
}

function measurementsFromText(sourceText: string): BucketMeasurements | undefined {
  const measurements: BucketMeasurements = {}

  const lengthMatch = sourceText.match(LENGTH_PATTERN)
  if (lengthMatch && Number.isFinite(Number(lengthMatch[1]))) measurements.lengthM = Number(lengthMatch[1])

  const spacingMm = extractSpokenSpacingMmFromText(sourceText)
  if (spacingMm !== null) measurements.spacingMm = spacingMm

  return Object.keys(measurements).length > 0 ? measurements : undefined
}

function confidenceFromExtraction(value: string): PlanConfidence {
  const normalised = value.trim().toLowerCase()
  if (normalised === "high") return "high"
  if (normalised === "medium") return "medium"
  return "low"
}

export function buildQuotePlan(input: BuildQuotePlanInput): QuotePlan {
  const { extraction, transcript, classification } = input
  const sentences = splitSentences(transcript)

  const optionalIntents = extraction.optional_quotes ?? []
  const mainTokens = intentTokens(extraction.primary_quote)
  const optionalTokenSets = optionalIntents.map((intent) => intentTokens(intent))

  // A token is distinctive to an optional bucket if it appears in that bucket and
  // in neither the main bucket nor any other optional bucket.
  const distinctivePerOptional = optionalTokenSets.map((ownTokens, index) =>
    new Set(
      Array.from(ownTokens).filter(
        (token) =>
          !mainTokens.has(token) &&
          !optionalTokenSets.some((other, otherIndex) => otherIndex !== index && other.has(token)),
      ),
    ),
  )

  // Claim each sentence for the optional bucket with the most distinctive matches.
  const claimedByOptional: string[][] = optionalIntents.map(() => [])
  const mainSentences: string[] = []

  for (const sentence of sentences) {
    const sentenceTokens = tokensOf(sentence)
    let bestIndex = -1
    let bestScore = 0
    distinctivePerOptional.forEach((distinctive, index) => {
      let score = 0
      for (const token of distinctive) if (sentenceTokens.has(token)) score += 1
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })
    if (bestIndex >= 0 && bestScore >= 1) claimedByOptional[bestIndex].push(sentence)
    else mainSentences.push(sentence)
  }

  // Main labour excludes any sentence carrying an optionality marker (defensive:
  // an optional clause that was not claimed must still not become main labour).
  const mainSourceText = mainSentences.join(" ")
  const mainLabourText = mainSentences.filter((sentence) => !OPTIONALITY_MARKER.test(sentence)).join(" ")

  const mainMaterials: MaterialNeed[] = [
    ...(extraction.materials ?? []).map((name) => ({ name, optional: false })),
  ]
  if ((extraction.greenwaste ?? "").trim()) {
    mainMaterials.push({ name: "Green waste", quantity: extraction.greenwaste.trim(), optional: false })
  }

  const main: WorkBucket = {
    id: "main",
    title: extraction.primary_quote?.quote_title || extraction.quote_title || "Main works",
    kind: "main",
    scope: extraction.primary_quote?.scope ?? [],
    labour: labourFromText(mainLabourText),
    materials: mainMaterials,
    measurements: measurementsFromText(mainSourceText),
    sourceText: mainSourceText,
  }

  const optional: WorkBucket[] = optionalIntents.map((intent, index) => {
    const sourceText = claimedByOptional[index].join(" ")
    return {
      id: `optional-${index + 1}`,
      title: intent.quote_title || `Optional works ${index + 1}`,
      kind: "optional",
      scope: intent.scope ?? [],
      labour: labourFromText(sourceText),
      materials: [],
      measurements: measurementsFromText(sourceText),
      sourceText,
    }
  })

  const uncertainties: PlanUncertainty[] = [
    ...(extraction.missing_information ?? []).map((message) => ({
      field: "missing_information",
      message,
      severity: "warning" as const,
    })),
    ...(extraction.confidence_warnings ?? []).map((message) => ({
      field: "confidence_warning",
      message,
      severity: "info" as const,
    })),
  ]

  const cadence = (extraction.primary_quote?.cadence ?? "").trim()

  return {
    quoteType: classification.specialist || extraction.job_type || "general",
    quoteTypeConfidence: confidenceFromExtraction(extraction.template_match_confidence ?? ""),
    main,
    optional,
    exclusions: extraction.exclusions ?? [],
    cadence: cadence || undefined,
    uncertainties,
  }
}
