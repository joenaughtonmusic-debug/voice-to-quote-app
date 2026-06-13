export type RetainingWallKind = "new_wall" | "replacement_wall" | "unknown"

export type RetainingWarningCode =
  | "missing_length"
  | "missing_height"
  | "invalid_length"
  | "invalid_height"

export type RetainingWarning = {
  code: RetainingWarningCode
  message: string
  field?: string
  severity: "info" | "warning"
}

export type RetainingWallSectionRequest = {
  id?: string
  label?: string
  length_m?: number | null
  height_m?: number | null
  source_text?: string
}

export type RetainingCalculatorRequest = {
  sections: RetainingWallSectionRequest[]
  wall_kind?: RetainingWallKind
  timber_retaining?: boolean
  drainage_mentioned?: boolean
  posts_mentioned?: boolean
  access_difficulty?: boolean
  waste_removal_notes?: string[]
  source_text?: string
}

export type RetainingWallSectionResult = {
  id: string
  label: string
  length_m: number | null
  height_m: number | null
  face_area_square_metres: number | null
  face_area_source: "calculated" | "missing"
  source_text?: string
  formula: string | null
  warnings: RetainingWarning[]
}

export type RetainingCalculatorResult = {
  sections: RetainingWallSectionResult[]
  total_face_area_square_metres: number | null
  wall_kind: RetainingWallKind
  timber_retaining: boolean
  drainage_mentioned: boolean
  posts_mentioned: boolean
  access_difficulty: boolean
  waste_removal_notes: string[]
  warnings: RetainingWarning[]
}

export type RetainingDetectionResult = {
  is_retaining: boolean
  confidence: "high" | "medium" | "low" | "none"
  confidence_score: number
  reasons: string[]
  request: RetainingCalculatorRequest
}

export type RetainingCustomerRenderResult = {
  scope: string[]
  materials: string[]
  waste: string[]
  warnings: RetainingWarning[]
}

export type RetainingXeroRenderResult = {
  lines: []
  warnings: RetainingWarning[]
}
