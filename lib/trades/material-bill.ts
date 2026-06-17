// Shared MaterialBill types used by all trade calculators.
// Each trade's to-bill.ts adapter imports from here.
// The resolver (lib/items/resolve-bill.ts) also imports from here.

export type MaterialUnit = "m2" | "m" | "m3" | "each" | "hours" | "bags" | "kg" | "tonne"

// Known role values for the current PoC trades.
// Extended as new trades are added; the open string union keeps TypeScript
// happy when a caller passes an ad-hoc role string.
export type MaterialRole =
  | "deck_board"
  | "deck_labour"
  | "retaining_post"
  | "retaining_cap"
  | "retaining_wall_timber"
  | "retaining_drainage_pipe"
  | "retaining_drainage_aggregate"
  | "retaining_geotextile"
  | "retaining_concrete"
  | "retaining_labour"
  | "paving_paver"
  | "paving_base_aggregate"
  | "paving_bedding_sand"
  | "paving_edge_restraint"
  | "paving_labour"
  | "fence_post"
  | "fence_rail"
  | "fence_paling"
  | "fence_capping_rail"
  | "fence_concrete"
  | "fence_labour"
  | "plant"
  | (string & {})

export type MaterialBillEntry = {
  role: MaterialRole
  quantity: number
  unit: MaterialUnit
  /** Human-readable label used by the resolver's name-match strategy. */
  label: string
  source_calculation?: string
}

export type MaterialBill = {
  trade: string
  area_label: string
  entries: MaterialBillEntry[]
  /** Pass-through metadata for renderers; not used by the resolver. */
  meta?: Record<string, unknown>
}
