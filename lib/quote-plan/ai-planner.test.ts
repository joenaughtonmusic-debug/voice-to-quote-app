import assert from "node:assert/strict"
import test from "node:test"

import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "../processed-quote"
import {
  buildAiQuotePlanDraft,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  isShadowPlannerEnabled,
  parsePlannerOutput,
} from "./ai-planner"
import { resolveQuotePlan } from "./validate"
import type { BuildQuotePlanInput } from "./types"

/**
 * AI QuotePlan Planner — unit tests. `callModel` is always injected, so NO test performs a
 * live OpenAI request and no API key is required.
 */

function plannerInput(overrides: Partial<ProcessedQuote> = {}): BuildQuotePlanInput {
  return {
    extraction: {
      ...EMPTY_PROCESSED_QUOTE,
      job_type: "landscaping",
      primary_quote: {
        ...EMPTY_PROCESSED_QUOTE.primary_quote,
        quote_title: "Landscaping",
        job_type: "landscaping",
        scope: ["Lay a new lawn"],
      },
      ...overrides,
    },
    transcript: "Lay a new lawn, and optionally plant a hedge with two people for one day.",
    classification: { specialist: "landscaping", reason: "earthworks + lawn" },
  }
}

const VALID_DRAFT_JSON = JSON.stringify({
  quoteType: "landscaping",
  quoteTypeConfidence: "high",
  main: {
    id: "main",
    title: "New lawn",
    kind: "main",
    scope: ["Lay a new lawn"],
    labour: [{ raw: "one person one day", people: 1, days: 1, hours: 8, determinacy: "explicit" }],
    materials: [{ name: "Topsoil", optional: false }],
    sourceText: "Lay a new lawn.",
  },
  optional: [],
  exclusions: [],
  uncertainties: [],
})

// ── isShadowPlannerEnabled ────────────────────────────────────────────────────

test("isShadowPlannerEnabled: off by default", () => {
  assert.equal(isShadowPlannerEnabled({} as NodeJS.ProcessEnv), false)
})

test("isShadowPlannerEnabled: on only when the flag AND an API key are present", () => {
  assert.equal(isShadowPlannerEnabled({ ENABLE_QUOTE_PLAN_SHADOW: "1", OPENAI_API_KEY: "sk-x" } as NodeJS.ProcessEnv), true)
  assert.equal(isShadowPlannerEnabled({ ENABLE_QUOTE_PLAN_SHADOW: "true", OPENAI_API_KEY: "sk-x" } as NodeJS.ProcessEnv), true)
  // Flag set but no key → still off (never attempts a live call).
  assert.equal(isShadowPlannerEnabled({ ENABLE_QUOTE_PLAN_SHADOW: "1" } as NodeJS.ProcessEnv), false)
  // Key but no flag → off.
  assert.equal(isShadowPlannerEnabled({ OPENAI_API_KEY: "sk-x" } as NodeJS.ProcessEnv), false)
  // Falsey flag values → off.
  assert.equal(isShadowPlannerEnabled({ ENABLE_QUOTE_PLAN_SHADOW: "0", OPENAI_API_KEY: "sk-x" } as NodeJS.ProcessEnv), false)
})

// ── parsePlannerOutput ────────────────────────────────────────────────────────

test("parsePlannerOutput: parses clean JSON", () => {
  assert.deepEqual(parsePlannerOutput('{"a":1}'), { a: 1 })
})

test("parsePlannerOutput: recovers an object from chatty text", () => {
  assert.deepEqual(parsePlannerOutput('Sure! Here you go:\n{"a":1}\nHope that helps.'), { a: 1 })
})

test("parsePlannerOutput: returns null for unusable output", () => {
  assert.equal(parsePlannerOutput("not json at all"), null)
  assert.equal(parsePlannerOutput(""), null)
})

// ── buildAiQuotePlanDraft (injected model) ────────────────────────────────────

test("buildAiQuotePlanDraft: returns a draft the deterministic gate accepts (no live OpenAI)", async () => {
  let sawSystem = ""
  let sawUser = ""
  const input = plannerInput()
  const draft = await buildAiQuotePlanDraft(input, {
    callModel: async ({ systemPrompt, userPrompt }) => {
      sawSystem = systemPrompt
      sawUser = userPrompt
      return VALID_DRAFT_JSON
    },
  })

  assert.match(sawSystem, /QuotePlan/)
  assert.match(sawUser, /Transcript:/)
  const resolution = resolveQuotePlan({ draft, fallbackInput: input })
  assert.ok(resolution.status === "accepted" || resolution.status === "normalised")
  assert.ok(!resolution.findings.some((f) => f.severity === "error"))
})

test("buildAiQuotePlanDraft: invalid model JSON yields a null draft that safely falls back", async () => {
  const input = plannerInput()
  const draft = await buildAiQuotePlanDraft(input, {
    callModel: async () => "the model was chatty and returned no JSON",
  })
  assert.equal(draft, null)
  const resolution = resolveQuotePlan({ draft, fallbackInput: input })
  assert.equal(resolution.status, "fallback")
})

// ── prompt builders ───────────────────────────────────────────────────────────

test("buildPlannerUserPrompt: includes transcript, classification and extraction reference", () => {
  const prompt = buildPlannerUserPrompt(plannerInput())
  assert.match(prompt, /Classification: landscaping/)
  assert.match(prompt, /Lay a new lawn/)
})

test("buildPlannerSystemPrompt: states the core main-vs-optional labour rule", () => {
  const prompt = buildPlannerSystemPrompt()
  assert.match(prompt, /Labour is OWNED by its bucket/)
})
