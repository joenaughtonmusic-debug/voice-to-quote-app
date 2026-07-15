import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/api-auth"
import {
  PROJECT_EXTRACTION_SCHEMA,
  SIMPLE_EXTRACTION_SCHEMA,
  buildProjectExtractionPrompt,
  buildSimpleExtractionPrompt,
  normalizeProjectExtraction,
  normalizeSimpleExtraction,
} from "@/lib/simple/extraction"
import { extractClientNameFromTranscript } from "@/lib/client-name-extraction"
import { extractAddressDetails, formatAddressForQuote } from "@/lib/address-extraction"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
// One structured call per quote — worth a stronger model than the old pipeline's gpt-4o-mini.
const SIMPLE_MODEL = process.env.OPENAI_SIMPLE_MODEL ?? "gpt-4o"
const EXTRACTION_TIMEOUT_MS = 45000

function getOutputText(result: unknown): string | null {
  const body = result as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> }
  if (typeof body?.output_text === "string") return body.output_text
  for (const item of body?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text
    }
  }
  return null
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth.ok) return auth.response

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""
    const jobType =
      body?.job_type === "maintenance" || body?.job_type === "tidy" || body?.job_type === "project"
        ? body.job_type
        : null

    if (!transcript) return NextResponse.json({ error: "A transcript is required." }, { status: 400 })
    if (!jobType) {
      return NextResponse.json({ error: "job_type must be 'maintenance', 'tidy' or 'project'." }, { status: 400 })
    }

    const isProject = jobType === "project"

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SIMPLE_MODEL,
          input: [
            {
              role: "system",
              content: isProject ? buildProjectExtractionPrompt() : buildSimpleExtractionPrompt(jobType),
            },
            { role: "user", content: transcript },
          ],
          text: {
            format: {
              type: "json_schema",
              name: isProject ? "project_extraction" : "simple_extraction",
              schema: isProject ? PROJECT_EXTRACTION_SCHEMA : SIMPLE_EXTRACTION_SCHEMA,
              strict: true,
            },
          },
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      return NextResponse.json(
        { error: `Extraction failed (${response.status}).`, detail: detail.slice(0, 500) },
        { status: 502 },
      )
    }

    const result = await response.json().catch(() => null)
    const outputText = getOutputText(result)
    if (!outputText) {
      return NextResponse.json({ error: "The model returned no extraction JSON." }, { status: 502 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(outputText)
    } catch {
      return NextResponse.json({ error: "The model returned invalid JSON." }, { status: 502 })
    }

    const extraction = isProject ? normalizeProjectExtraction(parsed) : normalizeSimpleExtraction(parsed)

    // Deterministic fallback: never lose a name/address the regex extractors can see.
    if (!extraction.client_name) {
      extraction.client_name = extractClientNameFromTranscript(transcript) || null
    }
    if (!extraction.site_address) {
      const address = formatAddressForQuote(extractAddressDetails(transcript))
      extraction.site_address = address || null
    }

    return NextResponse.json({ extraction, model: SIMPLE_MODEL })
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Extraction timed out. Please try again."
        : error instanceof Error
          ? error.message
          : "Unexpected extraction error."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
