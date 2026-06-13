export type MeasurementConfidence = "high" | "medium" | "low"

export type MeasurementUnit = "m" | "mm" | "cm" | "unknown"

export type MeasurementDimension = "length" | "width" | "height" | "depth" | "unknown"

export type ReviewNoticeSeverity = "info" | "warning"

export type Measurement = {
  id: string
  value: number
  unit: MeasurementUnit
  normalized_value_m: number | null
  dimension: MeasurementDimension
  confidence: MeasurementConfidence
  source_text: string
  approximate: boolean
  uncertain: boolean
  unit_inferred: boolean
  start_index: number
  end_index: number
}

export type ReviewNotice = {
  message: string
  severity: ReviewNoticeSeverity
  measurement_id?: string
}

export type MeasurementExtractionResult = {
  measurements: Measurement[]
  confidence: MeasurementConfidence
  notices: ReviewNotice[]
  source_text: string
}

export type MeasurementDraft = Omit<Measurement, "id" | "confidence">
