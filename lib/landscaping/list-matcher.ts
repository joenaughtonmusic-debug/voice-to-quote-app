// ---------------------------------------------------------------------------
// Spoken-item -> price-list ROW matcher (L3 / the L0c gap).
//
// The existing lib/core/material-price-association.ts matches an item to a price
// spoken NEAR it in the transcript. This is different: it matches a spoken line
// against the user's IMPORTED price-list rows (Botanic / Bunnings / Landscape
// Supplies) and returns the list price, or flags for confirmation.
//
// Rules (from the spec):
//  - High/medium confidence match  -> use the list price, show which row matched.
//  - Low confidence                -> SUGGEST the closest row's price, flag "confirm".
//  - No match                      -> no price, flag "confirm" — never invent a number.
//
// Every non-null price returned comes from a real row's sell_price. The matcher
// never fabricates a figure. Deterministic: same inputs -> same result.
// ---------------------------------------------------------------------------

export type PriceListRow = {
  id: string
  name: string
  aliases?: string[]
  unit?: string | null
  sell_price: number | null
  cost_price?: number | null
  source?: string | null
  stock_status?: string | null
}

export type MatchConfidence = "high" | "medium" | "low" | "none"
export type PriceSource = "list" | "suggested" | "unpriced"

export type LineMatch = {
  query: string
  row: PriceListRow | null
  confidence: MatchConfidence
  /** Price to show. From a real row when non-null; null means unpriced. */
  price: number | null
  price_source: PriceSource
  /** True unless we are confident enough to use the list price as-is. */
  needs_confirm: boolean
  /** Human note for the review trail (why this price / what to check). */
  note?: string
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9. ]+/g, " ").replace(/\s+/g, " ").trim()
}

// Pot/size tokens: 14L, 2 litre, 25 ltr, PB5, 1.2m, 450mm, 40L bag ...
const SIZE_TOKEN = /\b(?:(\d+(?:\.\d+)?)\s?(?:l|ltr|litre|litres)|pb\s?(\d+)|(\d+(?:\.\d+)?)\s?(?:mm|cm|m))\b/gi

function extractSizes(value: string): string[] {
  const sizes: string[] = []
  const text = value.toLowerCase()
  SIZE_TOKEN.lastIndex = 0
  for (const m of text.matchAll(SIZE_TOKEN)) {
    if (m[1] != null) sizes.push(`${m[1]}l`)
    else if (m[2] != null) sizes.push(`pb${m[2]}`)
    else if (m[3] != null) sizes.push(`${m[3]}${m[0].replace(/[\d. ]/g, "")}`)
  }
  return sizes.sort()
}

/** Core name = normalised name with size tokens removed. */
function coreName(value: string): string {
  return normalise(value.replace(SIZE_TOKEN, " "))
}

function tokens(value: string): string[] {
  return coreName(value).split(" ").filter((t) => t.length > 1)
}

type Candidate = { row: PriceListRow; confidence: Exclude<MatchConfidence, "none"> }

function scoreRow(query: string, row: PriceListRow): Candidate | null {
  const qCore = coreName(query)
  const qTokens = tokens(query)
  const qSizes = extractSizes(query)
  if (qTokens.length === 0) return null

  // Match against the row name and each alias; keep the best.
  const names = [row.name, ...(row.aliases ?? [])].filter(Boolean)
  let best: Exclude<MatchConfidence, "none"> | null = null

  for (const name of names) {
    const nCore = coreName(name)
    const nTokens = tokens(name)
    const nSizes = extractSizes(name)
    let conf: Exclude<MatchConfidence, "none"> | null = null

    if (qCore === nCore) {
      // Same plant/item ignoring size.
      if (qSizes.length && nSizes.length) {
        conf = qSizes.join() === nSizes.join() ? "high" : "medium"
      } else {
        conf = "high"
      }
    } else if (qTokens.every((t) => nTokens.includes(t))) {
      // Query fully contained in a more specific row name ("bark" -> "bark mulch").
      conf = "medium"
    } else {
      const overlap = qTokens.filter((t) => nTokens.includes(t)).length
      if (overlap > 0 && overlap >= Math.ceil(qTokens.length / 2)) conf = "low"
    }

    if (conf && (best === null || rank(conf) > rank(best))) best = conf
  }

  return best ? { row, confidence: best } : null
}

function rank(c: Exclude<MatchConfidence, "none">): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1
}

/**
 * Match a spoken line against the imported price lists.
 * Returns the best row with a list price, a suggested price + confirm flag, or
 * an unpriced flag — never an invented number.
 */
export function matchLineToPriceList(query: string, rows: PriceListRow[]): LineMatch {
  const trimmed = (query ?? "").trim()
  if (!trimmed || rows.length === 0) {
    return { query: trimmed, row: null, confidence: "none", price: null, price_source: "unpriced", needs_confirm: true, note: rows.length === 0 ? "No price lists imported yet." : "Nothing to match." }
  }

  const candidates = rows
    .map((row) => scoreRow(trimmed, row))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => rank(b.confidence) - rank(a.confidence) || (b.row.sell_price ?? -1) - (a.row.sell_price ?? -1))

  const best = candidates[0]

  if (!best) {
    return { query: trimmed, row: null, confidence: "none", price: null, price_source: "unpriced", needs_confirm: true, note: "No match in your price lists — set a price." }
  }

  const { row, confidence } = best
  const source = row.source ? ` (${row.source})` : ""

  // Matched row has no price: use it, but it is still unpriced -> confirm.
  if (row.sell_price == null) {
    return { query: trimmed, row, confidence, price: null, price_source: "unpriced", needs_confirm: true, note: `Matched "${row.name}"${source} but it has no price — set one.` }
  }

  if (confidence === "high") {
    return { query: trimmed, row, confidence, price: row.sell_price, price_source: "list", needs_confirm: false, note: `Matched "${row.name}"${source}.` }
  }

  if (confidence === "medium") {
    return { query: trimmed, row, confidence, price: row.sell_price, price_source: "list", needs_confirm: true, note: `Likely "${row.name}"${source} — confirm it's the right item/size.` }
  }

  // Low confidence: suggest the closest row's price, clearly flagged.
  return { query: trimmed, row, confidence, price: row.sell_price, price_source: "suggested", needs_confirm: true, note: `Suggested from similar item "${row.name}"${source} — confirm the price.` }
}
