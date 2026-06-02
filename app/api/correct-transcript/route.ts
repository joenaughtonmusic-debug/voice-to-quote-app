import { NextResponse } from "next/server"
import { defaultTradeVocabulary } from "@/lib/trade-vocabulary"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const CORRECTION_MODEL = process.env.OPENAI_CORRECTION_MODEL ?? "gpt-4o-mini"

const correctionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    corrected_transcript: { type: "string" },
    corrections_applied: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          original: { type: "string" },
          corrected: { type: "string" },
          reason: { type: "string" },
        },
        required: ["original", "corrected", "reason"],
      },
    },
    uncertain_terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          term: { type: "string" },
          note: { type: "string" },
        },
        required: ["term", "note"],
      },
    },
  },
  required: ["corrected_transcript", "corrections_applied", "uncertain_terms"],
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
        model: CORRECTION_MODEL,
        input: [
          {
            role: "system",
            content:
              "Lightly correct likely speech-to-text errors in NZ gardening/property maintenance notes using the provided vocabulary. Preserve original meaning and wording as much as possible. Do not rewrite the quote, add scope, add pricing, or invent details. Only correct terms that are strongly likely in context. If uncertain, leave wording intact and list the term in uncertain_terms.",
          },
          {
            role: "user",
            content: JSON.stringify({
              transcript,
              vocabulary: defaultTradeVocabulary,
              example: '"flecks" in a gardening context likely means "flax".',
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "trade_vocabulary_transcript_correction",
            strict: true,
            schema: correctionSchema,
          },
        },
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        typeof result?.error?.message === "string" ? result.error.message : "OpenAI correction request failed."

      return NextResponse.json({ error: message }, { status: response.status })
    }

    const outputText = getOutputText(result)
    if (!outputText) {
      return NextResponse.json({ error: "OpenAI did not return corrected transcript JSON." }, { status: 502 })
    }

    return NextResponse.json(JSON.parse(outputText))
  } catch {
    return NextResponse.json({ error: "Unexpected transcript correction error." }, { status: 500 })
  }
}
