import { NextResponse } from "next/server"
import { buildXeroQuotePayload, xeroContactName } from "@/lib/xero-quote-payload"
import { authenticateRequest } from "@/lib/api-auth"
import { dispatchXeroExport, type StoredXeroExport, type XeroExportStore } from "@/lib/xero-export"

const XERO_EXPORTS_TABLE = "xero_quote_exports"

function exportWebhookUrl() {
  return process.env.XERO_EXPORT_WEBHOOK_URL || process.env.MAKE_XERO_EXPORT_WEBHOOK_URL || ""
}

/**
 * Supabase-backed idempotency store. Degrades gracefully: if the table has not been
 * created yet (migration under docs/sql/xero_quote_exports.sql), reads/writes are
 * treated as a no-op so the export still works exactly as before — it just isn't
 * idempotent until the migration is applied.
 */
function createXeroExportStore(
  supabase: { from: (table: string) => any },
  userId: string,
): XeroExportStore {
  return {
    async get(idempotencyKey) {
      try {
        const { data, error } = await supabase
          .from(XERO_EXPORTS_TABLE)
          .select("idempotency_key, draft_id, payload_hash, status, xero_quote_id, webhook_status, webhook_response")
          .eq("idempotency_key", idempotencyKey)
          .eq("user_id", userId)
          .maybeSingle()
        if (error || !data) return null
        return {
          idempotencyKey: data.idempotency_key,
          draftId: data.draft_id ?? null,
          payloadHash: data.payload_hash ?? "",
          status: data.status ?? "",
          xeroQuoteId: data.xero_quote_id ?? null,
          webhookStatus: data.webhook_status ?? null,
          webhookResponse: data.webhook_response ?? null,
        }
      } catch {
        return null
      }
    },
    async put(record: StoredXeroExport) {
      try {
        await supabase.from(XERO_EXPORTS_TABLE).upsert(
          {
            idempotency_key: record.idempotencyKey,
            draft_id: record.draftId,
            user_id: userId,
            payload_hash: record.payloadHash,
            status: record.status,
            xero_quote_id: record.xeroQuoteId,
            webhook_status: record.webhookStatus,
            webhook_response: record.webhookResponse,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "idempotency_key" },
        )
      } catch {
        // Persistence is best-effort; never fail the export because logging failed.
      }
    },
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => null)
    const processedQuote = body?.processed_quote
    const draftId = typeof body?.draft_id === "string" ? body.draft_id : null
    const exportMappings = Array.isArray(body?.export_mappings) ? body.export_mappings : []

    if (!processedQuote || typeof processedQuote !== "object") {
      return NextResponse.json({ ok: false, error: "Processed quote is required." }, { status: 400 })
    }

    const payload = buildXeroQuotePayload(processedQuote, { draftId, exportMappings })

    if (!xeroContactName(processedQuote)) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_contact",
          message: "Add a customer name before exporting to Xero.",
          payload,
        },
        { status: 400 },
      )
    }

    const webhookUrl = exportWebhookUrl()

    if (!webhookUrl) {
      return NextResponse.json({
        ok: false,
        status: "missing_webhook",
        message: "Xero export payload generated, but no export webhook is configured.",
        payload,
      })
    }

    const store = createXeroExportStore(auth.context.supabase, auth.context.user.id)
    const result = await dispatchXeroExport({
      payload,
      draftId,
      webhookUrl,
      store,
      postWebhook: async (url, webhookPayload) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        })
        const text = await response.text().catch(() => "")
        return { ok: response.ok, status: response.status, text }
      },
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "webhook_failed",
          message: result.message,
          webhook_status: result.webhookStatus,
          webhook_response: result.webhookResponse,
          idempotency_key: result.idempotencyKey,
          payload,
        },
        { status: 502 },
      )
    }

    // On both a fresh send and an idempotent repeat we return the same client-facing
    // "sent" shape (plus idempotency metadata), so existing clients are unaffected.
    return NextResponse.json({
      ok: true,
      status: "sent",
      idempotent_replay: result.reused,
      message: result.message,
      webhook_status: result.webhookStatus,
      webhook_response: result.webhookResponse,
      xero_quote_id: result.xeroQuoteId,
      idempotency_key: result.idempotencyKey,
      payload,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "unexpected_error",
        message: error instanceof Error ? error.message : "Unexpected Xero export error.",
      },
      { status: 500 },
    )
  }
}
