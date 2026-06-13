export type MaterialPriceCandidate = {
  id: string
  description: string
  aliases?: string[]
  defaultQuantity?: number
  defaultUnit?: string
}

export type MaterialPriceAssociation = {
  id: string
  description: string
  quantity?: number
  unit?: string
  unitAmount?: number
  totalAmount?: number
  confidence: "high" | "medium" | "low" | "none"
  sourceText?: string
  span?: {
    start: number
    end: number
  }
  warning?: string
}

type Segment = {
  text: string
  start: number
  end: number
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function words(value: string) {
  return normalise(value).split(" ").filter(Boolean)
}

function splitSegments(text: string): Segment[] {
  const segments: Segment[] = []
  const pattern = /[^.;\n]+(?:[.;\n]+|$)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const sentence = match[0]
    const sentenceStart = match.index
    const parts = sentence.split(/\b(?:and|then|also)\b/i)
    let offset = 0

    for (const part of parts) {
      const localIndex = sentence.indexOf(part, offset)
      offset = localIndex + part.length
      const cleaned = part.replace(/[.;\n]+$/g, "").trim()
      if (!cleaned) continue
      const start = sentenceStart + localIndex + part.indexOf(cleaned)
      segments.push({ text: cleaned, start, end: start + cleaned.length })
    }
  }

  return segments
}

function aliasPatterns(candidate: MaterialPriceCandidate) {
  const values = [candidate.description, ...(candidate.aliases ?? [])]
  const unique = new Set(values.map(normalise).filter(Boolean))
  return Array.from(unique).sort((a, b) => b.length - a.length)
}

function segmentMatchesCandidate(segment: string, candidate: MaterialPriceCandidate) {
  const normalizedSegment = normalise(segment)
  const segmentWords = new Set(words(segment))

  for (const alias of aliasPatterns(candidate)) {
    if (normalizedSegment.includes(alias)) return true
    const aliasWords = words(alias)
    if (aliasWords.length >= 2 && aliasWords.every((word) => segmentWords.has(word))) return true
  }

  return false
}

function extractQuantity(segment: string, candidate: MaterialPriceCandidate) {
  const quantityPatterns = [
    /\b(\d+(?:\.\d+)?)\s*(bags?|bag|each|units?|items?|m3|m2|metres?|meters?|m|lengths?)\b/gi,
    /\b(\d+(?:\.\d+)?)\s+(?=[a-z])/gi,
  ]

  for (const pattern of quantityPatterns) {
    for (const match of segment.matchAll(pattern)) {
      const before = segment.slice(0, match.index ?? 0)
      if (/\$\s*$/.test(before)) continue

      const quantity = Number(match[1])
      if (!Number.isFinite(quantity)) continue
      return {
        quantity,
        unit: match[2]?.toLowerCase(),
      }
    }
  }

  if (typeof candidate.defaultQuantity === "number") {
    return {
      quantity: candidate.defaultQuantity,
      unit: candidate.defaultUnit,
    }
  }

  return {
    quantity: undefined,
    unit: candidate.defaultUnit,
  }
}

function priceNumber(value: string | undefined) {
  if (!value) return undefined
  const number = Number(value.replace(/,/g, ""))
  return Number.isFinite(number) ? number : undefined
}

function extractPrice(segment: string) {
  const unitPatterns = [
    /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:each|ea|per\s+(?:each|unit|bag|item|m|metre|meter|hour|day))\b/i,
    /\bat\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:each|ea|per\s+(?:each|unit|bag|item|m|metre|meter|hour|day))\b/i,
  ]
  const totalPatterns = [
    /\bat\s+a\s+cost\s+of\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i,
    /\bcost(?:ing)?\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i,
    /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:total|plus\s+gst|incl(?:uding)?\s+gst)\b/i,
    /\bfor\s+\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s+total|\s+plus\s+gst|\s+incl(?:uding)?\s+gst|\b)/i,
  ]

  for (const pattern of unitPatterns) {
    const match = segment.match(pattern)
    const unitAmount = priceNumber(match?.[1])
    if (unitAmount !== undefined) return { unitAmount, totalAmount: undefined }
  }

  for (const pattern of totalPatterns) {
    const match = segment.match(pattern)
    const totalAmount = priceNumber(match?.[1])
    if (totalAmount !== undefined) return { unitAmount: undefined, totalAmount }
  }

  const dollarMatches = Array.from(segment.matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/g))
  if (dollarMatches.length === 1) {
    return { unitAmount: undefined, totalAmount: priceNumber(dollarMatches[0][1]) }
  }

  return { unitAmount: undefined, totalAmount: undefined }
}

function findCandidateSegments(transcript: string, candidate: MaterialPriceCandidate) {
  return splitSegments(transcript).filter((segment) => segmentMatchesCandidate(segment.text, candidate))
}

export function associateMaterialPrices(
  transcript: string,
  candidates: MaterialPriceCandidate[],
): MaterialPriceAssociation[] {
  const segments = splitSegments(transcript)
  const candidateCountsBySegment = new Map<string, number>()

  for (const segment of segments) {
    const matches = candidates.filter((candidate) => segmentMatchesCandidate(segment.text, candidate))
    candidateCountsBySegment.set(`${segment.start}:${segment.end}`, matches.length)
  }

  return candidates.map((candidate) => {
    const candidateSegments = findCandidateSegments(transcript, candidate)
    const pricedSegments = candidateSegments
      .map((segment) => ({ segment, price: extractPrice(segment.text) }))
      .filter((entry) => entry.price.unitAmount !== undefined || entry.price.totalAmount !== undefined)

    if (pricedSegments.length > 1) {
      return {
        id: candidate.id,
        description: candidate.description,
        ...extractQuantity(pricedSegments[0].segment.text, candidate),
        confidence: "low",
        sourceText: pricedSegments[0].segment.text,
        span: { start: pricedSegments[0].segment.start, end: pricedSegments[0].segment.end },
        warning: "Multiple possible prices found near this material.",
      } satisfies MaterialPriceAssociation
    }

    if (pricedSegments.length === 1) {
      const { segment, price } = pricedSegments[0]
      if ((candidateCountsBySegment.get(`${segment.start}:${segment.end}`) ?? 0) > 1) {
        return {
          id: candidate.id,
          description: candidate.description,
          ...extractQuantity(segment.text, candidate),
          confidence: "low",
          sourceText: segment.text,
          span: { start: segment.start, end: segment.end },
          warning: "Price is near multiple material candidates.",
        } satisfies MaterialPriceAssociation
      }

      const quantity = extractQuantity(segment.text, candidate)
      const unitAmount =
        price.unitAmount ??
        (price.totalAmount !== undefined && (quantity.quantity ?? candidate.defaultQuantity) === 1 ? price.totalAmount : undefined)
      return {
        id: candidate.id,
        description: candidate.description,
        ...quantity,
        unitAmount,
        totalAmount: price.totalAmount,
        confidence: "high",
        sourceText: segment.text,
        span: { start: segment.start, end: segment.end },
      } satisfies MaterialPriceAssociation
    }

    const segment = candidateSegments[0]
    return {
      id: candidate.id,
      description: candidate.description,
      ...(segment ? extractQuantity(segment.text, candidate) : { quantity: candidate.defaultQuantity, unit: candidate.defaultUnit }),
      confidence: segment ? "medium" : "none",
      sourceText: segment?.text,
      span: segment ? { start: segment.start, end: segment.end } : undefined,
      warning: segment ? "No price found near this material." : "Material phrase was not found.",
    } satisfies MaterialPriceAssociation
  })
}
