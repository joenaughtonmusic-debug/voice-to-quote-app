import type {
  RetainingCalculatorRequest,
  RetainingCalculatorResult,
  RetainingWallSectionRequest,
  RetainingWallSectionResult,
  RetainingWarning,
} from "./types"

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function positiveNumberOrNull(value: number | null | undefined): number | null {
  return isPositiveNumber(value) ? value : null
}

function roundArea(value: number) {
  return Number(value.toFixed(2))
}

function labelForSection(section: RetainingWallSectionRequest, index: number) {
  return section.label?.trim() || `Retaining wall ${index + 1}`
}

function warningsForSection(section: RetainingWallSectionRequest) {
  const warnings: RetainingWarning[] = []

  if (section.length_m == null) {
    warnings.push({
      code: "missing_length",
      message: "Retaining wall length is missing.",
      field: "length_m",
      severity: "warning",
    })
  } else if (!isPositiveNumber(section.length_m)) {
    warnings.push({
      code: "invalid_length",
      message: "Retaining wall length must be greater than zero.",
      field: "length_m",
      severity: "warning",
    })
  }

  if (section.height_m == null) {
    warnings.push({
      code: "missing_height",
      message: "Retaining wall height is missing.",
      field: "height_m",
      severity: "warning",
    })
  } else if (!isPositiveNumber(section.height_m)) {
    warnings.push({
      code: "invalid_height",
      message: "Retaining wall height must be greater than zero.",
      field: "height_m",
      severity: "warning",
    })
  }

  return warnings
}

function calculateSection(section: RetainingWallSectionRequest, index: number): RetainingWallSectionResult {
  const length = positiveNumberOrNull(section.length_m)
  const height = positiveNumberOrNull(section.height_m)
  const faceArea = length !== null && height !== null ? roundArea(length * height) : null

  return {
    id: section.id ?? `retaining-wall-${index + 1}`,
    label: labelForSection(section, index),
    length_m: length,
    height_m: height,
    face_area_square_metres: faceArea,
    face_area_source: faceArea !== null ? "calculated" : "missing",
    source_text: section.source_text,
    formula: faceArea !== null ? `${length}m x ${height}m = ${faceArea}m2` : null,
    warnings: warningsForSection(section),
  }
}

export function calculateRetaining(request: RetainingCalculatorRequest): RetainingCalculatorResult {
  const sections = request.sections.map(calculateSection)
  const validAreas = sections
    .map((section) => section.face_area_square_metres)
    .filter((area): area is number => typeof area === "number" && Number.isFinite(area))
  const totalFaceArea = validAreas.length > 0 ? roundArea(validAreas.reduce((sum, area) => sum + area, 0)) : null

  return {
    sections,
    total_face_area_square_metres: totalFaceArea,
    wall_kind: request.wall_kind ?? "unknown",
    timber_retaining: request.timber_retaining ?? false,
    drainage_mentioned: request.drainage_mentioned ?? false,
    posts_mentioned: request.posts_mentioned ?? false,
    access_difficulty: request.access_difficulty ?? false,
    waste_removal_notes: request.waste_removal_notes ?? [],
    warnings: sections.flatMap((section) => section.warnings),
  }
}
