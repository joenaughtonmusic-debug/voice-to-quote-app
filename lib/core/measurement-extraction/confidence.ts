import type { Measurement, MeasurementConfidence, MeasurementDraft } from "./types"

export function measurementConfidence(measurement: Pick<MeasurementDraft, "approximate" | "uncertain" | "unit_inferred" | "unit">): MeasurementConfidence {
  if (measurement.uncertain) return "low"
  if (measurement.approximate || measurement.unit_inferred || measurement.unit === "unknown") return "medium"
  return "high"
}

export function overallMeasurementConfidence(measurements: Measurement[]): MeasurementConfidence {
  if (measurements.length === 0) return "low"
  if (measurements.some((measurement) => measurement.confidence === "low")) return "low"
  if (measurements.some((measurement) => measurement.confidence === "medium")) return "medium"
  return "high"
}
