import { NextResponse } from "next/server"
import { processTranscriptToQuote } from "@/lib/pipeline/process-transcript"
import { authenticateRequest } from "@/lib/api-auth"

// Thin HTTP wrapper over the shared, headless-callable pipeline in
// lib/pipeline/process-transcript.ts. All quote-processing logic lives there so
// tests can exercise it without a NextRequest, browser, or live OpenAI call.
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth.ok) return auth.response

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : ""

    if (!transcript) {
      return NextResponse.json({ error: "Transcript text is required." }, { status: 400 })
    }

    const result = await processTranscriptToQuote({
      transcript,
      templateContext: body?.template_context,
      knowledgeItemContext: body?.knowledge_item_context,
      primaryTrade: body?.primary_trade,
    })

    return NextResponse.json(result.quote)
  } catch {
    return NextResponse.json({ error: "Unexpected quote processing error." }, { status: 500 })
  }
}
