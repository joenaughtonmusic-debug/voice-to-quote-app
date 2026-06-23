import type { MaterialBill, MaterialBillEntry, MaterialUnit } from "../material-bill"

export type PlantingMaterialSpec = {
  id: string
  label: string
  pattern: RegExp
  defaultUnit: MaterialUnit
  aliases: string[]
}

export const PLANTING_MATERIAL_SPECS: PlantingMaterialSpec[] = [
  {
    id: "garden-mix",
    label: "Garden mix",
    pattern: /\b(?:garden|planting)\s+(?:soil\s+)?mix\b|\bplanting\s+mix\b|\bgarden\s+mix\b/i,
    defaultUnit: "bags",
    aliases: ["garden mix", "planting mix", "garden soil mix", "planting soil mix"],
  },
  {
    id: "mulch",
    label: "Mulch",
    pattern: /\bmulch\b/i,
    defaultUnit: "m3",
    aliases: ["mulch"],
  },
  {
    id: "compost",
    label: "Compost",
    pattern: /\bcompost\b/i,
    defaultUnit: "bags",
    aliases: ["compost"],
  },
  {
    id: "topsoil",
    label: "Topsoil",
    pattern: /\btop\s*soil\b/i,
    defaultUnit: "m3",
    aliases: ["topsoil", "top soil"],
  },
  {
    id: "fertiliser",
    label: "Fertiliser",
    pattern: /\bfertil(?:iser|izer)\b/i,
    defaultUnit: "each",
    aliases: ["fertiliser", "fertilizer"],
  },
  {
    id: "delivery",
    label: "Plant delivery",
    pattern: /\b(?:include\s+)?(?:plant\s+)?delivery(?:\s+fee)?\b|\bdelivery\s+fee\b/i,
    defaultUnit: "each",
    aliases: ["plant delivery", "delivery fee", "delivery"],
  },
]

const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

export type ParsedPlantingMaterialQuantity = {
  quantity: number | null
  unit: MaterialUnit
}

function normaliseUnit(raw: string | undefined, fallback: MaterialUnit): MaterialUnit {
  const value = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim()
  if (!value) return fallback
  if (/^bags?$/.test(value)) return "bags"
  if (/^(?:m3|m³|cubic\s+metres?|cubic\s+meters?)$/.test(value)) return "m3"
  if (/^(?:each|item|allowance|fee)s?$/.test(value)) return "each"
  return fallback
}

export function parsePlantingMaterialQuantity(text: string, spec: PlantingMaterialSpec): ParsedPlantingMaterialQuantity {
  if (spec.id === "delivery") {
    return { quantity: 1, unit: "each" }
  }

  const escapedAliases = spec.aliases
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|")

  const quantityPatterns = [
    new RegExp(
      `\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:cubic\\s+)?(?:metres?|meters?|m3|m³)\\s+(?:of\\s+)?(?:${escapedAliases})\\b`,
      "i",
    ),
    new RegExp(
      `\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(bags?|m3|m²|m2|cubic\\s+metres?|cubic\\s+meters?)\\s+(?:of\\s+)?(?:${escapedAliases})\\b`,
      "i",
    ),
    new RegExp(`\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(bags?)\\b[^.\\n]{0,40}\\b(?:${escapedAliases})\\b`, "i"),
    new RegExp(`\\b(?:${escapedAliases})\\b[^.\\n]{0,40}\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(bags?|m3|m²|m2)\\b`, "i"),
  ]

  for (const pattern of quantityPatterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue

    const rawQuantity = match[1].toLowerCase()
    const quantity = WORD_TO_NUMBER[rawQuantity] ?? Number(rawQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const unitToken = match[2]
    return {
      quantity,
      unit: normaliseUnit(unitToken, spec.defaultUnit),
    }
  }

  return { quantity: null, unit: spec.defaultUnit }
}

function sourceTextForSpec(text: string, spec: PlantingMaterialSpec): string {
  const lines = text.split(/\n+/)
  for (const line of lines) {
    if (spec.pattern.test(line)) return line.trim()
  }
  const match = text.match(new RegExp(`[^.\\n]{0,120}\\b(?:${spec.aliases.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b[^.\\n]{0,120}`, "i"))
  return match?.[0]?.trim() ?? text.trim()
}

function entryForSpec(text: string, spec: PlantingMaterialSpec): MaterialBillEntry | null {
  if (!spec.pattern.test(text)) return null

  const snippet = sourceTextForSpec(text, spec)
  const parsed = parsePlantingMaterialQuantity(snippet, spec)
  const quantity = parsed.quantity ?? (spec.id === "delivery" ? 1 : null)
  if (quantity == null || quantity <= 0) return null

  return {
    role: `planting_${spec.id}`,
    quantity,
    unit: parsed.unit,
    label: spec.label,
    source_calculation: snippet,
  }
}

export type PlantingMaterialBillInput = {
  transcript: string
  materials?: string[]
  customer_scope?: string[]
  primary_quote_scope?: string[]
}

export function plantingMaterialsToBills(input: PlantingMaterialBillInput): MaterialBill[] {
  const combined = [
    input.transcript,
    ...(input.materials ?? []),
    ...(input.customer_scope ?? []),
    ...(input.primary_quote_scope ?? []),
  ]
    .filter(Boolean)
    .join("\n")

  const entries: MaterialBillEntry[] = []
  const seen = new Set<string>()

  for (const spec of PLANTING_MATERIAL_SPECS) {
    if (seen.has(spec.id)) continue
    const entry = entryForSpec(combined, spec)
    if (!entry) continue
    seen.add(spec.id)
    entries.push(entry)
  }

  if (entries.length === 0) return []

  return [
    {
      trade: "planting",
      area_label: "Planting materials",
      entries,
    },
  ]
}
