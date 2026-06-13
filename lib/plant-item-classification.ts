export type KnowledgeItemType =
  | "labour"
  | "material"
  | "plant"
  | "waste"
  | "equipment"
  | "service"
  | "chemical"
  | "vehicle"
  | "other"

export type PlantCatalogClassification = {
  item_type: KnowledgeItemType
  category: string
  is_true_plant: boolean
  reason: string
}

type PlantCatalogInput = {
  explicitType?: string
  itemCode?: string
  itemName?: string
  plantName?: string
  plantType?: string
  description?: string
  category?: string
  supplier?: string
  notes?: string
}

const VALID_ITEM_TYPES: KnowledgeItemType[] = [
  "labour",
  "material",
  "plant",
  "waste",
  "equipment",
  "service",
  "chemical",
  "vehicle",
  "other",
]

const PLANT_CARE_PRODUCT_PATTERN =
  /\b(plant\s+soap|soap|sprays?|spray\s+oil|wetting\s+agents?|surfactants?|fertili[sz]ers?|plant\s+food|tonic|conditioner|booster|weed\s?killer|herbicide|pesticide|fungicide|insecticide|mavrik|copper|hydrocotyl|roundup|glyphosate|chemical|treatment|root\s+powder|rooting\s+hormone)\b/i

const MATERIAL_PRODUCT_PATTERN =
  /\b(mulch|bark|compost|potting\s+mix|soil|topsoil|garden\s+mix|sand|aggregate|gravel|scoria|pebbles?|weed\s?mat|edging|stakes?|ties?|fertiliser\s+tablet)\b/i

const TRUE_PLANT_PATTERN =
  /\b(tree|trees|shrub|shrubs|hedge|hedging|groundcover|grass|grasses|perennial|annual|seedling|seedlings|native|specimen|climber|fern|flax|griselinia|ficus|buxus|pittosporum|lomandra|carex|coprosma|corokia|heb[e]?|phormium|lavender|camellia|azalea|rosemary)\b/i

const PLANT_SIZE_PATTERN =
  /\b(pb\d+|\d+(?:\.\d+)?\s*(?:l|litre|litres|cm|m)\b|grade|rootball|bare\s+root|potted)\b/i

function normalizeType(value: string | undefined): KnowledgeItemType | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, "_")
  return VALID_ITEM_TYPES.includes(normalized as KnowledgeItemType) ? (normalized as KnowledgeItemType) : null
}

function compactText(values: PlantCatalogInput) {
  return [
    values.itemCode,
    values.itemName,
    values.plantName,
    values.plantType,
    values.description,
    values.category,
    values.supplier,
    values.notes,
  ]
    .filter(Boolean)
    .join(" ")
}

export function classifyPlantCatalogItem(values: PlantCatalogInput): PlantCatalogClassification {
  const explicitType = normalizeType(values.explicitType)
  const text = compactText(values)
  const categoryText = `${values.category ?? ""} ${values.plantType ?? ""} ${values.notes ?? ""}`

  if (PLANT_CARE_PRODUCT_PATTERN.test(text)) {
    const category = /\bfertili[sz]er|plant\s+food|tonic|booster/i.test(text)
      ? "fertiliser"
      : /\bsoap|wetting|surfactant|treatment|conditioner|root/i.test(text)
        ? "plant_care"
        : "chemical"
    return {
      item_type: category === "plant_care" ? "material" : "chemical",
      category,
      is_true_plant: false,
      reason: "Matched plant-care, spray, fertiliser, or chemical product terms.",
    }
  }

  if (MATERIAL_PRODUCT_PATTERN.test(text) && !TRUE_PLANT_PATTERN.test(text)) {
    return {
      item_type: "material",
      category: /\bfertili[sz]er/i.test(text) ? "fertiliser" : "material",
      is_true_plant: false,
      reason: "Matched nursery material/product terms rather than a live plant.",
    }
  }

  if (explicitType && explicitType !== "plant") {
    return {
      item_type: explicitType,
      category: values.category?.trim() || explicitType,
      is_true_plant: false,
      reason: "Used explicit non-plant item type.",
    }
  }

  const hasPlantName = Boolean(values.plantName?.trim())
  const hasItemName = Boolean(values.itemName?.trim())
  const hasTruePlantSignal = TRUE_PLANT_PATTERN.test(text) || PLANT_SIZE_PATTERN.test(text) || /\b(plant|plants)\b/i.test(categoryText)

  if (hasPlantName || (hasItemName && (explicitType === "plant" || hasTruePlantSignal))) {
    return {
      item_type: "plant",
      category: values.category?.trim() || "plant",
      is_true_plant: true,
      reason: explicitType === "plant" ? "Explicit plant item with no product exclusion terms." : "Matched live plant naming, category, or size signals.",
    }
  }

  return {
    item_type: "material",
    category: values.category?.trim() || "material",
    is_true_plant: false,
    reason: "No strong live-plant signal found.",
  }
}

export function isTruePlantCatalogItem(values: PlantCatalogInput) {
  return classifyPlantCatalogItem(values).is_true_plant
}
