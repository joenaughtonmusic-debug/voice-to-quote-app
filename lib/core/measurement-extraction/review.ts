import type { Measurement, ReviewNotice } from "./types"

export function reviewNoticesForMeasurements(measurements: Measurement[]): ReviewNotice[] {
  return measurements.flatMap((measurement) => {
    const notices: ReviewNotice[] = []

    if (measurement.approximate) {
      notices.push({
        message: `Measurement "${measurement.source_text}" is approximate and should be reviewed.`,
        severity: "info",
        measurement_id: measurement.id,
      })
    }

    if (measurement.uncertain) {
      notices.push({
        message: `Measurement "${measurement.source_text}" is uncertain and should be confirmed.`,
        severity: "warning",
        measurement_id: measurement.id,
      })
    }

    if (measurement.unit_inferred || measurement.unit === "unknown") {
      notices.push({
        message: measurement.unit_inferred && measurement.unit !== "unknown"
          ? `Assumed ${measurement.value} means ${measurement.value}${measurement.unit}. Please verify.`
          : `Measurement "${measurement.source_text}" has an inferred or missing unit.`,
        severity: "warning",
        measurement_id: measurement.id,
      })
    }

    return notices
  })
}
