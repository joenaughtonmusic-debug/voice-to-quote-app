import type { GreenwasteTreatment, SimpleExtraction, SimpleFrequency, SimpleJobType } from "./types"

/**
 * The single Simple Mode extraction call: transcript in, SimpleExtraction out.
 * The model extracts only — no classification (Joe picks the job type), no
 * pricing arithmetic, no invented amounts. Null always beats a guess.
 */

export const SIMPLE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    client_name: { type: ["string", "null"] },
    site_address: { type: ["string", "null"] },
    frequency: {
      type: ["string", "null"],
      enum: ["monthly", "6-weekly", "2-monthly", "3-monthly", "4-monthly", "other", null],
    },
    frequency_note: { type: ["string", "null"] },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          hours: { type: ["number", "null"] },
        },
        required: ["description", "hours"],
      },
    },
    stated_total_hours: { type: ["number", "null"] },
    spoken_rate: { type: ["number", "null"] },
    spoken_total: { type: ["number", "null"] },
    greenwaste: {
      type: "object",
      additionalProperties: false,
      properties: {
        treatment: { type: "string", enum: ["included", "separate_line", "not_mentioned"] },
        amount: { type: ["number", "null"] },
        note: { type: ["string", "null"] },
      },
      required: ["treatment", "amount", "note"],
    },
    extras: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          amount: { type: ["number", "null"] },
        },
        required: ["name", "amount"],
      },
    },
    internal_notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "client_name",
    "site_address",
    "frequency",
    "frequency_note",
    "tasks",
    "stated_total_hours",
    "spoken_rate",
    "spoken_total",
    "greenwaste",
    "extras",
    "internal_notes",
  ],
} as const

export function buildSimpleExtractionPrompt(jobType: SimpleJobType) {
  const jobContext =
    jobType === "maintenance"
      ? `This is an ONGOING GARDEN MAINTENANCE quote (recurring visits at a set frequency).
- frequency: the visit cadence if spoken (monthly / 6-weekly / 2-monthly / 3-monthly / 4-monthly). Use "other" for anything else (e.g. 6-monthly) and put the spoken cadence in frequency_note. Null if not mentioned.
- spoken_total: the PER-VISIT price if one is spoken.`
      : `This is a ONE-OFF GARDEN TIDY quote (single visit).
- frequency: always null for a tidy.
- spoken_total: the overall job price if one is spoken.`

  return `You extract facts from a NZ gardener's spoken or pasted site-visit notes. Extract ONLY — never calculate, never invent.

${jobContext}

Rules:
- Numbers (hours, rates, dollar amounts) only when EXPLICITLY spoken. Otherwise null. "so maybe $300" counts as a spoken total of 300. Never invent or estimate an amount.
- client_name / site_address: the customer's name and property address if present (often the first line, e.g. "Dan 54 Marua Road" → name "Dan", address "54 Marua Road"). Null when absent.
- tasks: each distinct piece of work as its own entry, wording kept close to what was said, with its spoken hours if given. Do not merge, split, or drop tasks. Greenwaste is NOT a task.
- stated_total_hours: an explicitly stated overall figure ("total of 3.5 hours") — takes priority over the per-task sum. Null if no total was stated.
- spoken_rate: an hourly rate only if spoken ("$85 an hour").
- greenwaste.treatment: "included" when greenwaste is covered by the price ("with greenwaste", "greenwaste included"), "separate_line" when it has its own charge or is to be charged separately, "not_mentioned" otherwise. greenwaste.amount only when a dollar figure is spoken for it.
- extras: separately mentioned chargeables (petrol, weedkiller, tool servicing, sprays) with spoken amounts or null.
- internal_notes: anything the customer must NOT see — day-of-week or scheduling reminders, access/key/alarm details, hazards, personal remarks. When in doubt between task and internal note: work being quoted is a task; how/when the crew does it is an internal note.
- The speaker is a gardener; expect trade terms and dictation errors (Tecoma, Michelia, Griselinia, buxus, stump paste, line trim, blow down). Correct obvious mis-transcriptions in place.

Return only the JSON schema.`
}

const FREQUENCIES: SimpleFrequency[] = ["monthly", "6-weekly", "2-monthly", "3-monthly", "4-monthly", "other"]
const TREATMENTS: GreenwasteTreatment[] = ["included", "separate_line", "not_mentioned"]

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asPositiveOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

/** Coerces the model's JSON into a well-typed SimpleExtraction; anything malformed becomes null/empty, never a guess. */
export function normalizeSimpleExtraction(raw: unknown): SimpleExtraction {
  const value = (raw ?? {}) as Record<string, unknown>
  const greenwasteRaw = (value.greenwaste ?? {}) as Record<string, unknown>
  const frequency = FREQUENCIES.includes(value.frequency as SimpleFrequency)
    ? (value.frequency as SimpleFrequency)
    : null
  const treatment = TREATMENTS.includes(greenwasteRaw.treatment as GreenwasteTreatment)
    ? (greenwasteRaw.treatment as GreenwasteTreatment)
    : "not_mentioned"

  const tasks = Array.isArray(value.tasks)
    ? value.tasks
        .map((task) => {
          const entry = (task ?? {}) as Record<string, unknown>
          const description = asStringOrNull(entry.description)
          return description ? { description, hours: asPositiveOrNull(entry.hours) } : null
        })
        .filter((task): task is { description: string; hours: number | null } => task !== null)
    : []

  const extras = Array.isArray(value.extras)
    ? value.extras
        .map((extra) => {
          const entry = (extra ?? {}) as Record<string, unknown>
          const name = asStringOrNull(entry.name)
          return name ? { name, amount: asPositiveOrNull(entry.amount) } : null
        })
        .filter((extra): extra is { name: string; amount: number | null } => extra !== null)
    : []

  const internalNotes = Array.isArray(value.internal_notes)
    ? value.internal_notes.map(asStringOrNull).filter((note): note is string => note !== null)
    : []

  return {
    client_name: asStringOrNull(value.client_name),
    site_address: asStringOrNull(value.site_address),
    frequency,
    frequency_note: asStringOrNull(value.frequency_note),
    tasks,
    stated_total_hours: asPositiveOrNull(value.stated_total_hours),
    spoken_rate: asPositiveOrNull(value.spoken_rate),
    spoken_total: asPositiveOrNull(value.spoken_total),
    greenwaste: {
      treatment,
      amount: asPositiveOrNull(greenwasteRaw.amount),
      note: asStringOrNull(greenwasteRaw.note),
    },
    extras,
    internal_notes: internalNotes,
  }
}
