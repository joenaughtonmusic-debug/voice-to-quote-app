export type QuoteOptionCategory = "planting" | "material" | "labour" | "general"

export type QuoteOptionSource = "plant_calculator" | "manual" | "ai_extraction"

export type QuoteOptionLineItem = {
  itemName: string
  itemCode?: string
  sourceSystem?: string
  accountCode?: string
  salesAccountCode?: string
  taxCode?: string
  taxType?: string
  gstRate?: number | null
  quantity: number
  unit: string
  unitPrice: number
  total: number
  supplier?: string
  stockStatus?: string
  sourceItemId?: string
}

export type QuoteOption = {
  id: string
  label: string
  title: string
  description?: string
  category: QuoteOptionCategory
  source: QuoteOptionSource
  areaLabel?: string
  isPrimary?: boolean
  lineItems: QuoteOptionLineItem[]
  subtotal: number
  notes?: string[]
  warnings?: string[]
}
