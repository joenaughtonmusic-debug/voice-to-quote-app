import type { BuildQuotePlanInput } from "./types"

/**
 * AI QuotePlan Planner — SHADOW MODE (QuotePlan Milestone 4).
 *
 * Produces a QuotePlan-shaped *draft* from the transcript + extraction using OpenAI.
 * The draft is UNTRUSTED: it is only ever handed to `resolveQuotePlan` (the deterministic
 * validation gate) and compared against the deterministic `buildQuotePlan` for logging.
 * It never drives pricing, rendering or export. See lib/quote-plan/shadow.ts for the
 * comparison/logging, and processTranscriptToQuote for the (flag-gated) wiring.
 *
 * Gating: OFF unless `ENABLE_QUOTE_PLAN_SHADOW` is truthy AND an OpenAI API key is present.
 * Off by default → no OpenAI call, no runtime change. Tests inject `callModel`, so no test
 * ever performs a live OpenAI request.
 */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const DEFAULT_MODEL = process.env.OPENAI_QUOTE_PLAN_MODEL ?? process.env.OPENAI_QUOTE_MODEL ?? "gpt-4o-mini"
const PLANNER_TIMEOUT_MS = 45000

export const QUOTE_PLAN_SHADOW_ENV = "ENABLE_QUOTE_PLAN_SHADOW"

/** The raw-JSON model call, injectable so tests never touch the network. */
export type QuotePlanModelCaller = (args: {
  systemPrompt: string
  userPrompt: string
  signal?: AbortSignal
}) => Promise<string>

export type AiQuotePlanDeps = {
  /** Override the model call entirely (tests pass a stub that returns canned JSON). */
  callModel?: QuotePlanModelCaller
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function isTruthyFlag(value: string | undefined): boolean {
  const flag = (value ?? "").trim().toLowerCase()
  return flag === "1" || flag === "true" || flag === "on" || flag === "yes"
}

/**
 * The shadow planner is OFF unless it is explicitly enabled AND an API key exists.
 * Both conditions are required so a stray flag in an environment without a key can never
 * attempt (and log noise about) a live call.
 */
export function isShadowPlannerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env[QUOTE_PLAN_SHADOW_ENV]) && Boolean((env.OPENAI_API_KEY ?? "").trim())
}

// ── prompt ───────────────────────────────────────────────────────────────────

export function buildPlannerSystemPrompt(): string {
  return `You are a planning assistant for an NZ trades quoting app. Given a job transcript and
an already-extracted quote, produce a QuotePlan: the pre-pricing structure that makes the
MAIN work vs OPTIONAL work boundary explicit, with labour, materials and measurements
attributed to the bucket they belong to.

Return ONLY a JSON object with this shape:
{
  "quoteType": string,                // e.g. "maintenance" | "landscaping" | "planting" | "hedge_trimming" ...
  "quoteTypeConfidence": "high" | "medium" | "low",
  "main": Bucket,                     // the primary work the customer is buying
  "optional": Bucket[],              // extra works offered as options (may be empty)
  "exclusions": string[],
  "cadence": string,                 // recurring cadence if any, else ""
  "uncertainties": [{ "field": string, "message": string, "severity": "info" | "warning", "bucketId": string }]
}
where Bucket = {
  "id": string,                      // "main", "optional-1", "optional-2", ...
  "title": string,
  "kind": "main" | "optional",
  "scope": string[],
  "labour": [{ "raw": string, "people": number, "days": number, "hours": number, "determinacy": "explicit" | "inferred" | "missing" }],
  "materials": [{ "name": string, "quantity": string, "unit": string, "optional": boolean }],
  "measurements": { "lengthM": number, "areaM2": number, "depthMm": number, "spacingMm": number, "count": number, "provenance": string[] },
  "sourceText": string               // the transcript span this bucket came from
}

Critical rules:
- Labour is OWNED by its bucket. Labour that clearly belongs to an OPTIONAL work (e.g. an
  optional hedge's "two people for one day") must go in that optional bucket's labour, NEVER
  in the main bucket's labour.
- Only include a numeric labour/measurement value when the transcript states or clearly implies
  it. Omit fields you cannot ground; do not invent numbers.
- A planting length (lengthM) must never be attributed to a structural item (retaining wall,
  fence, topsoil, path). Keep such measurements on the structural bucket.
- Put the transcript wording each bucket came from in "sourceText", and cite measurement
  phrases in "measurements.provenance".
- exactly one "main" bucket.`
}

export function buildPlannerUserPrompt(input: BuildQuotePlanInput): string {
  const { transcript, classification, extraction } = input
  const extractionSummary = {
    quote_title: extraction.quote_title,
    job_type: extraction.job_type,
    primary_quote: extraction.primary_quote,
    optional_quotes: extraction.optional_quotes,
    materials: extraction.materials,
    labour_allowance: extraction.labour_allowance,
    exclusions: extraction.exclusions,
  }
  return [
    `Classification: ${classification.specialist}${classification.reason ? ` (${classification.reason})` : ""}`,
    "",
    "Transcript:",
    transcript,
    "",
    "Already-extracted quote (for reference; do not just copy it — re-attribute labour/measurements to the right bucket):",
    JSON.stringify(extractionSummary, null, 2),
  ].join("\n")
}

// ── output parsing (tolerant; the draft is validated downstream) ──────────────

/** Parse the model's raw text into a candidate object. Returns null when it is not usable
 * JSON — the caller (resolveQuotePlan) then safely falls back to buildQuotePlan. */
export function parsePlannerOutput(raw: string): unknown {
  const text = (raw ?? "").trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // Best-effort: pull the first balanced-looking object out of a chatty response.
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

// ── default (live) model caller ───────────────────────────────────────────────

function getOutputText(result: unknown): string | null {
  const record = result as { output_text?: unknown; output?: unknown } | null
  if (record && typeof record.output_text === "string") return record.output_text
  const output = Array.isArray(record?.output) ? (record?.output as unknown[]) : []
  for (const item of output) {
    const content = (item as { content?: unknown })?.content
    for (const entry of Array.isArray(content) ? content : []) {
      const typed = entry as { type?: unknown; text?: unknown }
      if (typed?.type === "output_text" && typeof typed.text === "string") return typed.text
    }
  }
  return null
}

function defaultModelCaller(deps: AiQuotePlanDeps): QuotePlanModelCaller {
  return async ({ systemPrompt, userPrompt }) => {
    const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error("Quote plan shadow planner requires an OpenAI API key.")
    const fetchImpl = deps.fetchImpl ?? fetch
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), deps.timeoutMs ?? PLANNER_TIMEOUT_MS)
    try {
      const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: deps.model ?? DEFAULT_MODEL,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          text: { format: { type: "json_object" } },
        }),
        signal: controller.signal,
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          typeof (result as { error?: { message?: unknown } })?.error?.message === "string"
            ? (result as { error: { message: string } }).error.message
            : "Quote plan shadow planner request failed."
        throw new Error(message)
      }
      const outputText = getOutputText(result)
      if (!outputText) throw new Error("Quote plan shadow planner returned no JSON.")
      return outputText
    } finally {
      clearTimeout(timeout)
    }
  }
}

/**
 * Produce an untrusted QuotePlan-shaped draft for the shadow comparison. Never call this
 * directly for output — always route the result through `resolveQuotePlan`.
 */
export async function buildAiQuotePlanDraft(input: BuildQuotePlanInput, deps: AiQuotePlanDeps = {}): Promise<unknown> {
  const call = deps.callModel ?? defaultModelCaller(deps)
  const raw = await call({
    systemPrompt: buildPlannerSystemPrompt(),
    userPrompt: buildPlannerUserPrompt(input),
  })
  return parsePlannerOutput(raw)
}
