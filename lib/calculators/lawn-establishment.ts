// Deterministic lawn-establishment facts for mixed landscaping / lawn levelling
// quotes. Composes the soil-volume calculator for the topsoil spread and adds a
// narrow parser for the spoken lawn-seed bag price. Pure and side-effect free.
//
// It does NOT reimplement pricing extraction — it only parses the specific
// "N kg bag, $NNN for the bag" phrasing for lawn seed, so the spoken price is
// preserved on a line item instead of being lost. Requires "lawn seed" in the
// text, so it never fires on unrelated transcripts.

import { extractSoilVolumeFromText, type SoilVolumeResult } from "./soil-volume"

export type LawnSeedFact = {
  item: "lawn seed"
  quantity: number
  unit: "bag"
  size: string | null
  rate: number | null
  source: "spoken" | "unpriced"
  warnings: string[]
}

export type LawnEstablishmentResult = {
  topsoil: SoilVolumeResult | null
  lawnSeed: LawnSeedFact | null
  warnings: string[]
}

// "$129 for the bag" / "$129 a bag" / "$129 per bag" / "$129 each"
const BAG_PRICE_PATTERN = /\$\s*(\d+(?:\.\d+)?)\s*(?:for|per|a|each)\s+(?:the\s+)?bags?\b/i
// Fallback: "5kg bag, $129" (price after the word bag)
const BAG_PRICE_FALLBACK_PATTERN = /\bbags?\b[^.$\n]*\$\s*(\d+(?:\.\d+)?)/i
const BAG_SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*kg\b/i

export function extractLawnSeedFact(text: string): LawnSeedFact | null {
  if (!/\blawn\s*seed\b/i.test(text)) return null

  const sizeMatch = text.match(BAG_SIZE_PATTERN)
  const size = sizeMatch ? `${sizeMatch[1]}kg` : null

  const priceMatch = text.match(BAG_PRICE_PATTERN) ?? text.match(BAG_PRICE_FALLBACK_PATTERN)
  const rate = priceMatch ? Number(priceMatch[1]) : null

  const warnings: string[] = []
  if (rate === null) warnings.push("Lawn seed price not captured — confirm rate.")
  if (size === null) warnings.push("Lawn seed bag size not captured.")

  return {
    item: "lawn seed",
    quantity: 1,
    unit: "bag",
    size,
    rate: rate !== null && Number.isFinite(rate) ? rate : null,
    source: rate !== null ? "spoken" : "unpriced",
    warnings,
  }
}

export function calculateLawnEstablishment(text: string): LawnEstablishmentResult {
  const topsoil = extractSoilVolumeFromText(text)
  const lawnSeed = extractLawnSeedFact(text)

  return {
    topsoil,
    lawnSeed,
    warnings: [...(topsoil?.warnings ?? []), ...(lawnSeed?.warnings ?? [])],
  }
}
