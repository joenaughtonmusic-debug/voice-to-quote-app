export type AddressConfidence = "high" | "medium" | "low"

export type AddressExtractionResult = {
  raw_address_candidate: string | null
  cleaned_address: string | null
  street_number: string | null
  street_name: string | null
  suburb: string | null
  city_region: string | null
  confidence: AddressConfidence
  address_warnings: string[]
  needs_address_confirmation: boolean
}

export type AddressValidationResult = {
  suggestions: string[]
  confidence: AddressConfidence
  selected_address: string | null
  warnings: string[]
}

const streetTypes = [
  "Road",
  "Rd",
  "Street",
  "St",
  "Drive",
  "Dr",
  "Avenue",
  "Ave",
  "Lane",
  "Ln",
  "Crescent",
  "Cres",
  "Place",
  "Pl",
  "Way",
  "Close",
  "Court",
  "Ct",
  "Terrace",
  "Tce",
  "Parade",
  "Esplanade",
  "Highway",
  "Hwy",
  "View",
  "Rise",
  "Grove",
  "Gardens",
  "Square",
  "Quay",
  "Track",
  "Loop",
  "Mews",
  "Point",
  "Cove",
]

const aucklandSuburbs = [
  "Albany",
  "Avondale",
  "Birkenhead",
  "Blockhouse Bay",
  "Devonport",
  "Eden Terrace",
  "Ellerslie",
  "Epsom",
  "Glen Eden",
  "Glenfield",
  "Glendowie",
  "Greenhithe",
  "Grey Lynn",
  "Henderson",
  "Herne Bay",
  "Hobsonville",
  "Howick",
  "Kelston",
  "Kohimarama",
  "Manurewa",
  "Milford",
  "Mount Albert",
  "Mount Eden",
  "Mount Roskill",
  "Mount Wellington",
  "New Lynn",
  "Newmarket",
  "Onehunga",
  "Orakei",
  "Pakuranga",
  "Panmure",
  "Papakura",
  "Parnell",
  "Point Chevalier",
  "Ponsonby",
  "Pukekohe",
  "Remuera",
  "Sandringham",
  "St Heliers",
  "Takapuna",
  "Te Atatu Peninsula",
  "Te Atatu South",
  "Titirangi",
  "Westmere",
  "Whangaparaoa",
]

const streetTypePattern = streetTypes.join("|")
const suburbPattern = aucklandSuburbs
  .map((suburb) => suburb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
  .join("|")
const streetPattern = new RegExp(
  String.raw`\b(?<street_number>\d{1,5}[A-Za-z]?)\s+(?<street_name>(?:[A-Za-zāēīōūĀĒĪŌŪ'’-]+\s+){0,6}(?:${streetTypePattern}))\b`,
  "i",
)
const addressCandidatePattern = new RegExp(`${streetPattern.source}(?:\\s*,\\s*[^.\\n\\r]{0,90})?`, "i")
const terminationPattern =
  /\s*,?\s*\b(labou?r|green\s*waste|greenwaste|one\s+or\s+two\s+bags?|bags?|average|usually|monthly|maintenance|tidy|garden\s+tidy|hedge|hedge\s+trimming|planting|landscaping|electrical|plumbing|fertili[sz]er|sprays?|note|internal\s+note|dog|access|wheelbarrow|materials?|power\s*points?|powerpoints?|downlights?)\b.*$/i

const correctionRules: Array<{
  pattern: RegExp
  corrected: string
  confidence: AddressConfidence
  message: string
}> = [
  {
    pattern: /\bNewlin\b/gi,
    corrected: "New Lynn",
    confidence: "high",
    message: "Corrected likely suburb mishearing Newlin to New Lynn.",
  },
  {
    pattern: /\bPoint\s+Seville\b/gi,
    corrected: "Point Chevalier",
    confidence: "high",
    message: "Corrected likely suburb mishearing Point Seville to Point Chevalier.",
  },
  {
    pattern: /\bWiriki\s+Road\b/gi,
    corrected: "Wairiki Road",
    confidence: "medium",
    message: "Possible street-name mishearing: Wiriki Road may be Wairiki Road.",
  },
  {
    pattern: /\b(tierra|tiara|terra|tear|tier)\s*(2|two|to|too)\s*peninsula\b/gi,
    corrected: "Te Atatu Peninsula",
    confidence: "high",
    message: "Corrected likely suburb mishearing to Te Atatu Peninsula.",
  },
]

export async function validateAddress(candidate: string): Promise<AddressValidationResult> {
  return {
    suggestions: candidate.trim() ? [candidate.trim()] : [],
    confidence: "low",
    selected_address: null,
    warnings: ["External address validation is not connected yet."],
  }
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/\bRd\b/g, "Road")
    .replace(/\bSt\b/g, "Street")
    .replace(/\bDr\b/g, "Drive")
    .replace(/\bAve\b/g, "Avenue")
    .replace(/\bLn\b/g, "Lane")
    .replace(/\bPl\b/g, "Place")
    .replace(/\bCt\b/g, "Court")
    .replace(/\bTce\b/g, "Terrace")
}

function getRawAddressCandidate(transcript: string) {
  return transcript.match(addressCandidatePattern)?.[0]?.trim() ?? null
}

function recognisedSuburbIn(value: string) {
  const match = value.match(new RegExp(`\\b(${suburbPattern})\\b`, "i"))
  if (!match?.[1]) return null
  const suburb = aucklandSuburbs.find((item) => item.toLowerCase() === match[1].replace(/\s+/g, " ").toLowerCase())
  return suburb ?? titleCase(match[1].replace(/\s+/g, " "))
}

function cleanCandidate(rawCandidate: string, warnings: string[]) {
  let candidate = rawCandidate.replace(/\s+/g, " ").trim()

  for (const rule of correctionRules) {
    if (!rule.pattern.test(candidate)) {
      rule.pattern.lastIndex = 0
      continue
    }

    rule.pattern.lastIndex = 0
    if (rule.confidence === "high") {
      candidate = candidate.replace(rule.pattern, rule.corrected)
    }

    warnings.push(rule.message)
  }

  const recognisedSuburb = recognisedSuburbIn(candidate)
  if (recognisedSuburb) {
    const suburbMatch = candidate.match(new RegExp(`\\b${recognisedSuburb.replace(/\s+/g, "\\s+")}\\b`, "i"))
    if (suburbMatch?.index !== undefined) {
      return candidate.slice(0, suburbMatch.index + suburbMatch[0].length).replace(/[.,\s]+$/g, "").trim()
    }
  }

  return candidate.replace(terminationPattern, "").replace(/[.,\s]+$/g, "").trim()
}

function parseAddressParts(cleanedAddress: string | null) {
  if (!cleanedAddress) {
    return {
      street_number: null,
      street_name: null,
      suburb: null,
      city_region: null,
    }
  }

  const streetMatch = cleanedAddress.match(streetPattern)
  const suburb = recognisedSuburbIn(cleanedAddress)

  return {
    street_number: streetMatch?.groups?.street_number ?? null,
    street_name: streetMatch?.groups?.street_name ? titleCase(streetMatch.groups.street_name) : null,
    suburb,
    city_region: suburb ? "Auckland" : null,
  }
}

export function extractAddressDetails(transcript: string): AddressExtractionResult {
  const rawAddressCandidate = getRawAddressCandidate(transcript)
  const addressWarnings: string[] = []

  if (!rawAddressCandidate) {
    return {
      raw_address_candidate: null,
      cleaned_address: null,
      street_number: null,
      street_name: null,
      suburb: null,
      city_region: null,
      confidence: "low",
      address_warnings: ["No site address confidently detected."],
      needs_address_confirmation: true,
    }
  }

  const cleanedAddress = cleanCandidate(rawAddressCandidate, addressWarnings)
  const parts = parseAddressParts(cleanedAddress)
  const hasMediumOrLowCorrection = addressWarnings.some((warning) => /may be|possible/i.test(warning))
  const confidence: AddressConfidence =
    parts.street_number && parts.street_name && parts.suburb && !hasMediumOrLowCorrection
      ? "high"
      : parts.street_number && parts.street_name
        ? "medium"
        : "low"
  const needsAddressConfirmation = confidence !== "high" || hasMediumOrLowCorrection

  if (needsAddressConfirmation && !addressWarnings.some((warning) => /confirm/i.test(warning))) {
    addressWarnings.push("Please confirm site address.")
  }

  return {
    raw_address_candidate: rawAddressCandidate,
    cleaned_address: cleanedAddress || rawAddressCandidate,
    ...parts,
    confidence,
    address_warnings: addressWarnings,
    needs_address_confirmation: needsAddressConfirmation,
  }
}

export function formatAddressForQuote(address: AddressExtractionResult) {
  return address.cleaned_address
}
