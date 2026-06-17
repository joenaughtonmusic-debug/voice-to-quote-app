import type { MaterialBill } from "../material-bill"
import type { DeckingAreaResult, DeckingCalculatorResult } from "./types"

export type { MaterialBill, MaterialBillEntry, MaterialRole, MaterialUnit } from "../material-bill"

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
