import { NextResponse } from "next/server"
import { defaultTradeVocabulary } from "@/lib/trade-vocabulary"
import { authenticateRequest } from "@/lib/api-auth"

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

function correctionFallback(transcript: string, warning: string, details: Record<string, unknown> = {}) {
  return NextResponse.json({
    corrected_transcript: transcript,
    corrections_applied: [],
    uncertain_terms: [],
    correction_failed: true,
    warning,
    details,
  })
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return auth.response

  const startedAt = Date.now()
  let transcript = ""

  try {
    console.log("correct-transcript request started", {
      has_openai_api_key: Boolean(process.env.OPENAI_API_KEY),
      model: CORRECTION_MODEL,
    })

    const body = await request.json().catch(() => null)
    transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""

    if (!transcript) {
      return NextResponse.json({ error: "Transcript text is required." }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("correct-transcript missing OpenAI API key", {
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        duration_ms: Date.now() - startedAt,
      })

      return correctionFallback(transcript, "Transcript correction skipped because OpenAI API key is not configured.", {
        failed_stage: "configuration",
        model: CORRECTION_MODEL,
      })
    }

    console.log("correct-transcript calling OpenAI", {
      has_openai_api_key: true,
      model: CORRECTION_MODEL,
      transcript_length: transcript.length,
    })

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

    const durationMs = Date.now() - startedAt
    const responseBody = await response.text().catch((error) => {
      console.error("correct-transcript failed reading OpenAI response body", {
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        request_duration_ms: durationMs,
        error: errorDetails(error),
      })
      return ""
    })
    let result: any = null
    try {
      result = responseBody ? JSON.parse(responseBody) : null
    } catch (error) {
      console.error("correct-transcript OpenAI response body was not JSON", {
        has_openai_api_key: true,
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        request_duration_ms: durationMs,
        openai_status: response.status,
        parser_error: errorDetails(error),
        openai_response_body: responseBody,
      })

      return correctionFallback(transcript, "Transcript correction failed: OpenAI returned a non-JSON response.", {
        failed_stage: "openai_response_parse",
        model: CORRECTION_MODEL,
        openai_status: response.status,
      })
    }

    if (!response.ok) {
      const message =
        typeof result?.error?.message === "string" ? result.error.message : "OpenAI correction request failed."

      console.error("correct-transcript OpenAI error", {
        has_openai_api_key: true,
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        request_duration_ms: durationMs,
        openai_status: response.status,
        openai_error_body: responseBody,
      })

      return correctionFallback(transcript, `Transcript correction failed: ${message}`, {
        failed_stage: "openai_response",
        model: CORRECTION_MODEL,
        openai_status: response.status,
      })
    }

    const outputText = getOutputText(result)
    if (!outputText) {
      console.error("correct-transcript missing output text", {
        has_openai_api_key: true,
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        request_duration_ms: durationMs,
        openai_status: response.status,
        openai_response_body: responseBody,
      })

      return correctionFallback(transcript, "Transcript correction failed: OpenAI did not return corrected transcript JSON.", {
        failed_stage: "missing_output_text",
        model: CORRECTION_MODEL,
        openai_status: response.status,
      })
    }

    try {
      const parsed = JSON.parse(outputText)
      console.log("correct-transcript completed", {
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        request_duration_ms: Date.now() - startedAt,
      })
      return NextResponse.json(parsed)
    } catch (error) {
      console.error("correct-transcript output JSON parse error", {
        has_openai_api_key: true,
        model: CORRECTION_MODEL,
        transcript_length: transcript.length,
        request_duration_ms: Date.now() - startedAt,
        parser_error: errorDetails(error),
        openai_output_text: outputText,
      })

      return correctionFallback(transcript, "Transcript correction failed: OpenAI returned invalid correction JSON.", {
        failed_stage: "json_parse",
        model: CORRECTION_MODEL,
      })
    }
  } catch (error) {
    console.error("correct-transcript unexpected error", {
      has_openai_api_key: Boolean(process.env.OPENAI_API_KEY),
      model: CORRECTION_MODEL,
      transcript_length: transcript.length,
      request_duration_ms: Date.now() - startedAt,
      error: errorDetails(error),
    })

    return correctionFallback(transcript, "Transcript correction failed unexpectedly. Continuing with the original transcript.", {
      failed_stage: "unexpected_exception",
      model: CORRECTION_MODEL,
    })
  }
}
