import { calculatePaving, detectPavingFromText } from "../trades/paving"
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

const SCOPE_VERBS = /\b(?:replace|remove|install|top\s+up|screed|lay|compact|relay|re-?lay|prepare|excavate|dig|form|bed)\b/i
const SCOPE_NOUNS =
  /\bpav(?:ing|ers?)\b|\bbasecourse\b|\bbase\s+course\b|\bbedding\s+sand\b|\bpaving\s+sand\b|\bborder\b|\bedging\b|\bsub-?base\b/i
const SPEC_LINE =
  /\buse\s+\d+|\b\d{2,4}\s*(?:mm)?\s*(?:x|×|by)\s*\d{2,4}\s*(?:mm)?\s*(?:concrete|porcelain|natural|bluestone|sandstone|brick)?\s*pavers?\b/i
const DIMENSION_LINE = /\barea\s+is\b|\b\d+(?:\.\d+)?\s*m(?:etres?)?\s*(?:x|×|by)\s*\d/i
const ACCESS_LINE = /\baccess\s+is\b|\baccess\s+(?:is\s+)?(?:tight|poor|difficult|limited|reasonable)\b/i
const EXCLUSION_LINE = /\bnot\s+(?:required|included)\b/i

function pavingScopeFromText(text: string): string[] {
  const sentences = text
    .split(/(?:\.\s+|\n+)/)
    .map((s) => s.trim())
    .filter(Boolean)

  return sentences.filter(
    (s) =>
      SCOPE_VERBS.test(s) &&
      SCOPE_NOUNS.test(s) &&
      !SPEC_LINE.test(s) &&
      !DIMENSION_LINE.test(s) &&
      !ACCESS_LINE.test(s) &&
      !EXCLUSION_LINE.test(s),
  )
}

function pavingScope(input: CustomerQuoteAssemblyInput) {
  const structured = unique([...input.quote.customer_scope, ...input.quote.primary_quote.scope]).filter(
    (item) => SCOPE_NOUNS.test(item) || SCOPE_VERBS.test(item),
  )

  if (structured.length > 0) return structured

  return unique(pavingScopeFromText(quoteText(input)))
}

function computePavingResult(input: CustomerQuoteAssemblyInput) {
  const detection = detectPavingFromText(quoteText(input))
  if (!detection.is_paving || detection.request.areas.length === 0) return null
  return calculatePaving(detection.request)
}

// Handles both compact "3.5m x 6m" and spelled-out "1.5 metres by 3.5 metres" formats.
function parseDimsFromText(text: string) {
  return Array.from(
    text.matchAll(/(\d+(?:\.\d+)?)\s*m(?:etres?)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*m(?:etres?)?/gi),
  ).map((m) => ({ length_m: Number(m[1]), width_m: Number(m[2]) }))
}

function extractPaverType(text: string): string | null {
  const match = text.match(
    /\b(\d{2,4})\s*(?:mm)?\s*(?:x|×|by)\s*(\d{2,4})\s*(?:mm)?\s*(concrete|porcelain|natural\s+stone|bluestone|sandstone|brick)?\s*pavers?/i,
  )
  if (!match) return null
  const size = `${match[1]}x${match[2]}`
  const material = match[3] ? ` ${match[3].toLowerCase().replace(/\s+/g, " ")}` : ""
  const label = `${size}${material} pavers`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function pavingDetails(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  const result = computePavingResult(input)
  const items: string[] = []

  if (result && result.areas.length > 0) {
    const seen = new Set<string>()
    for (const area of result.areas) {
      if (area.length_m !== null && area.width_m !== null) {
        const dimKey = `${area.length_m}:${area.width_m}`
        if (!seen.has(dimKey)) {
          seen.add(dimKey)
          items.push(`${formatNumber(area.length_m)}m x ${formatNumber(area.width_m)}m`)
        }
      }
      if (area.paved_area_m2 !== null) {
        items.push(`Approximate area ${formatNumber(area.paved_area_m2)}m²`)
      }
      if (area.paver_type) {
        items.push(area.paver_type.charAt(0).toUpperCase() + area.paver_type.slice(1))
      }
    }
  } else {
    // Fallback: parse "X metres by Y metres" or "Xm x Ym" directly from text
    const seen = new Set<string>()
    for (const dim of parseDimsFromText(text)) {
      const dimKey = `${dim.length_m}:${dim.width_m}`
      if (!seen.has(dimKey)) {
        seen.add(dimKey)
        items.push(`${formatNumber(dim.length_m)}m x ${formatNumber(dim.width_m)}m`)
        const area = dim.length_m * dim.width_m
        items.push(`Approximate area ${formatNumber(area)}m²`)
      }
    }
    const paverType = extractPaverType(text)
    if (paverType) items.push(paverType)
  }

  return unique(items)
}

type MaterialPattern = { pattern: RegExp; label: string }

const MATERIAL_PATTERNS: MaterialPattern[] = [
  { pattern: /\bconcrete\s+pavers?\b/i, label: "Concrete pavers" },
  { pattern: /\bporcelain\s+pavers?\b/i, label: "Porcelain pavers" },
  { pattern: /\bbluestone\s+pavers?\b/i, label: "Bluestone pavers" },
  { pattern: /\bsandstone\s+pavers?\b/i, label: "Sandstone pavers" },
  { pattern: /\bnatural\s+stone\s+pavers?\b/i, label: "Natural stone pavers" },
  { pattern: /\btimber\s+border\b/i, label: "Timber border" },
  { pattern: /\bbasecourse\b|\bbase\s+course\b/i, label: "Basecourse" },
  { pattern: /\bpaving\s+sand\b|\bbedding\s+sand\b/i, label: "Paving sand" },
]

function pavingMaterials(input: CustomerQuoteAssemblyInput) {
  const structuredMaterials = unique(input.quote.materials).filter(
    (item) => /\bpav(?:ing|ers?)\b|\bbasecourse\b|\bbase\s+course\b|\bbedding\s+sand\b|\bborder\b|\baggregate\b/i.test(item),
  )

  if (structuredMaterials.length > 0) return structuredMaterials

  const text = quoteText(input)
  return MATERIAL_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label)
}

function accessItems(input: CustomerQuoteAssemblyInput) {
  const text = quoteText(input)
  if (/\btight\s+access\b|\baccess\s+is\s+tight\b/i.test(text)) return ["Tight access conditions"]
  if (/\bpoor\s+access\b|\baccess\s+is\s+poor\b|\bdifficult\s+access\b|\blimited\s+access\b/i.test(text)) {
    return ["Poor access conditions"]
  }
  if (/\breasonable\s+access\b|\baccess\s+is\s+reasonable\b/i.test(text)) return ["Reasonable access conditions"]
  return []
}

function exclusionItems(input: CustomerQuoteAssemblyInput) {
  const structured = unique(input.quote.exclusions)
  if (structured.length > 0) {
    return structured.map((item) => {
      if (/\bnot\s+(?:required|included)\b/i.test(item)) return item
      return `${item} not included`
    })
  }

  const text = quoteText(input)
  const found: string[] = []
  for (const match of text.matchAll(/\b([^\n.]{3,60}?)\s+not\s+(?:required|included)\b/gi)) {
    const subject = match[1].trim().replace(/^[\s,;]+|[\s,;]+$/g, "")
    if (subject) found.push(`${subject} not required`)
  }
  return unique(found)
}

export function assemblePavingCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Paving Scope", pavingScope(input)),
    section("Paving Details", pavingDetails(input)),
    section("Materials", pavingMaterials(input)),
    section("Access", accessItems(input)),
    section("Exclusions", exclusionItems(input)),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: "Paving Quote",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}

export function hasPavingAssemblyFacts(input: CustomerQuoteAssemblyInput) {
  const detection = detectPavingFromText(quoteText(input))
  return detection.is_paving
}
