export type QuotePresentationLineRole =
  | "planting_summary"
  | "plant_option"
  | "material"
  | "labour"
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
  | "line_item"
  | "material_association"

export type QuotePresentationSectionKind =
  | "planting_details"
  | "plant_options"
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
