import type { GreenwasteTreatment, ProjectArea, SimpleExtraction, SimpleFrequency, SimpleJobType } from "./types"
import { DEFAULT_DEPTH_MM } from "./project"

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

/** Project extraction: the transcript is split into work areas, each with dimensions, tasks and materials. */
export const PROJECT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    client_name: { type: ["string", "null"] },
    site_address: { type: ["string", "null"] },
    spoken_rate: { type: ["number", "null"] },
    spoken_total: { type: ["number", "null"] },
    areas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          length_m: { type: ["number", "null"] },
          width_m: { type: ["number", "null"] },
          extra_m2: { type: ["number", "null"] },
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
          block_hours: { type: ["number", "null"] },
          surface_material: { type: ["string", "null"] },
          needs_weedmat: { type: "boolean" },
          plants_count: { type: ["number", "null"] },
        },
        required: [
          "name",
          "length_m",
          "width_m",
          "extra_m2",
          "tasks",
          "block_hours",
          "surface_material",
          "needs_weedmat",
          "plants_count",
        ],
      },
    },
    internal_notes: { type: "array", items: { type: "string" } },
  },
  required: ["client_name", "site_address", "spoken_rate", "spoken_total", "areas", "internal_notes"],
} as const

export function buildProjectExtractionPrompt() {
  return `You extract facts from a NZ gardener's spoken or pasted site-visit notes for a ONE-OFF GARDEN PROJECT quoted area by area. Extract ONLY — never calculate, never invent.

The notes are usually organised under area headings (e.g. "Driveway part", "Area 2 next to house", "Under hedge area"). Each heading starts a new area. Do not merge, split, or drop areas.

Per area:
- name: the area heading, cleaned (e.g. "Driveway", "Beside house", "Under hedge").
- length_m / width_m: dimensions in METRES, only when explicitly spoken ("19m x .3m" → 19 and 0.3). Multiple lengths in one area ("5m then 10m") sum to one length. Null when not spoken — never assume a width.
- extra_m2: separately spoken square metreage ("then 1m2 past AC unit") → 1. Null otherwise.
- tasks: each distinct piece of work with its spoken hours ("Remove 6 hours" → description "Remove scoring and old weedmat", hours 6). Keep wording close to what was said.
- block_hours: a single block allowance for the whole area ("Maybe 8 hours") — null when hours are per task.
- surface_material: the surface product mentioned (e.g. "pebbles", "river pebbles", "black mulch", "scoria", "gap 40"). Null when none mentioned.
- needs_weedmat: true when weedmat is laid in this area.
- plants_count: number of plants to plant in this area ("Plant 9 x plants" → 9). Null when none.

Globals:
- client_name / site_address when present. spoken_rate / spoken_total only when EXPLICITLY spoken — never invent.
- internal_notes: scheduling reminders, access, hazards, anything the customer must not see. Note "scoring" likely means "scoria" — keep the spoken word in the task but add an internal note when you correct trade terms.

Return only the JSON schema.`
}

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

/** Coerces the model's project-area JSON into well-typed ProjectAreas; malformed input becomes null/empty, never a guess. */
export function normalizeProjectAreas(raw: unknown): ProjectArea[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const value = (entry ?? {}) as Record<string, unknown>
      const name = asStringOrNull(value.name)
      if (!name) return null
      const tasks = Array.isArray(value.tasks)
        ? value.tasks
            .map((task) => {
              const item = (task ?? {}) as Record<string, unknown>
              const description = asStringOrNull(item.description)
              return description ? { description, hours: asPositiveOrNull(item.hours) } : null
            })
            .filter((task): task is { description: string; hours: number | null } => task !== null)
        : []
      const widthM = asPositiveOrNull(value.width_m)
      return {
        name,
        lengthM: asPositiveOrNull(value.length_m),
        widthM,
        widthAssumed: widthM == null,
        extraM2: asPositiveOrNull(value.extra_m2),
        tasks,
        blockHours: asPositiveOrNull(value.block_hours),
        surfaceMaterial: asStringOrNull(value.surface_material) ?? "",
        depthMm: DEFAULT_DEPTH_MM,
        needsWeedmat: value.needs_weedmat === true,
        plantsCount: asPositiveOrNull(value.plants_count),
      } satisfies ProjectArea
    })
    .filter((area): area is ProjectArea => area !== null)
}

/** Project extraction → SimpleExtraction shape (with areas), so the screen has one contract. */
export function normalizeProjectExtraction(raw: unknown): SimpleExtraction {
  const value = (raw ?? {}) as Record<string, unknown>
  return {
    client_name: asStringOrNull(value.client_name),
    site_address: asStringOrNull(value.site_address),
    frequency: null,
    frequency_note: null,
    tasks: [],
    stated_total_hours: null,
    spoken_rate: asPositiveOrNull(value.spoken_rate),
    spoken_total: asPositiveOrNull(value.spoken_total),
    greenwaste: { treatment: "not_mentioned", amount: null, note: null },
    extras: [],
    internal_notes: Array.isArray(value.internal_notes)
      ? value.internal_notes.map(asStringOrNull).filter((note): note is string => note !== null)
      : [],
    areas: normalizeProjectAreas(value.areas),
  }
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
