export type ServiceLineKind = "labour" | "service"

export type ServiceLineLabelFact = {
  description: string
}

export type ServiceLineLabelItem = {
  item_name?: string | null
  description?: string | null
  item_type?: string | null
  match_reason?: string | null
}

export type ServiceLineLabelTemplate = {
  category?: string | null
  job_type?: string | null
  trade?: string | null
  template_name?: string | null
  name?: string | null
  template_content?: unknown
}

export type ResolveServiceLineLabelInput = {
  kind?: ServiceLineKind
  explicitLabel?: string | null
  item?: ServiceLineLabelItem | null
  quoteFacts?: ServiceLineLabelFact[]
  jobType?: string | null
  selectedTemplate?: ServiceLineLabelTemplate | null
  quoteTextParts?: Array<string | null | undefined>
  hasPlantingIntent?: boolean
}

const GENERIC_LABOUR_LABEL_PATTERN =
  /^(?:garden\s+)?(?:landscaping\s+)?(?:maintenance\s+)?(?:hourly\s+)?labou?r(?:\s*(?:hrs?|hours?))?$/i

export function resolveServiceLineLabel({
  kind = "labour",
  explicitLabel,
  item,
  quoteFacts = [],
  jobType,
  selectedTemplate,
  quoteTextParts = [],
  hasPlantingIntent = false,
}: ResolveServiceLineLabelInput) {
  const explicit = cleanLabel(explicitLabel) ?? explicitItemLabel(item)
  if (explicit && !isGenericLabourLabel(explicit)) return explicit

  const context = contextText({
    quoteFacts,
    jobType,
    selectedTemplate,
    quoteTextParts,
    item,
  })
  const domain = serviceDomainFromContext(context, selectedTemplate, hasPlantingIntent)
  const suffix = kind === "service" ? "service" : "labour"

  switch (domain) {
    case "maintenance":
      return kind === "service" ? "Garden maintenance service" : "Garden maintenance labour"
    case "planting":
      return `Planting ${suffix}`
    case "decking":
      return `Decking ${suffix}`
    case "retaining":
      return `Retaining ${suffix}`
    case "landscaping":
      return `Landscaping ${suffix}`
    default:
      return titleCase(suffix)
  }
}

function explicitItemLabel(item: ServiceLineLabelItem | null | undefined) {
  const itemName = cleanLabel(item?.item_name)
  if (itemName) return itemName
  return cleanLabel(item?.description)
}

function cleanLabel(value: unknown) {
  if (typeof value !== "string") return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  return cleaned || null
}

function isGenericLabourLabel(value: string) {
  return GENERIC_LABOUR_LABEL_PATTERN.test(value)
}

function contextText({
  quoteFacts,
  jobType,
  selectedTemplate,
  quoteTextParts,
  item,
}: {
  quoteFacts: ServiceLineLabelFact[]
  jobType?: string | null
  selectedTemplate?: ServiceLineLabelTemplate | null
  quoteTextParts: Array<string | null | undefined>
  item?: ServiceLineLabelItem | null
}) {
  return [
    jobType,
    selectedTemplate?.category,
    selectedTemplate?.job_type,
    selectedTemplate?.trade,
    selectedTemplate?.template_name,
    selectedTemplate?.name,
    templateContentText(selectedTemplate?.template_content),
    ...quoteFacts.map((fact) => fact.description),
    ...quoteTextParts,
    item?.description,
    item?.match_reason,
  ]
    .filter(Boolean)
    .join(" ")
}

function serviceDomainFromContext(
  value: string,
  selectedTemplate: ServiceLineLabelTemplate | null | undefined,
  hasPlantingIntent: boolean,
) {
  const text = normalize(value)
  const templateDomain = domainFromTemplate(selectedTemplate)

  if (hasPlantingIntent || templateDomain === "planting" || hasPlantingSignals(text)) return "planting"
  if (templateDomain) return templateDomain
  if (/\b(retaining|retainer)\b/.test(text)) return "retaining"
  if (/\b(decking|deck)\b/.test(text)) return "decking"
  if (/\b(landscaping|paving|hardscape|aggregate|scoria)\b/.test(text)) return "landscaping"
  if (/\b(maintenance|garden maintenance|weeding|pruning|spraying|herbicide|plant health|greenwaste|green waste|garden tidy|tidy)\b/.test(text)) {
    return "maintenance"
  }

  return "unknown"
}

function domainFromTemplate(template: ServiceLineLabelTemplate | null | undefined) {
  const text = normalize([template?.category, template?.job_type, template?.trade, template?.template_name, template?.name].join(" "))
  if (!text) return null
  if (/\bplanting\b/.test(text)) return "planting"
  if (/\bdecking|deck\b/.test(text)) return "decking"
  if (/\bretaining\b/.test(text)) return "retaining"
  if (/\blandscaping\b/.test(text)) return "landscaping"
  if (/\bmaintenance|garden tidy|property tidy\b/.test(text)) return "maintenance"
  return null
}

function hasPlantingSignals(text: string) {
  return /\b(supply and install|plant supply|supply plants|install plants|hedge planting|planting area|plant options?|new hedge)\b/.test(
    text,
  )
}

function templateContentText(value: unknown): string {
  if (Array.isArray(value)) return value.map(templateContentText).join(" ")
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (!value || typeof value !== "object") return ""
  return Object.values(value as Record<string, unknown>).map(templateContentText).join(" ")
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
