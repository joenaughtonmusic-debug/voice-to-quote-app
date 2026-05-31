import { NextResponse } from "next/server"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const QUOTE_MODEL = process.env.OPENAI_QUOTE_MODEL ?? "gpt-4o-mini"

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    client_name: { type: "string" },
    site_address: { type: "string" },
    quote_title: { type: "string" },
    job_type: { type: "string" },
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

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""

    if (!transcript) {
      return NextResponse.json({ error: "Transcript text is required." }, { status: 400 })
    }

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
              "You extract quote drafts for NZ gardening and property maintenance businesses. Use plain NZ trade wording. Do not invent details. If information is missing, put it in missing_information. If a line item or value is uncertain, put the concern in confidence_warnings and confidence_note. Return only structured JSON matching the schema.",
          },
          {
            role: "user",
            content: `Extract a quote draft from this transcript:\n\n${transcript}`,
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
