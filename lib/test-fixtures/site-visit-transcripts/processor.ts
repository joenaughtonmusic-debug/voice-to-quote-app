import { extractAddressDetails } from "../../address-extraction"
import { extractPlantCalculatorRequestsFromText } from "../../calculators/planting"
import { extractClientNameFromTranscript } from "../../client-name-extraction"
import { extractMeasurements } from "../../core/measurement-extraction"
import { buildReviewNotices } from "../../core/review-notices"
import { detectDeckingFromText } from "../../trades/decking/detector"
import { detectRetainingFromText } from "../../trades/retaining/detector"

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function sentenceMatches(text: string, pattern: RegExp) {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map(cleanLine)
    .filter((line) => line && pattern.test(line))
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function titleCaseName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function extractFixtureClientName(transcript: string) {
  const appClientName = extractClientNameFromTranscript(transcript)
  if (appClientName) return appClientName

  const fallbackPatterns = [
    /\bquote\s+for\s+([A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3})\s+at\s+\d/i,
    /\bsaw\s+([A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3})\s+at\s+\d/i,
  ]

  for (const pattern of fallbackPatterns) {
    const match = transcript.match(pattern)
    if (match?.[1]) return titleCaseName(match[1])
  }

  return null
}

function hasGardeningMaintenance(text: string) {
  return /\b(garden(?:ing)?\s+maintenance|garden\s+tidy|mow|lawns?|trim\s+edges?|weed|prune|green\s?waste)\b/i.test(text)
}

function productFacts(text: string) {
  const facts: string[] = []

  if (/\bkwila\b/i.test(text)) facts.push("material:kwila")
  if (/\btimber\b/i.test(text)) facts.push("material:timber")
  if (/\bgarden\s+mix\b/i.test(text)) facts.push("material:garden mix")
  if (/\bmulch\b/i.test(text)) facts.push("material:mulch")
  if (/\bKwila\s+140\s*x\s*19\b/i.test(text)) facts.push("product:Kwila 140x19")
  if (/\bFicus\s+Tuffi\s+25\s*L\b/i.test(text)) facts.push("product:Ficus Tuffi 25L")
  if (/\b(?:100\s*x\s*100\s+H4|H4\s+100\s*x\s*100)\s+posts?\b/i.test(text)) facts.push("product:100x100 H4 posts")
  if (/\bFicus\s+Tuffi\b/i.test(text)) facts.push("plant:Ficus Tuffi")

  return facts
}

function siteConditionFacts(text: string) {
  const facts: string[] = []

  if (/\b(access\s+is\s+poor|poor\s+access|steep\s+steps|access\s+.*\bpoor\b)\b/i.test(text)) facts.push("access:poor")
  if (/\baccess\s+is\s+straightforward\b|\baccess\s+is\s+normal\b/i.test(text)) facts.push("access:straightforward")
  if (/\bdrainage|novaflow|scoria\b/i.test(text)) facts.push("drainage:detected")
  if (/\bremove|removal|cart\s+away|take\s+away|waste|green\s?waste|hardfill|old\s+soil\b/i.test(text)) {
    facts.push("waste:detected")
  }
  if (/\bremove\s+existing\s+deck\b|\bremoval\s+calculator\b/i.test(text)) facts.push("removal:detected")
  if (/\bposts?\s+(?:are\s+)?still\s+in\s+good\s+condition\b|\bposts?\s+(?:retained|stay)\b/i.test(text)) {
    facts.push("existing_posts:retained")
  }
  if (/\bgreen\s?waste\b/i.test(text)) facts.push("greenwaste:detected")
  if (/\bno\s+calculators?\b/i.test(text)) facts.push("calculator:none")
  if (/\bactual\s+measurements\b|\bmeasurements?\s+(?:missing|not\s+taken|to\s+confirm)\b/i.test(text)) {
    facts.push("missing:measurements")
  }
  if (/\bmaterial\s+selection\s+not\s+confirmed\b|\bmaterials?\s+(?:missing|not\s+confirmed)\b/i.test(text)) {
    facts.push("missing:materials")
  }
  if (/\bscope\s+is\s+still\s+unclear\b|\bscope\s+unclear\b/i.test(text)) facts.push("scope:unclear")
  if (/\bclient\s+supplying\s+plants?\b/i.test(text)) facts.push("client_supply:plants")

  return facts
}

function labourFacts(text: string) {
  const facts: string[] = []
  const removalLabour = text.match(/\b(\d+)\s+people\s+(\d+)\s+days?\s+for\s+removal\b/i)
  const duration = text.match(/\baround\s+(\d+)\s+weeks?\s+with\s+(\d+)\s+people\b/i)

  if (removalLabour) facts.push(`labour:${removalLabour[1]} people ${removalLabour[2]} days`)
  if (duration) facts.push(`duration:${duration[1]} weeks`)

  return facts
}

function plantingFacts(text: string) {
  const requests = extractPlantCalculatorRequestsFromText(text).filter((request) =>
    /\b(Ficus\s+Tuffi|Griselinia|Lomandra|Buxus|Pittosporum|Flax|Corokia|Coprosma|Hebe)\b/i.test(request.plant_name ?? ""),
  )
  const facts =
    requests.length > 0 || /\b(?:plant|install|supply\s+and\s+install)\b[^.\n]*(?:Ficus\s+Tuffi|hedge|plants?)\b/i.test(text)
      ? ["planting:detected"]
      : []
  const optionSizes = unique(requests.flatMap((request) => request.requested_option_sizes ?? []))
  const areas = unique(requests.map((request) => request.area_label ?? "").filter(Boolean))

  return unique([
    ...facts,
    ...areas.map((area) => `area:${area}`),
    ...requests.map((request) => (request.plant_name ? `plant:${request.plant_name}` : "")),
    ...optionSizes.map((size) => `plant_option:${size}`),
  ])
}

function addressFacts(transcript: string) {
  const clientName = extractFixtureClientName(transcript)
  const address = extractAddressDetails(transcript)
  const facts: string[] = []

  if (clientName) facts.push(`client:${clientName}`)
  if (address.cleaned_address) facts.push(`address:${address.cleaned_address}`)
  if (address.street_number) facts.push(`street_number:${address.street_number}`)
  if (address.street_name) {
    facts.push(`street_name:${address.street_name}`)
    facts.push(`road_name:${address.street_name}`)
  }
  if (address.suburb) facts.push(`suburb:${address.suburb}`)

  return facts
}

function exclusionNotes(transcript: string) {
  return unique([
    ...sentenceMatches(transcript, /\bno\s+(?:irrigation|staining)\b/i),
    ...sentenceMatches(transcript, /\bclient\s+supplying\s+plants?\b/i),
  ])
}

function expectedCategory(text: string, facts: string[]) {
  const hasDecking = facts.includes("decking:detected")
  const hasRetaining = facts.includes("retaining:detected")
  const hasPlanting = facts.includes("planting:detected")
  const tradeCount = [hasDecking, hasRetaining, hasPlanting].filter(Boolean).length

  if (tradeCount > 1) return "multi-trade"
  if (hasDecking) return "decking"
  if (hasRetaining) return "retaining"
  if (hasPlanting) return "planting"
  if (hasGardeningMaintenance(text)) return "gardening-maintenance"
  return "ambiguous"
}

export function analyseSiteVisitTranscriptFixture(transcript: string) {
  const decking = detectDeckingFromText(transcript)
  const retaining = detectRetainingFromText(transcript)
  const measurements = extractMeasurements(transcript)
  const reviewNotices = buildReviewNotices({ text: transcript })
  const address = extractAddressDetails(transcript)
  const clientName = extractFixtureClientName(transcript)
  const plantCalculatorRequests = extractPlantCalculatorRequestsFromText(transcript)
  const facts = unique([
    ...(decking.is_decking && decking.confidence !== "low" ? ["decking:detected"] : []),
    ...(retaining.is_retaining && retaining.confidence !== "low" ? ["retaining:detected"] : []),
    ...(hasGardeningMaintenance(transcript) ? ["gardening:detected"] : []),
    ...addressFacts(transcript),
    ...productFacts(transcript),
    ...siteConditionFacts(transcript),
    ...labourFacts(transcript),
    ...plantingFacts(transcript),
    ...(measurements.measurements.some((measurement) => measurement.approximate) ? ["measurement:approximate"] : []),
    ...(measurements.measurements.some((measurement) => measurement.uncertain) ? ["measurement:uncertain"] : []),
  ])

  return {
    tradeCategory: expectedCategory(transcript, facts),
    clientName,
    address,
    decking,
    retaining,
    plantCalculatorRequests,
    measurements: measurements.measurements,
    measurementNotices: measurements.notices,
    reviewNotices,
    exclusionsOrNotes: exclusionNotes(transcript),
    facts,
  }
}
