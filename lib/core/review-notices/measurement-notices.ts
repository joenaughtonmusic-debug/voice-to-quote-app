import { extractMeasurements } from "../measurement-extraction"
import type { Measurement } from "../measurement-extraction"
import type { ReviewNotice, ReviewNoticeInput } from "./types"

function noticeId(measurement: Measurement, suffix: string) {
  return `measurement.${measurement.id}.${suffix}`
}

function measurementMetadata(measurement: Measurement) {
  return {
    measurement_id: measurement.id,
    value: measurement.value,
    unit: measurement.unit,
    normalized_value_m: measurement.normalized_value_m,
    dimension: measurement.dimension,
    source_text: measurement.source_text,
    approximate: measurement.approximate,
    uncertain: measurement.uncertain,
    unit_inferred: measurement.unit_inferred,
  }
}

export function measurementReviewNotices(input: ReviewNoticeInput): ReviewNotice[] {
  const text = input.text?.trim()
  if (!text) return []

  const result = extractMeasurements(text)
  return result.measurements.flatMap((measurement) => {
    const notices: ReviewNotice[] = []

    if (measurement.uncertain) {
      notices.push({
        id: noticeId(measurement, "uncertain"),
        message: `Measurement "${measurement.source_text}" is uncertain and should be confirmed.`,
        severity: "warning",
        source: "measurement",
        category: "measurement",
        metadata: measurementMetadata(measurement),
      })
    } else if (measurement.approximate) {
      notices.push({
        id: noticeId(measurement, "approximate"),
        message: `Measurement "${measurement.source_text}" is approximate and should be reviewed.`,
        severity: "warning",
        source: "measurement",
        category: "measurement",
        metadata: measurementMetadata(measurement),
      })
    }

    if (measurement.unit_inferred || measurement.unit === "unknown") {
      notices.push({
        id: noticeId(measurement, "unit"),
        message: `Measurement "${measurement.source_text}" has an inferred or missing unit.`,
        severity: measurement.unit_inferred ? "info" : "warning",
        source: "measurement",
        category: "measurement",
        metadata: measurementMetadata(measurement),
      })
    }

    return notices
  })
}
