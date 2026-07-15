/**
 * Material sell prices for Projects mode — transcribed from Joe's
 * "MASTER Material_Pricing" sheets (Bunnings + Auckland Landscape Supplies,
 * 15 Jul 2026). These are the MARKED-UP sell prices from the sheets' markup
 * column, GST-inclusive. Update by editing this table when the sheets change.
 * The engine only ever prices from this table — an unmatched material is
 * flagged "price to confirm", never guessed.
 */

export type BulkMaterialKey =
  | "river_pebbles_20_40"
  | "river_pebbles_13"
  | "mangatangi_20_40"
  | "gold_rush_15_25"
  | "white_chip_6_16"
  | "scoria_25"
  | "gap_7"
  | "gap_20"
  | "gap_40"
  | "black_mulch"
  | "leaf_mulch"
  | "top_soil"
  | "garden_mix"
  | "lawn_mix"
  | "paving_sand_no3"

/** $/m³ sell, GST-inclusive (Auckland Landscape Supplies unless noted). */
export const BULK_MATERIALS: Record<BulkMaterialKey, { label: string; sellPerM3: number }> = {
  river_pebbles_20_40: { label: "River pebbles 20/40", sellPerM3: 343.85 },
  river_pebbles_13: { label: "River pebbles 13mm", sellPerM3: 412.28 },
  mangatangi_20_40: { label: "Mangatangi pebbles 20/40 (Citi Landscape)", sellPerM3: 230.0 },
  gold_rush_15_25: { label: "Gold Rush pebbles 15-25mm (Citi Landscape)", sellPerM3: 235.75 },
  white_chip_6_16: { label: "White chip 6-16mm (Citi Landscape)", sellPerM3: 339.25 },
  scoria_25: { label: "Scoria 25mm", sellPerM3: 178.6 },
  gap_7: { label: "GAP 7", sellPerM3: 142.49 },
  gap_20: { label: "GAP 20", sellPerM3: 137.43 },
  gap_40: { label: "GAP 40", sellPerM3: 115.81 },
  black_mulch: { label: "Black mulch", sellPerM3: 195.5 },
  leaf_mulch: { label: "Leaf mulch", sellPerM3: 69.0 },
  top_soil: { label: "Top soil", sellPerM3: 116.73 },
  garden_mix: { label: "Garden mix", sellPerM3: 173.77 },
  lawn_mix: { label: "Lawn mix", sellPerM3: 186.99 },
  paving_sand_no3: { label: "No 3 paving sand", sellPerM3: 105.8 },
}

/** Weedmat + pins (Bunnings, marked-up sell). */
export const WEEDMAT = {
  narrow: { label: "Weedmat Saxon 0.9 x 10 m", sell: 9.88, coverageM2: 9, widthM: 0.9 },
  wide: { label: "Weedmat Saxon 1.8 x 10 m", sell: 21.84, coverageM2: 18, widthM: 1.8 },
  pins: { label: "Weedmat pins 130mm (150 pack)", sell: 36.78, coverageM2: 15 },
}

/** Default delivery allowance — NOT a list price; always shown as an editable allowance. */
export const DEFAULT_DELIVERY_ALLOWANCE = 219

/**
 * Deterministic keyword match from spoken surface-material text to a priced key.
 * Returns null when nothing matches — the area is then flagged, never guessed.
 */
export function matchBulkMaterial(text: string | null | undefined): BulkMaterialKey | null {
  const value = (text ?? "").toLowerCase()
  if (!value.trim()) return null
  if (/\bmangatangi\b/.test(value)) return "mangatangi_20_40"
  if (/\bgold\s*rush\b/.test(value)) return "gold_rush_15_25"
  if (/\bwhite\s*chip\b/.test(value)) return "white_chip_6_16"
  if (/\bscoria\b/.test(value)) return "scoria_25"
  if (/\bgap\s*7\b/.test(value)) return "gap_7"
  if (/\bgap\s*20\b/.test(value)) return "gap_20"
  if (/\bgap\s*40\b/.test(value)) return "gap_40"
  if (/\b13\s*mm\b/.test(value) && /pebble/.test(value)) return "river_pebbles_13"
  if (/pebble|river\s*stone/.test(value)) return "river_pebbles_20_40"
  if (/\bblack\s+mulch\b/.test(value)) return "black_mulch"
  if (/\bleaf\s+mulch\b/.test(value)) return "leaf_mulch"
  if (/\bmulch|bark\b/.test(value)) return "black_mulch"
  if (/\btop\s*soil\b/.test(value)) return "top_soil"
  if (/\bgarden\s+mix\b/.test(value)) return "garden_mix"
  if (/\blawn\s+mix\b/.test(value)) return "lawn_mix"
  if (/\bpaving\s+sand|no\.?\s*3\s+sand\b/.test(value)) return "paving_sand_no3"
  return null
}
