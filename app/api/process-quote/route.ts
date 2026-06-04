import { NextResponse } from "next/server"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const QUOTE_MODEL = process.env.OPENAI_QUOTE_MODEL ?? "gpt-4o-mini"

type QuoteSpecialist =
  | "maintenance"
  | "one_off_tidy"
  | "landscaping"
  | "decking"
  | "planting"
  | "hedge_trimming"
  | "general"

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    specialist: {
      type: "string",
      enum: ["maintenance", "one_off_tidy", "landscaping", "decking", "planting", "hedge_trimming", "general"],
    },
    reason: { type: "string" },
  },
  required: ["specialist", "reason"],
}

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    client_name: { type: "string" },
    site_address: { type: "string" },
    quote_title: { type: "string" },
    job_type: { type: "string" },
    selected_template_id: { type: "string" },
    selected_template_name: { type: "string" },
    template_match_confidence: { type: "string" },
    learned_rules_applied: { type: "array", items: { type: "string" } },
    primary_quote: {
      type: "object",
      additionalProperties: false,
      properties: {
        quote_title: { type: "string" },
        job_type: { type: "string" },
        scope: { type: "array", items: { type: "string" } },
        cadence: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["quote_title", "job_type", "scope", "cadence", "notes"],
    },
    optional_quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote_title: { type: "string" },
          job_type: { type: "string" },
          scope: { type: "array", items: { type: "string" } },
          cadence: { type: "string" },
          notes: { type: "array", items: { type: "string" } },
        },
        required: ["quote_title", "job_type", "scope", "cadence", "notes"],
      },
    },
    customer_scope: { type: "array", items: { type: "string" } },
    internal_notes: { type: "array", items: { type: "string" } },
    labour_allowance: { type: "string" },
    materials: { type: "array", items: { type: "string" } },
    greenwaste: { type: "string" },
    exclusions: { type: "array", items: { type: "string" } },
    follow_up_tasks: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    confidence_warnings: { type: "array", items: { type: "string" } },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
          quantity: { type: "string" },
          unit_rate: { type: "string" },
          amount: { type: "string" },
          confidence_note: { type: "string" },
        },
        required: ["label", "detail", "quantity", "unit_rate", "amount", "confidence_note"],
      },
    },
  },
  required: [
    "client_name",
    "site_address",
    "quote_title",
    "job_type",
    "selected_template_id",
    "selected_template_name",
    "template_match_confidence",
    "learned_rules_applied",
    "primary_quote",
    "optional_quotes",
    "customer_scope",
    "internal_notes",
    "labour_allowance",
    "materials",
    "greenwaste",
    "exclusions",
    "follow_up_tasks",
    "missing_information",
    "confidence_warnings",
    "line_items",
  ],
}

function getOutputText(result: any) {
  if (typeof result?.output_text === "string") return result.output_text

  for (const item of result?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text
      }
    }
  }

  return null
}

function getStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit)
}

function getTemplateContext(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const template = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const id = typeof template.id === "string" ? template.id.trim() : ""
      const templateName = typeof template.template_name === "string" ? template.template_name.trim() : ""
      const category = typeof template.category === "string" ? template.category.trim() : "custom"

      if (!id || !templateName) return null

      return {
        id,
        template_name: templateName,
        category,
        default_scope: getStringArray(template.default_scope),
        default_exclusions: getStringArray(template.default_exclusions),
        default_pricing_structure: getStringArray(template.default_pricing_structure),
        reusable_wording: getStringArray(template.reusable_wording),
        ai_prompt_rules: getStringArray(template.ai_prompt_rules),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function isQuoteSpecialist(value: unknown): value is QuoteSpecialist {
  return (
    value === "maintenance" ||
    value === "one_off_tidy" ||
    value === "landscaping" ||
    value === "decking" ||
    value === "planting" ||
    value === "hedge_trimming" ||
    value === "general"
  )
}

function getSpecialistInstructions(specialist: QuoteSpecialist) {
  switch (specialist) {
    case "landscaping":
      return `Landscaping specialist extractor:
- Preserve every measurement and dimension exactly as spoken, including units.
- Preserve labour stages, stage durations, material lists, and construction sequence.
- Preserve timber sizes, concrete types, fasteners, aggregates, membranes, drainage products, and product names exactly as spoken.
- Do not summarise labour-heavy or material-heavy work. Create separate detailed scope entries and line_items for distinct stages/material groups.
- Keep sequence language such as excavate, prepare, compact, set out, install, concrete, fix, backfill, and finish in the spoken order.
- Put missing quantities, dimensions, specifications, and pricing into missing_information rather than inventing them.`
    case "decking":
      return `Decking specialist extractor:
- Preserve every deck measurement, dimension, level, span, timber size, board type, framing member, pile/post detail, concrete type, fastener, fixing, and finish exactly as spoken.
- Preserve demolition, excavation, foundations, framing, decking, stairs, balustrade, finishing, and cleanup as separate stages in construction order.
- Preserve labour stages and stage durations. Do not compress material-heavy or labour-heavy details.
- Put unclear structural details, quantities, consent requirements, and pricing into missing_information or confidence_warnings.`
    case "planting":
      return `Planting specialist extractor:
- Preserve plant names, cultivars, quantities, pot sizes, grades, spacing, locations, soil preparation, compost, fertiliser, mulch, staking, irrigation, and aftercare exactly as spoken.
- Separate plants, soil products, amendments, mulch, labour, delivery, and greenwaste into useful materials/line items.
- Preserve planting sequence and site-specific plant cautions. Do not invent quantities, spacing, or plant substitutions.`
    case "hedge_trimming":
      return `Hedge trimming specialist extractor:
- Preserve hedge species, locations, lengths, heights, target heights, widths, access constraints, trimming sides/tops, reduction instructions, and greenwaste details exactly as spoken.
- Distinguish routine trimming from major reduction or restoration work.
- Preserve frequency, visit duration, equipment/access needs, and disposal allowances.
- Keep plant-name uncertainty in confidence_warnings rather than silently changing it.`
    case "maintenance":
      return `Maintenance specialist extractor:
- Focus on service frequency/cadence, visit duration, crew size, recurring pricing, greenwaste allowance, sprays, fertiliser, and seasonal tasks.
- Preserve what happens every visit versus periodically or only when required.
- Keep recurring work in primary_quote and separate one-off setup/tidy work as an optional quote when appropriate.
- Do not invent frequency, visit duration, chemical/product names, or recurring prices.`
    case "one_off_tidy":
      return `One-off tidy specialist extractor:
- Focus on overgrowth, tidy/clearance scope, estimate wording, greenwaste allowance, access constraints, site conditions, uncertainty, and risk factors.
- Preserve cautions about plants or areas that must not be removed or disturbed.
- Use estimate/range wording when the transcript describes variable or uncertain effort.
- Keep optional extras and ongoing maintenance separate from the immediate one-off tidy.
- Do not turn uncertain site conditions into fixed quantities or fixed-price claims.`
    case "general":
      return `General specialist extractor:
- Preserve all specific scope, materials, labour, durations, measurements, cautions, pricing, and sequence stated in the transcript.
- Do not invent or over-summarise details.`
  }
}

async function classifyTranscript(transcript: string) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: QUOTE_MODEL,
      input: [
        {
          role: "system",
          content: `Classify this NZ gardening/property maintenance quote transcript into exactly one specialist:
- maintenance: recurring garden/property maintenance, regular visits, recurring service.
- one_off_tidy: one-off tidy, overgrowth clearance, garden cleanup, variable tidy effort.
- landscaping: landscape construction, earthworks, paving, retaining, drainage, concrete, multi-stage outdoor construction.
- decking: decks, timber deck framing, piles, boards, stairs, balustrades.
- planting: planting plans/jobs focused on plants, pot sizes, spacing, soil preparation.
- hedge_trimming: hedge trimming/reduction/restoration-focused work.
- general: none of the above clearly dominates.

Choose the dominant primary quote intent. Return only the classification schema.`,
        },
        { role: "user", content: transcript },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_specialist_classification",
          strict: true,
          schema: classificationSchema,
        },
      },
    }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof result?.error?.message === "string" ? result.error.message : "Quote classification failed."
    throw new Error(message)
  }

  const outputText = getOutputText(result)
  if (!outputText) throw new Error("OpenAI did not return quote classification JSON.")

  const classification = JSON.parse(outputText)
  if (!isQuoteSpecialist(classification?.specialist)) {
    throw new Error("OpenAI returned an invalid quote specialist classification.")
  }

  return classification as { specialist: QuoteSpecialist; reason: string }
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""
    const templateContext = getTemplateContext(body?.template_context)

    if (!transcript) {
      return NextResponse.json({ error: "Transcript text is required." }, { status: 400 })
    }

    const classification = await classifyTranscript(transcript)
    const specialistInstructions = getSpecialistInstructions(classification.specialist)

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: QUOTE_MODEL,
        input: [
          {
            role: "system",
            content:
              `You extract quote drafts for NZ gardening and property maintenance businesses. Use plain NZ trade wording. Do not invent details. If information is missing, put it in missing_information. If a line item or value is uncertain, put the concern in confidence_warnings and confidence_note. Return only structured JSON matching the schema.

Specialist routing:
- This transcript was classified as "${classification.specialist}" because: ${classification.reason}
- Follow the selected specialist extractor instructions below while still returning the universal ProcessedQuote schema.
- The specialist classification affects extraction priorities only. Preserve other clearly stated quote opportunities in optional_quotes.

${specialistInstructions}

Template-driven quoting:
- You may receive quote_templates belonging to the authenticated user. Use them as reusable business knowledge, not as facts about the current customer/site.
- If the transcript explicitly mentions a template name, category, or phrase such as "use the three-monthly maintenance template", choose the best matching template as the base.
- If no template is clearly mentioned, suggest/use the closest relevant template only when it genuinely fits the transcript. Do not force a template.
- If no template fits, return empty selected_template_id, empty selected_template_name, template_match_confidence "none", and an empty learned_rules_applied array.
- When using a template, use relevant template wording, exclusions, pricing rules, line item structure, and future AI prompt rules.
- Preserve every site-specific note, caution, plant instruction, access issue, frequency, and customer request from the transcript.
- Never hardcode old client names, addresses, dates, quote references, or one-off prices from templates.
- Replace template variables like {client_name}, {site_address}, {quote_date}, {expiry_date}, {frequency}, and {price_or_estimate_range} with transcript details where available.
- If a template variable is needed but missing from the transcript, add the variable/detail to missing_information.
- Return selected_template_id, selected_template_name, template_match_confidence ("high", "medium", "low", or "none"), and learned_rules_applied as practical bullet points explaining exactly which template rules/wording were used.

Gardening transcription corrections and cautions:
- Speech-to-text often mishears plant names. Treat "flecks" as likely "flax" when the context is garden plants. Preserve the plant caution in the quote text, and add a confidence warning noting the transcript said "flecks" but likely means flax.
- Treat grislynia / griselinia / grisalinea variants as likely Griselinia.
- Treat ficus tuffy / ficus tuffi / tuffy as likely Ficus Tuffi when the context is hedging.
- Treat buxus and box hedge as the same likely plant/hedge reference.
- Treat pittosporum variants as likely Pittosporum.
- If a phrase sounds like a plant name, preserve it in scope/notes and add a confidence warning instead of silently changing it.
- If the transcript says not to remove a plant, keep it as an internal/site caution and include it customer-facing when appropriate. Example: "do not remove any flecks" should become "Do not remove any flax" with a confidence warning.

Multiple quote intent handling:
- Detect when one transcript contains more than one quote opportunity.
- Put the main immediate job in primary_quote.
- Put secondary or recurring options in optional_quotes.
- If there is more than one quote option, include "Multiple quote options detected" in confidence_warnings.
- For a transcript with an initial garden tidy and ongoing two-monthly maintenance, make the initial tidy the primary_quote and the two-monthly maintenance an optional quote.

Keep customer_scope focused on the primary quote, but mention important site cautions like "Do not remove flax" when customer-visible.`,
          },
          {
            role: "user",
            content: `Extract a quote draft using the ${classification.specialist} specialist extractor.\n\nTranscript:\n${transcript}\n\nAuthenticated user's concise quote template context:\n${JSON.stringify(templateContext, null, 2)}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "quote_draft_extraction",
            strict: true,
            schema: quoteSchema,
          },
        },
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        typeof result?.error?.message === "string" ? result.error.message : "OpenAI quote extraction failed."

      return NextResponse.json({ error: message }, { status: response.status })
    }

    const outputText = getOutputText(result)
    if (!outputText) {
      return NextResponse.json({ error: "OpenAI did not return quote JSON." }, { status: 502 })
    }

    return NextResponse.json(JSON.parse(outputText))
  } catch {
    return NextResponse.json({ error: "Unexpected quote processing error." }, { status: 500 })
  }
}
