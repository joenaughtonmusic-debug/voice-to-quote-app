export type QuotePresentationLineRole =
  | "planting_summary"
  | "plant_option"
  | "trade_option"
  | "material"
  | "labour"
  | "scope_line"
  | "waste"
  | "fixed_price"
  | "optional_work"
  | "exclusion"
  | "spacing"
  | "review_notice"

export type QuotePresentationLineSource =
  | "plant_calculator"
  | "quote_option"
  | "processed_quote"
  | "transcript"
  | "customer_preview"
  | "customer_assembly"
  | "line_item"
  | "material_association"
  | "exportable_line"

export type QuotePresentationSectionKind =
  | "planting_details"
  | "plant_options"
  | "trade_options"
  | "scope"
  | "green_waste"
  | "labour_allowance"
  | "service_includes"
  | "materials"
  | "labour"
  | "optional_works"
  | "exclusions"
  | "review"

export type QuotePresentationSection = {
  sectionId: string
  title: string
  kind: QuotePresentationSectionKind
}

export type QuotePresentationLine = {
  lineId: string
  sectionId: string
  role: QuotePresentationLineRole
  customerTitle: string
  customerDescription?: string
  customerVisible: boolean
  quantity?: number | null
  unit?: string
  unitPrice?: number | null
  subtotal?: number | null
  optional?: boolean
  reviewRequired?: boolean
  warnings?: string[]
  source: QuotePresentationLineSource
  sourceRef?: string
  confidence?: "high" | "medium" | "low"
  itemCode?: string
  sourceItemId?: string
  accountCode?: string
  salesAccountCode?: string
  taxCode?: string
  taxType?: string
  exportable?: boolean
  plantingLengthM?: number | null
  spacingMm?: number | null
  spacingSource?: string
  spokenSpacingMm?: number | null
  librarySpacingMm?: number | null
  plantCount?: number | null
  plantName?: string
}

export type QuotePresentationModel = {
  workflow: string
  title: string
  clientName: string
  siteAddress: string
  sections: QuotePresentationSection[]
  lines: QuotePresentationLine[]
  reviewNotices: string[]
  deliveryCaptured?: boolean
}
