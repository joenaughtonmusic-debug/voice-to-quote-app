import type { DeckingAreaResult, DeckingCalculatorResult } from "./types"

// ---------------------------------------------------------------------------
// Minimal MaterialBill types — inline for the PoC.
// Will be promoted to lib/trades/material-bill.ts in the full implementation.
// ---------------------------------------------------------------------------

export type MaterialUnit = "m2" | "m" | "m3" | "each" | "hours" | "bags" | "kg" | "tonne"

export type MaterialRole = "deck_board" | "deck_labour" | (string & {})

export type MaterialBillEntry = {
  role: MaterialRole
  quantity: number
  unit: MaterialUnit
  /** Human-readable label used by the resolver's name-match strategy. */
  label: string
  source_calculation?: string
}

export type MaterialBill = {
  trade: "decking"
  area_label: string
  entries: MaterialBillEntry[]
  /** Pass-through metadata for renderers; not used by the resolver. */
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Adapter: DeckingCalculatorResult → MaterialBill[]
// ---------------------------------------------------------------------------

function boardLabel(boardType: string | null): string {
  return boardType?.trim() || "Decking boards"
}

function areaToMaterialBill(area: DeckingAreaResult): MaterialBill | null {
  if (area.square_metres === null) return null

  return {
    trade: "decking",
    area_label: area.label,
    meta: {
      board_type: area.board_type,
      build_scope: area.build_scope,
      square_metres: area.square_metres,
    },
    entries: [
      {
        role: "deck_board",
        quantity: area.square_metres,
        unit: "m2",
        label: boardLabel(area.board_type),
        source_calculation: area.formula ?? undefined,
      },
    ],
  }
}

export function deckingResultToBills(result: DeckingCalculatorResult): MaterialBill[] {
  return result.areas
    .map(areaToMaterialBill)
    .filter((bill): bill is MaterialBill => bill !== null)
}
