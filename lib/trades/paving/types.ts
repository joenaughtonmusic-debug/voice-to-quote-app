export type PavingInstallScope = "new" | "replacement" | "unknown"

export type PavingWarningCode =
  | "missing_length"
  | "missing_width"
  | "invalid_length"
  | "invalid_width"
  | "missing_paver_dimensions"
  | "scope_unclear"
  | "base_course_depth_assumed"
  | "bedding_sand_depth_assumed"
  | "waste_factor_assumed"
  | "labour_rate_assumed"

export type PavingWarning = {
  code: PavingWarningCode
  message: string
  field?: string
  severity: "info" | "warning"
}

export type PavingAreaRequest = {
  id?: string
  label?: string
  length_m?: number | null
  width_m?: number | null
  square_metres?: number | null
  paver_length_mm?: number | null
  paver_width_mm?: number | null
  paver_type?: string | null
  base_course_depth_mm?: number | null
  bedding_sand_depth_mm?: number | null
  waste_factor_percent?: number | null
  labour_hours_per_m2?: number | null
  install_scope?: PavingInstallScope
  access_difficulty?: boolean
  source_text?: string
}

export type PavingCalculatorRequest = {
  areas: PavingAreaRequest[]
  waste_removal_notes?: string[]
  access_notes?: string[]
  source_text?: string
}

export type PavingAreaResult = {
  id: string
  label: string
  length_m: number | null
  width_m: number | null
  paved_area_m2: number | null
  paved_area_source: "calculated" | "provided" | "missing"
  formula: string | null
  paver_length_mm: number | null
  paver_width_mm: number | null
  paver_type: string | null
  paver_area_m2: number | null
  paver_count: number | null
  base_course_depth_mm: number
  bedding_sand_depth_mm: number
  base_course_volume_m3: number | null
  bedding_sand_volume_m3: number | null
  waste_factor_percent: number
  labour_hours_per_m2: number
  estimated_labour_hours: number | null
  install_scope: PavingInstallScope
  access_difficulty: boolean
  source_text?: string
  warnings: PavingWarning[]
}

export type PavingCalculatorResult = {
  areas: PavingAreaResult[]
  total_paved_area_m2: number | null
  total_paver_count: number | null
  total_base_course_volume_m3: number | null
  total_bedding_sand_volume_m3: number | null
  total_estimated_labour_hours: number | null
  waste_removal_notes: string[]
  access_notes: string[]
  warnings: PavingWarning[]
}

export type PavingDetectionResult = {
  is_paving: boolean
  confidence: "high" | "medium" | "low" | "none"
  confidence_score: number
  reasons: string[]
  request: PavingCalculatorRequest
}
