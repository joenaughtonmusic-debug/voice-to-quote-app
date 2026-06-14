import { calculateDecking, detectDeckingFromText } from "../trades/decking"
import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

function cleanLine(value: string) {
  return value
    .replace(/^\s*(?:scope|note|site\s+note)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim()
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map(cleanLine)
    .filter((value) => {
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function section(title: string, items: string[]): CustomerQuoteAssemblySection | null {
  const cleanedItems = unique(items)
  return cleanedItems.length > 0 ? { title, items: cleanedItems } : null
}

function quoteText(input: CustomerQuoteAssemblyInput) {
  return [
    input.rawTranscript,
    input.quote.quote_title,
    input.quote.job_type,
    input.quote.primary_quote.quote_title,
    input.quote.primary_quote.job_type,
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
    ...input.quote.primary_quote.notes,
    ...input.quote.materials,
    input.quote.labour_allowance,
    ...input.quote.exclusions,
    ...input.quote.internal_notes,
  ]
    .filter(Boolean)
    .join("\n")
}

function formatNumber(value: number) {
  return Number(value.toFixed(2)).toString()
}

type DeckingResult = NonNullable<ReturnType<typeof deckingResult>>

function deckingResult(input: CustomerQuoteAssemblyInput) {
  const detection = detectDeckingFromText(quoteText(input))
  if (!detection.is_decking || detection.request.areas.length === 0) return null
  return calculateDecking(detection.request)
}

function uniqueDeckAreas(result: DeckingResult) {
  const seen = new Set<string>()
  return result.areas.filter((area) => {
    const key = [area.length_m, area.width_m, area.square_metres].join(":")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function materialName(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  const explicitMaterial = input.quote.materials.find((item) => /\b(pine|kwila|vitex|composite|hardwood|timber)\b/i.test(item))
  const match = (explicitMaterial ?? text).match(/\b(pine|kwila|vitex|composite|hardwood|timber)(?:\s+(\d+\s*x\s*\d+))?/i)
  if (!match?.[1]) return ""

  const species = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
  const size = match[2]?.replace(/\s+/g, "") ?? ""
  return [species, size].filter(Boolean).join(" ")
}

function projectOverview(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  const material = materialName(input)

  return unique([
    /\bremove\s+(?:the\s+)?existing\s+deck\b|\bremove\s+old\s+deck(?:ing)?\b|\bexisting\s+deck\s+removed\b/i.test(text)
      ? "Existing deck removed"
      : "",
    /\bposts?\b[^\n.]{0,80}\b(?:remain|retained|staying|still\s+in\s+good\s+condition)\b|\bexisting\s+posts?\s+retained\b/i.test(text)
      ? "Existing posts retained"
      : "",
    material ? `New ${material} decking installed` : "",
  ])
}

function deckDetails(input: CustomerQuoteAssemblyInput) {
  const result = deckingResult(input)
  if (!result) return []
  const areas = uniqueDeckAreas(result)

  const detailLines = areas.flatMap((area) => {
    if (area.length_m === null || area.width_m === null) return []
    return [`${formatNumber(area.length_m)}m x ${formatNumber(area.width_m)}m`]
  })

  const area = areas
    .map((deckArea) => deckArea.square_metres)
    .filter((squareMetres): squareMetres is number => typeof squareMetres === "number" && Number.isFinite(squareMetres))
    .reduce((sum, squareMetres) => sum + squareMetres, 0)

  return unique([
    ...detailLines,
    area > 0 ? `Approximate area ${formatNumber(area)}m²` : "",
  ])
}

function accessItems(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  if (/\bpoor\s+access\b|\baccess\s+is\s+poor\b|\bdifficult\s+access\b|\blimited\s+access\b/i.test(text)) {
    return ["Poor access conditions"]
  }
  return []
}

function programmeItems(input: CustomerQuoteAssemblyInput) {
  const match = quoteText(input).match(/\b(?:approximately|approx\.?|around)?\s*(\d+(?:\.\d+)?)\s+weeks?\b/i)
  if (!match?.[1]) return []

  const weeks = Number(match[1])
  if (!Number.isFinite(weeks)) return []
  return [`Approximately ${formatNumber(weeks)} ${weeks === 1 ? "week" : "weeks"}`]
}

function exclusionItems(input: CustomerQuoteAssemblyInput) {
  return unique(input.quote.exclusions).map((item) => {
    if (/\bstaining\b/i.test(item)) return "Staining not included"
    return /\bnot\s+included\b/i.test(item) ? item : `${item} not included`
  })
}

export function assembleDeckingCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Project Overview", projectOverview(input)),
    section("Deck Details", deckDetails(input)),
    section("Material", materialName(input) ? [materialName(input)] : []),
    section("Access", accessItems(input)),
    section("Programme", programmeItems(input)),
    section("Exclusions", exclusionItems(input)),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: "Deck Construction / Deck Replacement Quote",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}

export function hasDeckingAssemblyFacts(input: CustomerQuoteAssemblyInput) {
  const detection = detectDeckingFromText(quoteText(input))
  return detection.is_decking && detection.request.areas.length > 0
}
