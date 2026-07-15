// Deterministic soil / aggregate volume calculator.
//
// Given a rectangular area and a spread depth, returns area (m²) and volume (m³).
// Mirrors the paving base-course convention (area_m2 × depth_mm → m3). Used for
// topsoil, garden mix, mulch, sand, etc. Pure and side-effect free.

export type SoilVolumeInput = {
  lengthM: number
  widthM: number
  depthMm: number
  material?: string
}

export type SoilVolumeResult = {
  areaM2: number
  depthM: number
  volumeM3: number
  material: string
  /** Rounded up to the nearest whole m³ for ordering (waste allowance). */
  orderVolumeM3: number
  warnings: string[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// Materials this calculator applies to. "posts"/"timber"/"deck" are intentionally
// excluded so it never runs on decking, fencing, or retaining structure text.
const SOIL_MATERIAL_PATTERN =
  /\b(top\s*soil|topsoil|garden\s*mix|lawn\s*mix|compost|mulch|bark|scoria|metal|aggregate|hardfill|hard\s*fill|sand|soil)\b/i

const AREA_PATTERN =
  /(\d+(?:\.\d+)?)\s*m?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:metres?|meters?|m)\b/i

// Requires an explicit "depth"/"deep" context so a wall HEIGHT like "400mm high"
// is never mistaken for a spread depth.
const DEPTH_PATTERN =
  /(?:(\d+(?:\.\d+)?)\s*(?:mm|millimet(?:re|er)s?)\s+(?:depth|deep)\b)|(?:(?:depth|deep)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:mm|millimet(?:re|er)s?))/i

export function calculateSoilVolume(input: SoilVolumeInput): SoilVolumeResult {
  const warnings: string[] = []

  const areaRaw = input.lengthM * input.widthM
  const depthM = input.depthMm / 1000
  const volumeRaw = areaRaw * depthM

  if (input.lengthM <= 0 || input.widthM <= 0) warnings.push("Area dimensions missing or zero.")
  if (input.depthMm <= 0) warnings.push("Spread depth missing or zero.")

  return {
    areaM2: round2(areaRaw),
    depthM: round2(depthM),
    volumeM3: round2(volumeRaw),
    material: input.material ?? "topsoil",
    orderVolumeM3: volumeRaw > 0 ? Math.ceil(volumeRaw) : 0,
    warnings,
  }
}

function detectMaterial(text: string): string | null {
  const match = text.match(SOIL_MATERIAL_PATTERN)
  if (!match) return null
  const raw = match[1].toLowerCase().replace(/\s+/g, "")
  if (raw === "topsoil") return "topsoil"
  return match[1].toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Extracts a soil-volume result from free text such as
 * "50mm depth across the area, and the area is approximately 6m by 16.8m ... topsoil".
 * Returns null when there is no soil material, no area, or no depth — so it never
 * fires on decking / planting / fencing text.
 */
export function extractSoilVolumeFromText(text: string): SoilVolumeResult | null {
  const material = detectMaterial(text)
  if (!material) return null

  const areaMatch = text.match(AREA_PATTERN)
  if (!areaMatch) return null

  const depthMatch = text.match(DEPTH_PATTERN)
  const depthMm = depthMatch ? Number(depthMatch[1] ?? depthMatch[2]) : 0
  if (!depthMm) return null

  const a = Number(areaMatch[1])
  const b = Number(areaMatch[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  // Prefer "topsoil" as the material even when it is named separately from the
  // dimension sentence (e.g. "we'll use topsoil").
  return calculateSoilVolume({ lengthM: a, widthM: b, depthMm, material })
}
