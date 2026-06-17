import type {
  PavingAreaRequest,
  PavingAreaResult,
  PavingCalculatorRequest,
  PavingCalculatorResult,
  PavingInstallScope,
  PavingWarning,
} from "./types"

export const PAVING_DEFAULTS = {
  BASE_COURSE_DEPTH_MM: 100,
  BEDDING_SAND_DEPTH_MM: 30,
  WASTE_FACTOR_PERCENT: 10,
  LABOUR_HOURS_PER_M2: 1.5,
} as const

function isPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function positiveNumberOrNull(value: number | null | undefined): number | null {
  return isPositiveNumber(value) ? value : null
}

function round2(value: number) {
  return Number(value.toFixed(2))
}

function round3(value: number) {
  return Number(value.toFixed(3))
}

function round1(value: number) {
  return Number(value.toFixed(1))
}

function round4(value: number) {
  return Number(value.toFixed(4))
}

function labelForArea(area: PavingAreaRequest, index: number) {
  return area.label?.trim() || `Paving area ${index + 1}`
}

function warningsForArea(
  area: PavingAreaRequest,
  resolved: {
    paved_area_m2: number | null
    paver_length_mm: number | null
    paver_width_mm: number | null
    install_scope: PavingInstallScope
    base_course_depth_mm_was_default: boolean
    bedding_sand_depth_mm_was_default: boolean
    waste_factor_percent_was_default: boolean
    labour_hours_per_m2_was_default: boolean
  },
): PavingWarning[] {
  const warnings: PavingWarning[] = []

  // Suppress missing dimension warnings when square_metres directly provides the area
  const hasProvidedArea = isPositiveNumber(area.square_metres)

  if (area.length_m == null) {
    if (!hasProvidedArea) {
      warnings.push({ code: "missing_length", message: "Paving area length is missing.", field: "length_m", severity: "warning" })
    }
  } else if (!isPositiveNumber(area.length_m)) {
    warnings.push({ code: "invalid_length", message: "Paving area length must be greater than zero.", field: "length_m", severity: "warning" })
  }

  if (area.width_m == null) {
    if (!hasProvidedArea) {
      warnings.push({ code: "missing_width", message: "Paving area width is missing.", field: "width_m", severity: "warning" })
    }
  } else if (!isPositiveNumber(area.width_m)) {
    warnings.push({ code: "invalid_width", message: "Paving area width must be greater than zero.", field: "width_m", severity: "warning" })
  }

  if (resolved.paved_area_m2 !== null && (resolved.paver_length_mm === null || resolved.paver_width_mm === null)) {
    warnings.push({
      code: "missing_paver_dimensions",
      message: "Paver dimensions not provided. Paver count cannot be calculated.",
      field: "paver_length_mm",
      severity: "info",
    })
  }

  if (resolved.install_scope === "unknown") {
    warnings.push({
      code: "scope_unclear",
      message: "Install scope is unclear. Confirm whether this is a new install or replacement.",
      field: "install_scope",
      severity: "info",
    })
  }

  if (resolved.base_course_depth_mm_was_default) {
    warnings.push({
      code: "base_course_depth_assumed",
      message: `Base course depth assumed at ${PAVING_DEFAULTS.BASE_COURSE_DEPTH_MM}mm. Confirm with site conditions.`,
      field: "base_course_depth_mm",
      severity: "info",
    })
  }

  if (resolved.bedding_sand_depth_mm_was_default) {
    warnings.push({
      code: "bedding_sand_depth_assumed",
      message: `Bedding sand depth assumed at ${PAVING_DEFAULTS.BEDDING_SAND_DEPTH_MM}mm.`,
      field: "bedding_sand_depth_mm",
      severity: "info",
    })
  }

  if (resolved.waste_factor_percent_was_default) {
    warnings.push({
      code: "waste_factor_assumed",
      message: `Waste factor assumed at ${PAVING_DEFAULTS.WASTE_FACTOR_PERCENT}%.`,
      field: "waste_factor_percent",
      severity: "info",
    })
  }

  if (resolved.labour_hours_per_m2_was_default) {
    warnings.push({
      code: "labour_rate_assumed",
      message: `Labour rate assumed at ${PAVING_DEFAULTS.LABOUR_HOURS_PER_M2} hrs/m². Excludes base preparation.`,
      field: "labour_hours_per_m2",
      severity: "info",
    })
  }

  return warnings
}

function calculateArea(area: PavingAreaRequest, index: number): PavingAreaResult {
  const length = positiveNumberOrNull(area.length_m)
  const width = positiveNumberOrNull(area.width_m)
  const providedSquareMetres = positiveNumberOrNull(area.square_metres)
  const calculatedArea = length !== null && width !== null ? round2(length * width) : null
  const pavedAreaM2 = calculatedArea ?? (providedSquareMetres !== null ? round2(providedSquareMetres) : null)
  const pavedAreaSource = calculatedArea !== null ? "calculated" : providedSquareMetres !== null ? "provided" : "missing"

  const paverLengthMm = positiveNumberOrNull(area.paver_length_mm)
  const paverWidthMm = positiveNumberOrNull(area.paver_width_mm)
  const paverAreaM2 =
    paverLengthMm !== null && paverWidthMm !== null
      ? round4((paverLengthMm / 1000) * (paverWidthMm / 1000))
      : null

  const baseCourseDepthMm = isPositiveNumber(area.base_course_depth_mm)
    ? area.base_course_depth_mm
    : PAVING_DEFAULTS.BASE_COURSE_DEPTH_MM
  const beddingSandDepthMm = isPositiveNumber(area.bedding_sand_depth_mm)
    ? area.bedding_sand_depth_mm
    : PAVING_DEFAULTS.BEDDING_SAND_DEPTH_MM
  const wasteFactorPercent = isPositiveNumber(area.waste_factor_percent)
    ? area.waste_factor_percent
    : PAVING_DEFAULTS.WASTE_FACTOR_PERCENT
  const labourHoursPerM2 = isPositiveNumber(area.labour_hours_per_m2)
    ? area.labour_hours_per_m2
    : PAVING_DEFAULTS.LABOUR_HOURS_PER_M2

  const paverCount =
    pavedAreaM2 !== null && paverAreaM2 !== null && paverAreaM2 > 0
      ? Math.ceil((pavedAreaM2 / paverAreaM2) * (1 + wasteFactorPercent / 100))
      : null

  const baseCourseVolumeM3 = pavedAreaM2 !== null ? round3(pavedAreaM2 * (baseCourseDepthMm / 1000)) : null
  const beddingSandVolumeM3 = pavedAreaM2 !== null ? round3(pavedAreaM2 * (beddingSandDepthMm / 1000)) : null
  const estimatedLabourHours = pavedAreaM2 !== null ? round1(pavedAreaM2 * labourHoursPerM2) : null

  const installScope: PavingInstallScope = area.install_scope ?? "unknown"

  const result: PavingAreaResult = {
    id: area.id ?? `paving-area-${index + 1}`,
    label: labelForArea(area, index),
    length_m: length,
    width_m: width,
    paved_area_m2: pavedAreaM2,
    paved_area_source: pavedAreaSource,
    formula: calculatedArea !== null ? `${length}m x ${width}m = ${calculatedArea}m2` : null,
    paver_length_mm: paverLengthMm,
    paver_width_mm: paverWidthMm,
    paver_type: area.paver_type?.trim() || null,
    paver_area_m2: paverAreaM2,
    paver_count: paverCount,
    base_course_depth_mm: baseCourseDepthMm,
    bedding_sand_depth_mm: beddingSandDepthMm,
    base_course_volume_m3: baseCourseVolumeM3,
    bedding_sand_volume_m3: beddingSandVolumeM3,
    waste_factor_percent: wasteFactorPercent,
    labour_hours_per_m2: labourHoursPerM2,
    estimated_labour_hours: estimatedLabourHours,
    install_scope: installScope,
    access_difficulty: area.access_difficulty ?? false,
    source_text: area.source_text,
    warnings: [],
  }

  return { ...result, warnings: warningsForArea(area, { ...result, base_course_depth_mm_was_default: !isPositiveNumber(area.base_course_depth_mm), bedding_sand_depth_mm_was_default: !isPositiveNumber(area.bedding_sand_depth_mm), waste_factor_percent_was_default: !isPositiveNumber(area.waste_factor_percent), labour_hours_per_m2_was_default: !isPositiveNumber(area.labour_hours_per_m2) }) }
}

function sumValid(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  return valid.length > 0 ? valid.reduce((sum, v) => sum + v, 0) : null
}

export function calculatePaving(request: PavingCalculatorRequest): PavingCalculatorResult {
  const areas = request.areas.map(calculateArea)

  const totalPavedAreaRaw = sumValid(areas.map((a) => a.paved_area_m2))
  const totalBaseCourseRaw = sumValid(areas.map((a) => a.base_course_volume_m3))
  const totalBeddingSandRaw = sumValid(areas.map((a) => a.bedding_sand_volume_m3))
  const totalLabourRaw = sumValid(areas.map((a) => a.estimated_labour_hours))

  return {
    areas,
    total_paved_area_m2: totalPavedAreaRaw !== null ? round2(totalPavedAreaRaw) : null,
    total_paver_count: sumValid(areas.map((a) => a.paver_count)),
    total_base_course_volume_m3: totalBaseCourseRaw !== null ? round3(totalBaseCourseRaw) : null,
    total_bedding_sand_volume_m3: totalBeddingSandRaw !== null ? round3(totalBeddingSandRaw) : null,
    total_estimated_labour_hours: totalLabourRaw !== null ? round1(totalLabourRaw) : null,
    waste_removal_notes: request.waste_removal_notes ?? [],
    access_notes: request.access_notes ?? [],
    warnings: areas.flatMap((a) => a.warnings),
  }
}
