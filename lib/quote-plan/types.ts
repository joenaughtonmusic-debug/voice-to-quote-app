/**
 * QuotePlan — the pre-logic intermediate representation (design/validation slice).
 *
 * Stage 1 of the two-stage quote intelligence flow: after transcript + extraction,
 * before the deterministic quote engine. It makes the main-vs-optional boundary and
 * per-bucket labour/materials/measurements EXPLICIT, so downstream logic no longer
 * has to re-parse the raw transcript scope-blind (the class of bug where optional
 * hedge labour leaked into the main labour allowance).
 *
 * This slice is types + a deterministic builder + tests only. It is NOT wired into
 * processTranscriptToQuote, changes no runtime behaviour, and uses no OpenAI.
 */

export type PlanConfidence = "high" | "medium" | "low"
export type BucketKind = "main" | "optional"

/** Whether a labour allocation could be quantified from the transcript. */
export type LabourDeterminacy = "explicit" | "inferred" | "missing"

export type LabourAllocation = {
  /** The transcript phrase this allocation came from. */
  raw: string
  people?: number
  days?: number
  /** Set for both day×people and per-task-hour forms. */
  hours?: number
  determinacy: LabourDeterminacy
}

export type MaterialNeed = {
  name: string
  quantity?: string
  unit?: string
  optional: boolean
}

export type BucketMeasurements = {
  lengthM?: number
  areaM2?: number
  depthMm?: number
  spacingMm?: number
  count?: number
  /**
   * Provenance: the transcript phrase(s) each measurement was parsed from, so a
   * measurement can be traced back to its bucket's own source text. A measurement
   * that belongs to a non-plant work item (e.g. a retaining-wall length) therefore
   * stays attributed to that bucket and can never be reused as a planting length.
   */
  provenance?: string[]
}

export type WorkBucket = {
  /** "main" | "optional-1" | "optional-2" … */
  id: string
  title: string
  kind: BucketKind
  scope: string[]
  /** Labour is OWNED by the bucket — this is the core of the model change. */
  labour: LabourAllocation[]
  materials: MaterialNeed[]
  measurements?: BucketMeasurements
  /** Provenance: the transcript span attributed to this bucket. */
  sourceText: string
}

export type PlanUncertainty = {
  field: string
  message: string
  bucketId?: string
  severity: "info" | "warning"
}

export type QuotePlan = {
  /** Classification specialist, e.g. "maintenance" | "planting" | "one_off_tidy". */
  quoteType: string
  quoteTypeConfidence: PlanConfidence
  main: WorkBucket
  optional: WorkBucket[]
  exclusions: string[]
  cadence?: string
  uncertainties: PlanUncertainty[]
}

export type BuildQuotePlanInput = {
  /**
   * The AI-extracted quote (or a hand-built one in tests). buildQuotePlan only
   * READS it — it never re-extracts and never mutates it.
   */
  extraction: import("../processed-quote").ProcessedQuote
  transcript: string
  classification: { specialist: string; reason?: string }
}
