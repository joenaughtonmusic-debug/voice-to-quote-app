/**
 * Simple Mode — maintenance + one-off tidy quoting with zero silent guesses.
 *
 * The AI extracts SimpleExtraction (one structured call, nulls over guesses).
 * Joe confirms/edits every field on the confirm screen → SimpleQuote.
 * Deterministic code prices it (SimplePricing) and renders fixed templates.
 * Nothing here imports the multi-trade pipeline.
 */

export type SimpleJobType = "maintenance" | "tidy" | "project"

export type SimpleFrequency = "monthly" | "6-weekly" | "2-monthly" | "3-monthly" | "4-monthly" | "other"

export type GreenwasteTreatment = "included" | "separate_line" | "not_mentioned"

export type SimpleTask = {
  description: string
  hours: number | null
}

export type SimpleExtra = {
  name: string
  amount: number | null
}

export type SimpleGreenwaste = {
  treatment: GreenwasteTreatment
  amount: number | null
  note: string | null
}

/** What the single AI extraction call returns. Amounts only when explicitly spoken. */
export type SimpleExtraction = {
  client_name: string | null
  site_address: string | null
  frequency: SimpleFrequency | null
  frequency_note: string | null
  tasks: SimpleTask[]
  stated_total_hours: number | null
  spoken_rate: number | null
  spoken_total: number | null
  greenwaste: SimpleGreenwaste
  extras: SimpleExtra[]
  internal_notes: string[]
  /** Present only for project extractions. */
  areas?: ProjectArea[]
}

/** One dictated work area of a project (e.g. "Driveway", "Beside house"). */
export type ProjectArea = {
  name: string
  lengthM: number | null
  widthM: number | null
  /** True when the width was not spoken and a default was assumed — flagged loudly. */
  widthAssumed: boolean
  /** Additional spoken m² beyond L×W (e.g. "plus 1 m² past the AC unit"). */
  extraM2: number | null
  tasks: SimpleTask[]
  /** A spoken block allowance ("maybe 8 hours") that replaces the per-task sum. */
  blockHours: number | null
  /** Spoken surface material text (e.g. "river pebbles") — matched to the price table, never guessed. */
  surfaceMaterial: string
  /** Depth of the surface material in mm (default 50). */
  depthMm: number
  needsWeedmat: boolean
  plantsCount: number | null
}

/** Project-only settings, present when jobType === "project". */
export type SimpleProjectDetails = {
  areas: ProjectArea[]
  /** Customer labour = hours × (1 + contingencyPct/100) × rate; team keeps base hours. */
  contingencyPct: number
  /** Delivery allowance — editable, flagged as an allowance (not a list price). */
  deliveryAmount: number | null
}

/** The confirmed quote — extraction after Joe has seen and edited every field. */
export type SimpleQuote = {
  jobType: SimpleJobType
  clientName: string
  siteAddress: string
  frequency: SimpleFrequency
  /** Custom cadence label when frequency === "other" (e.g. "6-monthly"). */
  frequencyOther: string
  frequencyNote: string
  tasks: SimpleTask[]
  statedTotalHours: number | null
  spokenRate: number | null
  spokenTotal: number | null
  /** Set only when Joe types a price on the confirm screen — an informed override, wins over spoken. */
  manualTotal: number | null
  greenwaste: SimpleGreenwaste
  extras: SimpleExtra[]
  internalNotes: string[]
  rawTranscript: string
  /** Present only for jobType "project". */
  project?: SimpleProjectDetails
}

export type PricingSource =
  | "manual"
  | "spoken"
  | "hours_x_spoken_rate"
  | "hours_x_default_rate"
  /** Project pricing: hours × rate (+contingency) + list-priced materials — the business rule, not a fallback. */
  | "computed_rules"
  | "unpriced"

export type SimplePricedLine = {
  description: string
  amount: number
  kind: "labour" | "greenwaste" | "extra"
}

/** A line that must not be silently rolled into the total. */
export type SimplePendingLine = {
  description: string
}

export type SimplePricing = {
  labourAmount: number | null
  pricingSource: PricingSource
  /** True when the price came from the $80/hr fallback — must render loud, never clean. */
  rateWasDefaulted: boolean
  hoursUsed: number | null
  rateUsed: number | null
  lines: SimplePricedLine[]
  pendingLines: SimplePendingLine[]
  /** GST-inclusive total of the priced lines; null when labour is unpriced (no total shown). */
  total: number | null
  /** GST portion: per-line round2(amount × 3/23), summed — matches Xero parity convention. */
  gst: number | null
}
