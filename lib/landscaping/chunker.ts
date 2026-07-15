// ---------------------------------------------------------------------------
// Landscaping transcript chunker (L2).
//
// Takes ONE recording/paste that may mix several work areas (weed mat, bark,
// planting, edging, ...) and splits it into distinct, confirmable sections.
//
// Guardrails (from the spec):
//  - Split VISIBLY: distinct work types become distinct chunks. Never silently
//    merge different work into one line.
//  - Never lose text: every character of the transcript ends up inside exactly
//    one chunk's source_text (contiguous, no drops). If nothing is recognised,
//    the whole transcript becomes a single low-confidence "other" chunk for the
//    user to split by hand — surfaced, not swallowed.
//  - Deterministic: same transcript -> same chunks, every run. No AI, no Date,
//    no randomness. (AI-assisted splitting for messy dictation can layer on top
//    of this same shape later.)
//
// The output is a FIRST PASS the user confirms and edits — it is never final.
// ---------------------------------------------------------------------------

export type WorkType =
  | "weed_mat"
  | "mulch_bark"
  | "planting"
  | "edging"
  | "paving"
  | "retaining"
  | "decking"
  | "fencing"
  | "excavation"
  | "base_prep"
  | "turf"
  | "irrigation"
  | "other"

export type ChunkConfidence = "high" | "medium" | "low"

/** Display labels for every work type — used by the builder's work-type picker. */
export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  weed_mat: "Weed mat",
  mulch_bark: "Mulch / bark",
  planting: "Planting",
  edging: "Edging",
  paving: "Paving",
  retaining: "Retaining",
  decking: "Decking",
  fencing: "Fencing",
  excavation: "Excavation",
  base_prep: "Base / prep",
  turf: "Turf / lawn",
  irrigation: "Irrigation",
  other: "Other",
}

export const WORK_TYPE_OPTIONS = Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]

export type WorkChunk = {
  id: string
  label: string
  work_type: WorkType
  source_text: string
  confidence: ChunkConfidence
}

type KeywordRule = {
  work_type: WorkType
  label: string
  // Global, case-insensitive. First keyword occurrence starts a section.
  pattern: RegExp
  confidence: Exclude<ChunkConfidence, "low">
}

// Order matters only for overlap tie-breaks (earlier rule wins on identical index).
const KEYWORD_RULES: KeywordRule[] = [
  { work_type: "weed_mat", label: "Weed mat", pattern: /\b(weed\s?mat|weed\s+matting|weed\s+cloth|geotextile|landscape\s+fabric|weed\s+fabric)\b/gi, confidence: "high" },
  { work_type: "mulch_bark", label: "Mulch / bark", pattern: /\b(bark|mulch|wood\s?chip|woodchip|compost|garden\s+mix)\b/gi, confidence: "high" },
  { work_type: "edging", label: "Edging", pattern: /\b(edging|edge\s+(?:board|strip|restraint)|timber\s+edge|garden\s+edge|edge\s+the\b|border\s+edg)\b/gi, confidence: "high" },
  { work_type: "planting", label: "Planting", pattern: /\b(plant(?:ing|s)?|hedge|hedging|shrubs?|trees?|ground\s?cover|garden\s+bed|carex|griselinia|buxus|lomandra|pittosporum|renga\s?renga)\b/gi, confidence: "high" },
  { work_type: "paving", label: "Paving", pattern: /\b(pav(?:e|ing|er|ers)|patio|paving\s+slabs?|stepping\s+stones?)\b/gi, confidence: "high" },
  { work_type: "retaining", label: "Retaining", pattern: /\b(retain(?:ing)?(?:\s+wall)?|sleeper\s+wall|block\s+wall|timber\s+wall)\b/gi, confidence: "high" },
  { work_type: "decking", label: "Decking", pattern: /\b(deck(?:ing)?)\b/gi, confidence: "high" },
  { work_type: "fencing", label: "Fencing", pattern: /\b(fenc(?:e|ing)|trellis|privacy\s+screen|screen\s+panel)\b/gi, confidence: "medium" },
  { work_type: "turf", label: "Turf / lawn", pattern: /\b(turf|ready\s+lawn|instant\s+lawn|lawn\s+seed|grass\s+seed|hydroseed|re[-\s]?turf)\b/gi, confidence: "high" },
  { work_type: "irrigation", label: "Irrigation", pattern: /\b(irrigation|dripline|drip\s+line|sprinkler|watering\s+system)\b/gi, confidence: "high" },
  { work_type: "base_prep", label: "Base / prep", pattern: /\b(basecourse|base\s+course|hardfill|hard\s+fill|gap\s?\d{2}|ap\s?\d{2}|metal\s+base|compact(?:ion|ed)?)\b/gi, confidence: "medium" },
  { work_type: "excavation", label: "Excavation", pattern: /\b(excavat(?:e|ion)|dig\s+(?:out|up)|dug\s+(?:out|up)|ripped?\s+out|pull(?:ed)?\s+out|cut\s+and\s+fill|remove\s+(?:the\s+)?(?:soil|dirt|lawn|turf)|strip\s+(?:the\s+)?(?:soil|turf))\b/gi, confidence: "medium" },
]

// Delimiters we can snap a chunk's start back to, so a section reads naturally
// ("then timber edging down both sides" rather than "edging down both sides").
const CLAUSE_DELIMITER = /[.;\n]|,\s|\b(?:then|and then|and|also|next|after that|followed by)\b/gi

type Match = {
  index: number
  work_type: WorkType
  label: string
  confidence: Exclude<ChunkConfidence, "low">
}

// A keyword preceded by a locational phrase ("along the fence", "by the path")
// is describing WHERE work happens, not a work type. Skip it as a boundary.
const LOCATION_PREFIX = /\b(along|down|up|across|through|by|near|against|beside|behind|around|next\s+to|in\s+front\s+of)\s+the\s+$/i

function isLocationalMention(transcript: string, index: number): boolean {
  return LOCATION_PREFIX.test(transcript.slice(Math.max(0, index - 24), index))
}

function collectMatches(transcript: string): Match[] {
  const matches: Match[] = []
  for (const rule of KEYWORD_RULES) {
    rule.pattern.lastIndex = 0
    for (const m of transcript.matchAll(rule.pattern)) {
      const index = m.index ?? 0
      if (isLocationalMention(transcript, index)) continue
      matches.push({ index, work_type: rule.work_type, label: rule.label, confidence: rule.confidence })
    }
  }
  // Sort by position; on a tie keep rule declaration order (stable-ish via index).
  matches.sort((a, b) => a.index - b.index || KEYWORD_RULES.findIndex((r) => r.work_type === a.work_type) - KEYWORD_RULES.findIndex((r) => r.work_type === b.work_type))
  return matches
}

/** Snap a section start back to just after the previous clause delimiter. */
function snapStart(transcript: string, keywordIndex: number, floor: number): number {
  const window = transcript.slice(floor, keywordIndex)
  let lastEnd = -1
  CLAUSE_DELIMITER.lastIndex = 0
  for (const d of window.matchAll(CLAUSE_DELIMITER)) {
    lastEnd = (d.index ?? 0) + d[0].length
  }
  const start = lastEnd >= 0 ? floor + lastEnd : floor
  // Skip leading whitespace so the section text is clean.
  const trimmedOffset = transcript.slice(start).length - transcript.slice(start).trimStart().length
  return start + trimmedOffset
}

let idCounter = 0
function nextChunkId() {
  idCounter += 1
  return `chunk-auto-${idCounter}`
}

/**
 * Split a landscaping transcript into distinct, confirmable work-area chunks.
 * Returns a first-pass split the user reviews — never final, never merged for them.
 */
export function chunkLandscapingTranscript(transcript: string): WorkChunk[] {
  const text = transcript ?? ""
  if (!text.trim()) return []

  const matches = collectMatches(text)

  // No recognised work type — surface the whole thing as one chunk to split by hand.
  if (matches.length === 0) {
    return [{ id: nextChunkId(), label: "Unsorted", work_type: "other", source_text: text.trim(), confidence: "low" }]
  }

  // Coalesce consecutive matches of the SAME work type (e.g. "plant carex ...
  // plant buxus" -> one planting section). Different types are always kept apart.
  const boundaries: Match[] = []
  for (const match of matches) {
    const prev = boundaries[boundaries.length - 1]
    if (prev && prev.work_type === match.work_type) continue
    boundaries.push(match)
  }

  // Compute the snapped start for each section; each section runs to the next.
  const starts: number[] = boundaries.map((b, i) => {
    if (i === 0) return 0 // first section keeps any preamble
    const floor = boundaries[i - 1].index
    return snapStart(text, b.index, floor)
  })

  const chunks: WorkChunk[] = []
  boundaries.forEach((boundary, i) => {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : text.length
    const source_text = text.slice(start, end).trim()
    if (!source_text) return
    chunks.push({
      id: nextChunkId(),
      label: boundary.label,
      work_type: boundary.work_type,
      source_text,
      confidence: boundary.confidence,
    })
  })

  return chunks
}
