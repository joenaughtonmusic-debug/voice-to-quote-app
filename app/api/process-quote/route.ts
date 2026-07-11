import { NextResponse } from "next/server"
import { processTranscriptToQuote } from "@/lib/pipeline/process-transcript"
import { authenticateRequest } from "@/lib/api-auth"
import type { ShadowReportStore } from "@/lib/quote-plan/shadow-report-store"

const SHADOW_REPORTS_TABLE = "quote_plan_shadow_reports"

/**
 * Supabase-backed persistence for AI QuotePlan shadow reports (telemetry only). Best-effort:
 * if the table has not been created yet (docs/sql/quote_plan_shadow_reports.sql) or RLS blocks
 * the write, it silently no-ops so quote generation is never affected. RLS on the table scopes
 * rows to the authenticated user.
 */
function createShadowReportStore(supabase: { from: (table: string) => { insert: (row: unknown) => Promise<unknown> } }): ShadowReportStore {
  return {
    async save(record) {
      try {
        await supabase.from(SHADOW_REPORTS_TABLE).insert(record)
      } catch {
        // Persistence is best-effort; never fail the quote because telemetry failed.
      }
    },
  }
}

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

    const result = await processTranscriptToQuote(
      {
        transcript,
        templateContext: body?.template_context,
        knowledgeItemContext: body?.knowledge_item_context,
        primaryTrade: body?.primary_trade,
        userId: auth.context.user.id,
      },
      {
        // Only used when shadow mode is enabled (flag-gated); harmless otherwise.
        shadowReportStore: createShadowReportStore(auth.context.supabase),
      },
    )

    return NextResponse.json(result.quote)
  } catch {
    return NextResponse.json({ error: "Unexpected quote processing error." }, { status: 500 })
  }
}
