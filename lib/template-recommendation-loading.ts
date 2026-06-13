export const TEMPLATE_RECOMMENDATION_SELECT_FIELDS = [
  "id",
  "user_id",
  "name",
  "template_name",
  "trade",
  "job_type",
  "category",
  "default_scope",
  "default_exclusions",
  "default_pricing_structure",
  "template_content",
  "source_type",
  "source_filename",
  "source_text",
  "status",
  "created_at",
  "updated_at",
] as const

export const TEMPLATE_RECOMMENDATION_FALLBACK_SELECT_FIELDS = [
  "id",
  "user_id",
  "name",
  "template_name",
  "trade",
  "job_type",
  "category",
  "source_type",
  "source_filename",
  "status",
  "created_at",
  "updated_at",
] as const

export const TEMPLATE_RECOMMENDATION_SELECT = TEMPLATE_RECOMMENDATION_SELECT_FIELDS.join(", ")
export const TEMPLATE_RECOMMENDATION_FALLBACK_SELECT = TEMPLATE_RECOMMENDATION_FALLBACK_SELECT_FIELDS.join(", ")

export function isMissingOptionalTemplateColumnError(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  const code = errorCode(error)

  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("column")
  )
}

function errorMessage(error: unknown) {
  if (!error) return ""
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "")
  return ""
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return ""
  return String((error as { code?: unknown }).code ?? "")
}
