export type PrimaryTrade =
  | "gardening_maintenance"
  | "landscaping"
  | "building"
  | "electrical"
  | "plumbing"
  | "painting"
  | "cleaning"
  | "arborist"
  | "multi_trade"

export const primaryTradeOptions: Array<{ value: PrimaryTrade; label: string }> = [
  { value: "gardening_maintenance", label: "Gardening / Maintenance" },
  { value: "landscaping", label: "Landscaping" },
  { value: "building", label: "Building" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "painting", label: "Painting" },
  { value: "cleaning", label: "Cleaning" },
  { value: "arborist", label: "Arborist" },
  { value: "multi_trade", label: "Multi-trade" },
]

export function isPrimaryTrade(value: unknown): value is PrimaryTrade {
  return primaryTradeOptions.some((option) => option.value === value)
}

export function getPrimaryTradeLabel(value: PrimaryTrade | null | undefined) {
  return primaryTradeOptions.find((option) => option.value === value)?.label ?? "Multi-trade"
}
