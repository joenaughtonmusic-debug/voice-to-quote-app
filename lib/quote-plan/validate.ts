import { buildQuotePlan } from "./build-plan"
import { isStructuralNonPlantLabel } from "../calculators/planting"
import type {
  BucketMeasurements,
  BuildQuotePlanInput,
  LabourAllocation,
  MaterialNeed,
  PlanConfidence,
  PlanUncertainty,
  QuotePlan,
  WorkBucket,
} from "./types"

/**
 * QuotePlan validation & normalisation (QuotePlan Milestone 3).
 *
 * A future AI QuotePlan Planner will emit a QuotePlan-shaped *draft*. Raw AI output must
 * never drive pricing/rendering directly — it must first pass these DETERMINISTIC
 * checks. `resolveQuotePlan` normalises a draft into a well-typed QuotePlan, validates
 * it, and either accepts it, marks it normalised, or falls back to the deterministic
 * `buildQuotePlan`. No OpenAI, no network, no environment variables — this is the safe
 * gate the planner will sit behind.
 */

export type QuotePlanValidationSeverity = "error" | "warning" | "info"

export type QuotePlanValidationFinding = {
  /** Stable machine code, e.g. "missing_main_bucket" | "invalid_labour_value". */
  code: string
  message: string
  /** Dotted path to the offending field, e.g. "main.labour[0].hours". */
  path?: string
  bucketId?: string
  severity: QuotePlanValidationSeverity
}

export type QuotePlanResolutionStatus = "accepted" | "normalised" | "fallback"

export type QuotePlanResolution = {
  plan: QuotePlan
  status: QuotePlanResolutionStatus
  findings: QuotePlanValidationFinding[]
}

/** A loosely-typed, AI-produced draft plan. Every field is treated as untrusted. */
export type DraftQuotePlan = Record<string, unknown>

/** quoteTypes the app understands today. An unknown value is a warning, not an error —
 * a novel-but-valid classification should still be accepted (deterministically). */
const KNOWN_QUOTE_TYPES = new Set([
  "maintenance",
  "one_off_tidy",
  "landscaping",
  "general_landscaping",
  "planting",
  "hedge_trimming",
  "hedge_planting",
  "decking",
  "retaining",
  "paving",
  "fencing",
  "garden_bed_renovation",
  "arborist",
  "building",
  "electrical",
  "plumbing",
  "painting",
  "cleaning",
  "general",
])

// An optionality marker in a MAIN bucket's labour text is a strong signal that optional
// labour was mis-attributed to the main bucket (mirrors buildQuotePlan's own marker).
const MAIN_LABOUR_OPTIONALITY_MARKER =
  /\b(optional|option\s+for|as\s+an?\s+option|optionally|if\s+(?:required|wanted|desired)|labour\s+for\s+that)\b/i

// Plausibility bounds — a value outside these is almost certainly a mis-parse.
const MEASUREMENT_BOUNDS = {
  lengthM: { min: 0, max: 1000 },
  areaM2: { min: 0, max: 100000 },
  depthMm: { min: 0, max: 2000 },
  spacingMm: { min: 10, max: 5000 },
  count: { min: 1, max: 100000 },
} as const

// ── coercion helpers ─────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function coerceStringArray(value: unknown): string[] {
  return asArray(value)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
}

/** Accepts a number or a numeric string ("16", "12.5", "$129"). Returns null when the
 * field is absent/blank, and NaN-null when present-but-unparseable (so the caller can
 * distinguish "omitted" from "invalid"). */
function coerceNumber(value: unknown): { value: number | null; wasString: boolean; present: boolean } {
  if (value === undefined || value === null || value === "") return { value: null, wasString: false, present: false }
  if (typeof value === "number") return { value: Number.isFinite(value) ? value : null, wasString: false, present: true }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.\-]/g, ""))
    return { value: Number.isFinite(parsed) ? parsed : null, wasString: true, present: true }
  }
  return { value: null, wasString: false, present: true }
}

// ── normalisation (untrusted draft → well-typed QuotePlan) ───────────────────

type NormaliseContext = { findings: QuotePlanValidationFinding[]; changed: boolean }

function finding(
  ctx: NormaliseContext,
  severity: QuotePlanValidationSeverity,
  code: string,
  message: string,
  extra: { path?: string; bucketId?: string } = {},
) {
  ctx.findings.push({ code, message, severity, ...extra })
}

function normaliseLabour(raw: unknown, path: string, bucketId: string, ctx: NormaliseContext): LabourAllocation | null {
  const rec = asRecord(raw)
  if (!rec) {
    finding(ctx, "warning", "malformed_labour", "Labour allocation is not an object; dropped.", { path, bucketId })
    ctx.changed = true
    return null
  }
  const result: LabourAllocation = { raw: coerceString(rec.raw), determinacy: "missing" }
  for (const key of ["people", "days", "hours"] as const) {
    const parsed = coerceNumber(rec[key])
    if (!parsed.present) continue
    if (parsed.value === null) {
      finding(ctx, "warning", "unparseable_labour_value", `Could not parse labour ${key}; omitted.`, {
        path: `${path}.${key}`,
        bucketId,
      })
      ctx.changed = true
      continue
    }
    if (parsed.wasString) ctx.changed = true
    result[key] = parsed.value
  }
  const declaredDeterminacy = coerceString(rec.determinacy)
  if (declaredDeterminacy === "explicit" || declaredDeterminacy === "inferred" || declaredDeterminacy === "missing") {
    result.determinacy = declaredDeterminacy
  } else {
    result.determinacy = result.people != null || result.days != null || result.hours != null ? "explicit" : "missing"
    if (declaredDeterminacy) {
      finding(ctx, "warning", "invalid_labour_determinacy", `Unknown labour determinacy "${declaredDeterminacy}"; defaulted.`, {
        path: `${path}.determinacy`,
        bucketId,
      })
      ctx.changed = true
    }
  }
  return result
}

function normaliseMaterial(raw: unknown, path: string, bucketId: string, ctx: NormaliseContext): MaterialNeed | null {
  const rec = asRecord(raw)
  if (!rec) {
    finding(ctx, "warning", "malformed_material", "Material is not an object; dropped.", { path, bucketId })
    ctx.changed = true
    return null
  }
  const name = coerceString(rec.name)
  if (!name) {
    finding(ctx, "warning", "material_missing_name", "Material has no name; dropped.", { path, bucketId })
    ctx.changed = true
    return null
  }
  const material: MaterialNeed = { name, optional: Boolean(rec.optional) }
  const quantity = rec.quantity
  if (typeof quantity === "number") {
    material.quantity = String(quantity)
    ctx.changed = true
  } else if (typeof quantity === "string" && quantity.trim()) {
    material.quantity = quantity.trim()
  }
  const unit = coerceString(rec.unit)
  if (unit) material.unit = unit
  return material
}

function normaliseMeasurements(raw: unknown, path: string, bucketId: string, ctx: NormaliseContext): BucketMeasurements | undefined {
  const rec = asRecord(raw)
  if (!rec) return undefined
  const measurements: BucketMeasurements = {}
  for (const key of ["lengthM", "areaM2", "depthMm", "spacingMm", "count"] as const) {
    const parsed = coerceNumber(rec[key])
    if (!parsed.present) continue
    if (parsed.value === null) {
      finding(ctx, "warning", "unparseable_measurement", `Could not parse measurement ${key}; omitted.`, {
        path: `${path}.${key}`,
        bucketId,
      })
      ctx.changed = true
      continue
    }
    if (parsed.wasString) ctx.changed = true
    measurements[key] = parsed.value
  }
  const provenance = coerceStringArray(rec.provenance)
  if (provenance.length > 0) measurements.provenance = provenance
  return Object.keys(measurements).length > 0 ? measurements : undefined
}

function normaliseBucket(
  raw: unknown,
  expectedKind: "main" | "optional",
  defaultId: string,
  ctx: NormaliseContext,
): WorkBucket | null {
  const rec = asRecord(raw)
  if (!rec) {
    finding(ctx, "error", "malformed_bucket", `${expectedKind} bucket is not an object.`, { path: defaultId })
    return null
  }
  const id = coerceString(rec.id) || defaultId
  if (!coerceString(rec.id)) ctx.changed = true
  const title = coerceString(rec.title) || (expectedKind === "main" ? "Main works" : "Optional works")
  if (!coerceString(rec.title)) ctx.changed = true

  const declaredKind = coerceString(rec.kind)
  let kind: "main" | "optional"
  if (declaredKind === "main" || declaredKind === "optional") {
    kind = declaredKind
  } else {
    kind = expectedKind
    ctx.changed = true
    if (declaredKind) {
      finding(ctx, "warning", "invalid_bucket_kind", `Unknown bucket kind "${declaredKind}"; defaulted to "${expectedKind}".`, {
        path: `${id}.kind`,
        bucketId: id,
      })
    }
  }

  const labour = asArray(rec.labour)
    .map((item, index) => normaliseLabour(item, `${id}.labour[${index}]`, id, ctx))
    .filter((item): item is LabourAllocation => item !== null)
  const materials = asArray(rec.materials)
    .map((item, index) => normaliseMaterial(item, `${id}.materials[${index}]`, id, ctx))
    .filter((item): item is MaterialNeed => item !== null)

  return {
    id,
    title,
    kind,
    scope: coerceStringArray(rec.scope),
    labour,
    materials,
    measurements: normaliseMeasurements(rec.measurements, `${id}.measurements`, id, ctx),
    sourceText: coerceString(rec.sourceText),
  }
}

function normaliseConfidence(value: unknown, ctx: NormaliseContext): PlanConfidence {
  const text = coerceString(value).toLowerCase()
  if (text === "high" || text === "medium" || text === "low") return text
  ctx.changed = true
  return "low"
}

function normaliseUncertainties(raw: unknown, ctx: NormaliseContext): PlanUncertainty[] {
  return asArray(raw)
    .map((item): PlanUncertainty | null => {
      const rec = asRecord(item)
      if (!rec) {
        finding(ctx, "warning", "malformed_uncertainty", "Uncertainty is not an object; dropped.")
        ctx.changed = true
        return null
      }
      const message = coerceString(rec.message)
      if (!message) {
        finding(ctx, "warning", "uncertainty_missing_message", "Uncertainty has no message; dropped.")
        ctx.changed = true
        return null
      }
      const severity = coerceString(rec.severity) === "warning" ? "warning" : "info"
      const uncertainty: PlanUncertainty = { field: coerceString(rec.field) || "unknown", message, severity }
      const bucketId = coerceString(rec.bucketId)
      if (bucketId) uncertainty.bucketId = bucketId
      return uncertainty
    })
    .filter((item): item is PlanUncertainty => item !== null)
}

/** Normalise an untrusted draft into a well-typed QuotePlan (or null when unrecoverable,
 * e.g. no main bucket). Type coercions and dropped fields are recorded in `findings`. */
export function normaliseDraftQuotePlan(draft: unknown): {
  plan: QuotePlan | null
  findings: QuotePlanValidationFinding[]
  changed: boolean
} {
  const ctx: NormaliseContext = { findings: [], changed: false }
  const rec = asRecord(draft)
  if (!rec) {
    finding(ctx, "error", "plan_not_object", "Draft plan is not an object.")
    return { plan: null, findings: ctx.findings, changed: true }
  }

  const main = normaliseBucket(rec.main, "main", "main", ctx)
  if (!main) {
    finding(ctx, "error", "missing_main_bucket", "Draft plan has no usable main bucket.")
    return { plan: null, findings: ctx.findings, changed: true }
  }

  const optional = asArray(rec.optional)
    .map((item, index) => normaliseBucket(item, "optional", `optional-${index + 1}`, ctx))
    .filter((item): item is WorkBucket => item !== null)

  const cadence = coerceString(rec.cadence)
  const plan: QuotePlan = {
    quoteType: coerceString(rec.quoteType),
    quoteTypeConfidence: normaliseConfidence(rec.quoteTypeConfidence, ctx),
    main,
    optional,
    exclusions: coerceStringArray(rec.exclusions),
    cadence: cadence || undefined,
    uncertainties: normaliseUncertainties(rec.uncertainties, ctx),
  }

  return { plan, findings: ctx.findings, changed: ctx.changed }
}

// ── validation (well-typed QuotePlan → findings) ─────────────────────────────

function validateLabour(bucket: WorkBucket, findings: QuotePlanValidationFinding[]) {
  bucket.labour.forEach((allocation, index) => {
    for (const key of ["people", "days", "hours"] as const) {
      const value = allocation[key]
      if (value === undefined) continue
      if (!Number.isFinite(value) || value <= 0) {
        findings.push({
          code: "invalid_labour_value",
          message: `Labour ${key} must be a positive finite number, got ${value}.`,
          path: `${bucket.id}.labour[${index}].${key}`,
          bucketId: bucket.id,
          severity: "error",
        })
      }
    }
  })
}

function validateMeasurements(bucket: WorkBucket, findings: QuotePlanValidationFinding[]) {
  const measurements = bucket.measurements
  if (!measurements) return
  ;(["lengthM", "areaM2", "depthMm", "spacingMm", "count"] as const).forEach((key) => {
    const value = measurements[key]
    if (value === undefined) return
    if (!Number.isFinite(value) || value <= 0) {
      findings.push({
        code: "invalid_measurement",
        message: `Measurement ${key} must be a positive finite number, got ${value}.`,
        path: `${bucket.id}.measurements.${key}`,
        bucketId: bucket.id,
        severity: "error",
      })
      return
    }
    const bounds = MEASUREMENT_BOUNDS[key]
    if (value < bounds.min || value > bounds.max) {
      findings.push({
        code: "implausible_measurement",
        message: `Measurement ${key}=${value} is outside the plausible range ${bounds.min}–${bounds.max}.`,
        path: `${bucket.id}.measurements.${key}`,
        bucketId: bucket.id,
        severity: "warning",
      })
    }
  })

  // A planting length must not come from a structural / non-plant item. If the bucket
  // carrying a lengthM is clearly structural (retaining wall / fence / topsoil …), the
  // length was mis-attributed as a planting measurement.
  if (measurements.lengthM !== undefined) {
    const structuralText = [bucket.title, ...bucket.scope, ...(measurements.provenance ?? [])].join(" ")
    if (isStructuralNonPlantLabel(structuralText)) {
      findings.push({
        code: "plant_measurement_on_structural_bucket",
        message: `A planting length is attributed to a structural bucket ("${bucket.title}"); it must not be used as a plant measurement.`,
        path: `${bucket.id}.measurements.lengthM`,
        bucketId: bucket.id,
        severity: "error",
      })
    }
  }
}

function validateMaterials(bucket: WorkBucket, findings: QuotePlanValidationFinding[]) {
  bucket.materials.forEach((material, index) => {
    if (material.quantity === undefined) return
    const numeric = Number(material.quantity.replace(/[^0-9.\-]/g, ""))
    if (Number.isFinite(numeric) && numeric < 0) {
      findings.push({
        code: "negative_material_quantity",
        message: `Material "${material.name}" has a negative quantity (${material.quantity}).`,
        path: `${bucket.id}.materials[${index}].quantity`,
        bucketId: bucket.id,
        severity: "error",
      })
    }
  })
}

/** Deterministic structural + semantic validation of a well-typed QuotePlan. */
export function validateQuotePlan(plan: QuotePlan): QuotePlanValidationFinding[] {
  const findings: QuotePlanValidationFinding[] = []

  if (!plan.quoteType) {
    findings.push({ code: "missing_quote_type", message: "quoteType is required.", severity: "error" })
  } else if (!KNOWN_QUOTE_TYPES.has(plan.quoteType.toLowerCase())) {
    findings.push({
      code: "unknown_quote_type",
      message: `quoteType "${plan.quoteType}" is not a known type.`,
      severity: "warning",
    })
  }

  if (!plan.main) {
    findings.push({ code: "missing_main_bucket", message: "main bucket is required.", severity: "error" })
    return findings
  }
  if (plan.main.kind !== "main") {
    findings.push({
      code: "main_bucket_wrong_kind",
      message: `main bucket kind must be "main", got "${plan.main.kind}".`,
      path: `${plan.main.id}.kind`,
      bucketId: plan.main.id,
      severity: "error",
    })
  }

  // Bucket id/kind integrity: unique ids, no bucket both main and optional.
  const seenIds = new Set<string>([plan.main.id])
  plan.optional.forEach((bucket) => {
    if (bucket.kind !== "optional") {
      findings.push({
        code: "optional_bucket_wrong_kind",
        message: `optional bucket "${bucket.id}" kind must be "optional", got "${bucket.kind}".`,
        path: `${bucket.id}.kind`,
        bucketId: bucket.id,
        severity: "error",
      })
    }
    if (bucket.id === plan.main.id) {
      findings.push({
        code: "bucket_main_and_optional",
        message: `bucket "${bucket.id}" appears as both main and optional.`,
        bucketId: bucket.id,
        severity: "error",
      })
    } else if (seenIds.has(bucket.id)) {
      findings.push({
        code: "duplicate_bucket_id",
        message: `duplicate bucket id "${bucket.id}".`,
        bucketId: bucket.id,
        severity: "error",
      })
    }
    seenIds.add(bucket.id)
  })

  // Optional labour must not be mis-attributed to the main bucket.
  plan.main.labour.forEach((allocation, index) => {
    if (MAIN_LABOUR_OPTIONALITY_MARKER.test(allocation.raw)) {
      findings.push({
        code: "optional_labour_in_main",
        message: `Main labour "${allocation.raw}" carries an optionality marker; it likely belongs to an optional bucket.`,
        path: `main.labour[${index}].raw`,
        bucketId: plan.main.id,
        severity: "error",
      })
    }
  })

  for (const bucket of [plan.main, ...plan.optional]) {
    validateLabour(bucket, findings)
    validateMeasurements(bucket, findings)
    validateMaterials(bucket, findings)
  }

  return findings
}

// ── safe resolution (the seam an AI planner will sit behind) ─────────────────

/**
 * Resolve a (possibly AI-generated) draft plan into a trusted QuotePlan.
 *
 * - `draft` null/undefined → deterministic `buildQuotePlan` (status "fallback").
 * - draft normalises + validates with NO error findings → "accepted" (or "normalised"
 *   when coercions/drops were applied).
 * - draft has ANY error finding (or cannot be normalised) → deterministic
 *   `buildQuotePlan` (status "fallback"), so invalid AI output can never corrupt the
 *   quote. All findings are always returned for review.
 */
export function resolveQuotePlan(input: {
  draft: unknown
  fallbackInput: BuildQuotePlanInput
}): QuotePlanResolution {
  const { draft, fallbackInput } = input

  if (draft === null || draft === undefined) {
    return {
      plan: buildQuotePlan(fallbackInput),
      status: "fallback",
      findings: [
        { code: "no_draft_plan", message: "No draft plan supplied; used deterministic buildQuotePlan.", severity: "info" },
      ],
    }
  }

  const { plan, findings: normFindings, changed } = normaliseDraftQuotePlan(draft)
  if (!plan) {
    return {
      plan: buildQuotePlan(fallbackInput),
      status: "fallback",
      findings: [
        ...normFindings,
        {
          code: "unusable_draft_plan",
          message: "Draft plan could not be normalised; used deterministic buildQuotePlan.",
          severity: "warning",
        },
      ],
    }
  }

  const findings = [...normFindings, ...validateQuotePlan(plan)]
  if (findings.some((f) => f.severity === "error")) {
    return { plan: buildQuotePlan(fallbackInput), status: "fallback", findings }
  }

  return { plan, status: changed ? "normalised" : "accepted", findings }
}
