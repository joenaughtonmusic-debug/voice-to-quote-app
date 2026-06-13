export const TEMPLATE_IMPORT_PLACEHOLDERS = [
  "{{customer_name}}",
  "{{site_address}}",
  "{{job_scope}}",
  "{{labour_scope}}",
  "{{materials_scope}}",
  "{{plant_options}}",
  "{{exclusions}}",
  "{{terms}}",
] as const

export type TemplateImportPlaceholder = (typeof TEMPLATE_IMPORT_PLACEHOLDERS)[number]

export const TEMPLATE_SECTION_CATEGORIES = [
  "template_title",
  "job_scope",
  "labour",
  "plants",
  "materials",
  "waste",
  "optional_works",
  "exclusions",
  "terms",
  "notes",
  "custom",
] as const

export type TemplateSectionCategory = (typeof TEMPLATE_SECTION_CATEGORIES)[number]

export type QuoteTemplateImportStatus = "draft" | "reviewed" | "active" | "archived"

export type QuoteTemplateLibraryItem = {
  id: string
  user_id?: string | null
  name?: string | null
  template_name?: string | null
  trade?: string | null
  job_type?: string | null
  category?: string | null
  document_type?: string | null
  common_line_items?: unknown
  default_scope?: unknown
  default_exclusions?: unknown
  default_pricing_structure?: unknown
  template_content?: unknown
  metadata?: unknown
  source_type?: string | null
  source_filename?: string | null
  source_text?: string | null
  status?: QuoteTemplateImportStatus | string | null
  created_at?: string | null
  updated_at?: string | null
}

export type QuoteTemplateSectionDraft = {
  id: string
  template_id: string
  display_order: number
  section_name?: string | null
  section_category?: TemplateSectionCategory | string | null
  raw_text?: string | null
  template_text?: string | null
  placeholders?: TemplateImportPlaceholder[] | string[] | null
  customer_facing: boolean
  exportable: boolean
  export_category?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export function displayTemplateName(template: QuoteTemplateLibraryItem) {
  return template.name || template.template_name || "Untitled template"
}

export function displayTemplateStatus(status: QuoteTemplateLibraryItem["status"]) {
  if (status === "draft" || status === "reviewed" || status === "active" || status === "archived") return status
  return "draft"
}

export type TemplateSectionCandidate = {
  id: string
  display_order: number
  section_name: string
  section_category: TemplateSectionCategory
  raw_text: string
  template_text: string
  placeholders: TemplateImportPlaceholder[]
  customer_facing: boolean
  exportable: boolean
  export_category: TemplateSectionCategory | ""
}

const SECTION_HEADING_PATTERN =
  /^(template\s+title|scope(?:\s+of\s+works?)?|work\s+scope|job\s+scope|labou?r|plants?|planting|materials?|waste(?:\s*(?:\/|&|and|-)\s*removal)?|removal|spoil|optional\s+works?|optional\s+extras?|exclusions?|terms(?:\s+and\s+conditions)?|notes?|payment\s+terms|acceptance)\s*:?\s*$/i

function cleanHeading(value: string) {
  return value
    .replace(/^[#*\-\s]+/g, "")
    .replace(/^\d+[\).:-]\s*/g, "")
    .replace(/[:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ")
}

function normalizeHeading(value: string) {
  return cleanHeading(value).toLowerCase()
}

function categoryFromHeading(sectionName: string): TemplateSectionCategory | null {
  const heading = normalizeHeading(sectionName)

  if (!heading) return null
  if (heading === "template title") return "template_title"
  if (/^exclusions?$/.test(heading)) return "exclusions"
  if (/^materials?$/.test(heading)) return "materials"
  if (/^(waste|removal|spoil|waste\s*(?:\/|&|and|-)\s*removal)$/.test(heading)) return "waste"
  if (/^optional\s+(works?|extras?)$/.test(heading)) return "optional_works"
  if (/^(terms?|terms\s+and\s+conditions|payment\s+terms|acceptance)$/.test(heading)) return "terms"
  if (/^(labou?r|crew|hours?)$/.test(heading)) return "labour"
  if (/^(plants?|planting)$/.test(heading)) return "plants"
  if (/^(scope|scope\s+of\s+works?|work\s+scope|job\s+scope)$/.test(heading)) return "job_scope"
  if (/^notes?$/.test(heading)) return "notes"

  return null
}

function isLikelyTemplateTitle(value: string, isFirstMeaningfulLine: boolean) {
  const line = cleanHeading(value)

  if (!isFirstMeaningfulLine || !line || line.length > 100) return false
  if (SECTION_HEADING_PATTERN.test(line)) return false
  if (!/\b(quote|quotation|estimate|template)\b/i.test(line)) return false
  if (/[.!?]$/.test(line)) return false

  return true
}

function categoryFromText(sectionName: string, rawText: string): TemplateSectionCategory {
  const headingCategory = categoryFromHeading(sectionName)
  if (headingCategory) return headingCategory

  const text = `${sectionName} ${rawText}`.toLowerCase()
  const bodyText = rawText.toLowerCase()

  if (/\b(optional|extra|upgrade|alternate|variation)\b/.test(text)) return "optional_works"
  if (/\b(exclusion|excluded|not included|does not include)\b/.test(text)) return "exclusions"
  if (/\b(term|condition|payment|valid|expiry|acceptance)\b/.test(text)) return "terms"
  if (/\b(waste|removal|spoil|hardfill|greenwaste|rubbish|disposal)\b/.test(text)) return "waste"
  if (/\b(plant|planting|tree|shrub|hedge)\b/.test(text)) return "plants"
  if (/\b(material|product|fixture|fitting|part)\b/.test(text)) return "materials"
  if (/\b(labou?r|hours?|days?|crew|people|person|rate)\b/.test(text)) return "labour"
  if (/^\s*(construct|build|install|supply\s+and\s+install|remove|replace|repair|prepare|paint|clean|fit|connect|lay|assemble)\b/im.test(bodyText)) {
    return "job_scope"
  }
  if (/\b(scope|work|works|service|construct|build|install|installation)\b/.test(text)) return "job_scope"
  if (/\b(note|assumption|site|access)\b/.test(text)) return "notes"

  return "custom"
}

function placeholderForCategory(category: TemplateSectionCategory): TemplateImportPlaceholder[] {
  if (category === "template_title") return []
  if (category === "job_scope") return ["{{job_scope}}"]
  if (category === "labour") return ["{{labour_scope}}"]
  if (category === "materials" || category === "waste") return ["{{materials_scope}}"]
  if (category === "plants") return ["{{plant_options}}"]
  if (category === "exclusions") return ["{{exclusions}}"]
  if (category === "terms") return ["{{terms}}"]
  return []
}

function isExportableCategory(category: TemplateSectionCategory) {
  return category === "labour" || category === "plants" || category === "materials" || category === "waste" || category === "optional_works"
}

function sectionNameForCategory(category: TemplateSectionCategory) {
  if (category === "template_title") return "Template Title"
  if (category === "job_scope") return "Job Scope"
  if (category === "optional_works") return "Optional Works"
  return titleCase(category.replaceAll("_", " "))
}

function candidateFromBlock(sectionName: string, rawText: string, index: number): TemplateSectionCandidate {
  const category = categoryFromText(sectionName, rawText)
  const exportable = isExportableCategory(category)

  return {
    id: `section-${index + 1}`,
    display_order: (index + 1) * 10,
    section_name: category === "job_scope" ? sectionNameForCategory(category) : sectionName || sectionNameForCategory(category),
    section_category: category,
    raw_text: rawText.trim(),
    template_text: rawText.trim(),
    placeholders: placeholderForCategory(category),
    customer_facing: category !== "notes" && category !== "template_title",
    exportable,
    export_category: exportable ? category : "",
  }
}

function blockHasContent(block: { lines: string[] }) {
  return block.lines.some((item) => item.trim())
}

export function extractTemplateSectionCandidates(templateText: string): TemplateSectionCandidate[] {
  const lines = templateText.replace(/\r\n/g, "\n").split("\n")
  const blocks: Array<{ heading: string; lines: string[] }> = []
  let current: { heading: string; lines: string[] } | null = null
  let hasSeenMeaningfulLine = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const normalizedLine = cleanHeading(line)
    const isFirstMeaningfulLine = line.length > 0 && !hasSeenMeaningfulLine
    const isTitle = isLikelyTemplateTitle(line, isFirstMeaningfulLine)
    const isHeading = normalizedLine.length > 0 && normalizedLine.length <= 80 && SECTION_HEADING_PATTERN.test(normalizedLine)

    if (line.length > 0) {
      hasSeenMeaningfulLine = true
    }

    if (isTitle) {
      if (current && blockHasContent(current)) {
        blocks.push(current)
      }
      blocks.push({ heading: "Template Title", lines: [line] })
      current = null
      continue
    }

    if (isHeading) {
      if (current && blockHasContent(current)) {
        blocks.push(current)
      }
      current = { heading: cleanHeading(line), lines: [] }
      continue
    }

    if (!current) {
      current = { heading: "Scope", lines: [] }
    }

    current.lines.push(rawLine)
  }

  if (current && blockHasContent(current)) {
    blocks.push(current)
  }

  const candidates = blocks
    .map((block, index) => candidateFromBlock(block.heading, block.lines.join("\n"), index))
    .filter((candidate) => candidate.raw_text.length > 0 || candidate.section_name)

  if (candidates.length > 0) return candidates

  const fallbackText = templateText.trim()
  if (!fallbackText) return []

  return [candidateFromBlock("Scope", fallbackText, 0)]
}
