export type DeckingBuildScope = "full_build" | "decking_boards_only" | "unknown"

export type DeckingExistingStructureStatus = "yes" | "no" | "unknown"

export type DeckingWarningCode =
  | "missing_length"
  | "missing_width"
  | "invalid_length"
  | "invalid_width"
  | "subframe_status_unclear"
  | "scope_unclear"

export type DeckingWarning = {
  code: DeckingWarningCode
  message: string
  field?: string
  severity: "info" | "warning"
}

export type DeckingAreaRequest = {
  id?: string
  label?: string
  length_m?: number | null
  width_m?: number | null
  square_metres?: number | null
  board_type?: string | null
  build_scope?: DeckingBuildScope
  subframe_needed?: DeckingExistingStructureStatus
  existing_posts?: DeckingExistingStructureStatus
  existing_subframe?: DeckingExistingStructureStatus
  existing_framing_notes?: string[]
  source_text?: string
}

export type DeckingCalculatorRequest = {
  areas: DeckingAreaRequest[]
  waste_removal_notes?: string[]
  source_text?: string
}

export type DeckingAreaResult = {
  id: string
  label: string
  length_m: number | null
  width_m: number | null
  square_metres: number | null
  square_metres_source: "calculated" | "provided" | "missing"
  board_type: string | null
  build_scope: DeckingBuildScope
  subframe_needed: DeckingExistingStructureStatus
  existing_posts: DeckingExistingStructureStatus
  existing_subframe: DeckingExistingStructureStatus
  existing_framing_notes: string[]
  source_text?: string
  formula: string | null
  warnings: DeckingWarning[]
}

export type DeckingCalculatorResult = {
  areas: DeckingAreaResult[]
  total_square_metres: number | null
  waste_removal_notes: string[]
  warnings: DeckingWarning[]
}

export type DeckingDetectionResult = {
  is_decking: boolean
  confidence: "high" | "medium" | "low" | "none"
  confidence_score: number
  reasons: string[]
  request: DeckingCalculatorRequest
}

export type DeckingCustomerRenderResult = {
  scope: string[]
  materials: string[]
  waste: string[]
  warnings: DeckingWarning[]
}

export type DeckingXeroRenderResult = {
  lines: []
  warnings: DeckingWarning[]
}
