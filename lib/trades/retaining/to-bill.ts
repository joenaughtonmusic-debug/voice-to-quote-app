import type { MaterialBill, MaterialBillEntry } from "../material-bill"
import type { RetainingCalculatorResult, RetainingWallSectionResult } from "./types"

export type { MaterialBill, MaterialBillEntry } from "../material-bill"

// ---------------------------------------------------------------------------
// Adapter: RetainingCalculatorResult → MaterialBill[]
//
// Quantity sources (no new maths invented here):
//   retaining_wall_timber  → section.face_area_square_metres (m2)
//   retaining_drainage_pipe → section.length_m (m)
//   retaining_post         → section.length_m (m) — metres of wall run requiring posts
//   retaining_labour       → section.face_area_square_metres (m2)
//
// Entries are guarded by the calculator's own boolean flags; e.g. drainage
// pipe is only emitted when result.drainage_mentioned is true.
// ---------------------------------------------------------------------------

type SectionFlags = {
  timber_retaining: boolean
  drainage_mentioned: boolean
  posts_mentioned: boolean
}

function sectionToEntries(
  section: RetainingWallSectionResult,
  flags: SectionFlags,
): MaterialBillEntry[] {
  const entries: MaterialBillEntry[] = []
  const { face_area_square_metres: faceArea, length_m: length } = section

  if (flags.timber_retaining && faceArea !== null) {
    entries.push({
      role: "retaining_wall_timber",
      quantity: faceArea,
      unit: "m2",
      label: "Retaining wall timber",
      source_calculation: section.formula ?? undefined,
    })
  }

  if (flags.drainage_mentioned && length !== null) {
    entries.push({
      role: "retaining_drainage_pipe",
      quantity: length,
      unit: "m",
      label: "Drainage pipe",
      source_calculation: `Wall length = ${length}m`,
    })
  }

  if (flags.posts_mentioned && length !== null) {
    entries.push({
      role: "retaining_post",
      quantity: length,
      unit: "m",
      label: "Retaining posts",
      source_calculation: `Wall run = ${length}m`,
    })
  }

  if (faceArea !== null) {
    entries.push({
      role: "retaining_labour",
      quantity: faceArea,
      unit: "m2",
      label: "Retaining wall labour",
      source_calculation: section.formula ?? undefined,
    })
  }

  return entries
}

function sectionToMaterialBill(
  section: RetainingWallSectionResult,
  flags: SectionFlags,
): MaterialBill | null {
  const entries = sectionToEntries(section, flags)
  if (entries.length === 0) return null

  return {
    trade: "retaining",
    area_label: section.label,
    meta: {
      length_m: section.length_m,
      height_m: section.height_m,
      face_area_m2: section.face_area_square_metres,
    },
    entries,
  }
}

export function retainingResultToBills(result: RetainingCalculatorResult): MaterialBill[] {
  const flags: SectionFlags = {
    timber_retaining: result.timber_retaining,
    drainage_mentioned: result.drainage_mentioned,
    posts_mentioned: result.posts_mentioned,
  }

  return result.sections
    .map((section) => sectionToMaterialBill(section, flags))
    .filter((bill): bill is MaterialBill => bill !== null)
}
