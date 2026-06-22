import type { MaterialBill, MaterialBillEntry } from "../material-bill"
import type { PavingAreaResult, PavingCalculatorResult } from "./types"

// ---------------------------------------------------------------------------
// Adapter: PavingCalculatorResult → MaterialBill[]
//
// One bill per paving area. Entries are only emitted when the calculator
// produced a real quantity — no new maths is invented here.
//
// Quantity sources:
//   paving_paver          → area.paver_count        (each)   — only when paver dims were provided
//   paving_base_aggregate → area.base_course_volume_m3 (m3)
//   paving_bedding_sand   → area.bedding_sand_volume_m3 (m3)
//   paving_labour         → area.estimated_labour_hours  (hours)
//
// paving_edge_restraint is declared in MaterialRole but is not produced here
// because the calculator does not output a perimeter value.
// ---------------------------------------------------------------------------

function areaToEntries(area: PavingAreaResult): MaterialBillEntry[] {
  const entries: MaterialBillEntry[] = []

  if (area.paver_count !== null) {
    entries.push({
      role: "paving_paver",
      quantity: area.paver_count,
      unit: "each",
      label: area.paver_type ? `${area.paver_type}` : "Pavers",
      source_calculation: area.formula
        ? `${area.formula}, waste ${area.waste_factor_percent}%`
        : `Paver count inc. ${area.waste_factor_percent}% waste`,
    })
  }

  if (area.base_course_volume_m3 !== null) {
    entries.push({
      role: "paving_base_aggregate",
      quantity: area.base_course_volume_m3,
      unit: "m3",
      label: "Base course aggregate",
      source_calculation: `${area.paved_area_m2 ?? "?"}m² × ${area.base_course_depth_mm}mm depth`,
    })
  }

  if (area.bedding_sand_volume_m3 !== null) {
    entries.push({
      role: "paving_bedding_sand",
      quantity: area.bedding_sand_volume_m3,
      unit: "m3",
      label: "Bedding sand",
      source_calculation: `${area.paved_area_m2 ?? "?"}m² × ${area.bedding_sand_depth_mm}mm depth`,
    })
  }

  if (area.estimated_labour_hours !== null) {
    entries.push({
      role: "paving_labour",
      quantity: area.estimated_labour_hours,
      unit: "hours",
      label: "Paving labour",
      source_calculation: `${area.paved_area_m2 ?? "?"}m² × ${area.labour_hours_per_m2} hrs/m²`,
    })
  }

  return entries
}

function areaToMaterialBill(area: PavingAreaResult): MaterialBill | null {
  const entries = areaToEntries(area)
  if (entries.length === 0) return null

  return {
    trade: "paving",
    area_label: area.label,
    meta: {
      paved_area_m2: area.paved_area_m2,
      paver_count: area.paver_count,
      install_scope: area.install_scope,
    },
    entries,
  }
}

export function pavingResultToBills(result: PavingCalculatorResult): MaterialBill[] {
  return result.areas
    .map(areaToMaterialBill)
    .filter((bill): bill is MaterialBill => bill !== null)
}
