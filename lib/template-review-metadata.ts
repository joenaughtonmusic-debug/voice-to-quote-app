import type { QuoteTemplateLibraryItem } from "./template-import-learning"

type ReviewTemplateInput = {
  userId: string
  importName?: string | null
  importFilename?: string | null
  sourceText: string
  sectionCount: number
  existingTemplates?: QuoteTemplateLibraryItem[]
}

type ReviewedTemplateUpdateInput = {
  template?: QuoteTemplateLibraryItem | null
  sectionCount: number
  reviewedAt: string
}

export function buildReviewTemplateCreatePayload({
  userId,
  importName,
  importFilename,
  sourceText,
  sectionCount,
  existingTemplates = [],
}: ReviewTemplateInput) {
  const sourceTemplate = findSourceTemplateMetadata({ importName, importFilename, sourceText, existingTemplates })
  const sourceContent = objectRecord(sourceTemplate?.template_content)
  const sourceName = sourceTemplateName(sourceTemplate, sourceContent)
  const inferredName = inferTemplateName(sourceText)
  const templateName = cleanString(importName) || cleanString(sourceName) || cleanString(importFilename) || inferredName || "Imported Quote Template"
  const category = cleanString(sourceTemplate?.category) || cleanString(sourceContent.category) || inferTemplateCategory(templateName, sourceText)
  const inferred = inferTradeJobType(category, templateName, sourceText)
  const trade = cleanString(sourceTemplate?.trade) || cleanString(sourceContent.trade) || inferred.trade
  const jobType = cleanString(sourceTemplate?.job_type) || cleanString(sourceContent.job_type) || inferred.jobType

  return {
    user_id: userId,
    name: templateName,
    template_name: templateName,
    category,
    trade,
    job_type: jobType,
    source_type: importFilename ? "plain_text_file" : "pasted_text",
    source_filename: importFilename || null,
    source_text: sourceText,
    status: "draft",
    default_scope: sourceTemplate?.default_scope ?? sourceContent.standard_scope ?? sourceContent.default_scope ?? [],
    default_exclusions:
      sourceTemplate?.default_exclusions ?? sourceContent.standard_exclusions ?? sourceContent.default_exclusions ?? [],
    default_pricing_structure:
      sourceTemplate?.default_pricing_structure ??
      sourceContent.pricing_rules ??
      sourceContent.default_pricing_structure ??
      [],
    template_content: mergeTemplateReviewMetadata(sourceTemplate?.template_content ?? sourceContent, {
      source: "template_import_learning",
      phase: 3,
      section_count: sectionCount,
      source_template_id: sourceTemplate?.id ?? null,
    }),
  }
}

export function buildReviewedTemplateUpdatePayload({ template, sectionCount, reviewedAt }: ReviewedTemplateUpdateInput) {
  const content = objectRecord(template?.template_content)
  const templateName = cleanString(template?.template_name) || cleanString(template?.name) || cleanString(content.template_name)
  const category = cleanString(template?.category) || cleanString(content.category) || inferTemplateCategory(templateName, template?.source_text)
  const inferred = inferTradeJobType(category, templateName, template?.source_text)

  return {
    status: "reviewed",
    ...(templateName ? { template_name: templateName, name: templateName } : {}),
    category,
    trade: cleanString(template?.trade) || cleanString(content.trade) || inferred.trade,
    job_type: cleanString(template?.job_type) || cleanString(content.job_type) || inferred.jobType,
    default_scope: template?.default_scope ?? content.standard_scope ?? content.default_scope ?? [],
    default_exclusions: template?.default_exclusions ?? content.standard_exclusions ?? content.default_exclusions ?? [],
    default_pricing_structure: template?.default_pricing_structure ?? content.pricing_rules ?? content.default_pricing_structure ?? [],
    template_content: mergeTemplateReviewMetadata(template?.template_content ?? content, {
      source: "template_import_learning",
      phase: 3,
      section_count: sectionCount,
      reviewed_at: reviewedAt,
    }),
  }
}

function findSourceTemplateMetadata({
  importName,
  importFilename,
  sourceText,
  existingTemplates,
}: {
  importName?: string | null
  importFilename?: string | null
  sourceText: string
  existingTemplates: QuoteTemplateLibraryItem[]
}) {
  const nameNeedles = [importName, importFilename].map(normalize).filter(Boolean)
  const source = normalize(sourceText)

  return existingTemplates.find((template) => {
    const templateName = normalize(sourceTemplateName(template, objectRecord(template.template_content)))
    const sourceFilename = normalize(template.source_filename)
    const templateText = normalize(template.source_text)
    const defaultText = normalize(toText([template.default_scope, template.default_exclusions, template.default_pricing_structure]))
    const contentText = normalize(toText(template.template_content))

    if (nameNeedles.some((needle) => needle && (templateName.includes(needle) || needle.includes(templateName)))) return true
    if (source && templateText && (source.includes(templateText) || templateText.includes(source))) return true
    if (source && defaultText && source.includes(defaultText)) return true
    if (source && contentText && contentText.includes(source.slice(0, 160))) return true
    return Boolean(sourceFilename && nameNeedles.includes(sourceFilename))
  })
}

function sourceTemplateName(template: QuoteTemplateLibraryItem | undefined | null, content: Record<string, unknown>) {
  return template?.template_name || template?.name || cleanString(content.template_name)
}

function mergeTemplateReviewMetadata(templateContent: unknown, reviewMetadata: Record<string, unknown>) {
  const content = objectRecord(templateContent)
  return {
    ...content,
    template_review: {
      ...objectRecord(content.template_review),
      ...reviewMetadata,
    },
  }
}

function inferTemplateName(sourceText: string) {
  const firstTitle = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line.length <= 100 && /\b(template|quote|estimate|maintenance|tidy|landscaping|decking|retaining)\b/i.test(line))

  return firstTitle || null
}

function inferTemplateCategory(templateName?: string | null, sourceText?: string | null) {
  const text = normalize([templateName, sourceText].filter(Boolean).join(" "))

  if (/\b(retaining|retainer)\b/.test(text)) return "retaining"
  if (/\b(decking|deck)\b/.test(text)) return "decking"
  if (/\b(planting|plant supply|plants?|hedge planting|ficus|griselinia|lomandra)\b/.test(text)) return "planting"
  if (/\b(landscaping|paving|aggregate|scoria|hardscape)\b/.test(text)) return "landscaping"
  if (/\b(maintenance|garden tidy|property tidy|one off tidy|greenwaste|green waste|weeding|pruning)\b/.test(text)) return "maintenance"
  if (/\b(hedge|trimming|pruning)\b/.test(text)) return "hedge"

  return "custom"
}

function inferTradeJobType(category?: string | null, templateName?: string | null, sourceText?: string | null) {
  const text = normalize([category, templateName, sourceText].filter(Boolean).join(" "))
  const normalizedCategory = normalize(category)

  if (normalizedCategory === "maintenance") {
    if (/\b(garden tidy|property tidy|one off tidy|one off|single visit)\b/.test(text)) {
      return { trade: "maintenance", jobType: "garden_tidy" }
    }
    return { trade: "maintenance", jobType: "maintenance" }
  }

  if (normalizedCategory === "planting") return { trade: "planting", jobType: "planting" }
  if (normalizedCategory === "decking") return { trade: "decking", jobType: "decking" }
  if (normalizedCategory === "retaining") return { trade: "retaining", jobType: "retaining" }
  if (normalizedCategory === "landscaping") return { trade: "landscaping", jobType: "landscaping" }
  if (normalizedCategory === "hedge") return { trade: "maintenance", jobType: "hedge" }

  return { trade: null, jobType: null }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function toText(value: unknown): string {
  if (Array.isArray(value)) return value.map(toText).join(" ")
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (!value || typeof value !== "object") return ""
  return Object.values(value as Record<string, unknown>).map(toText).join(" ")
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
