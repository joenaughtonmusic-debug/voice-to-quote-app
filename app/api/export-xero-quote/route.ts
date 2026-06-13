import { NextResponse } from "next/server"
import { buildXeroQuotePayload, xeroContactName } from "@/lib/xero-quote-payload"

function exportWebhookUrl() {
  return process.env.XERO_EXPORT_WEBHOOK_URL || process.env.MAKE_XERO_EXPORT_WEBHOOK_URL || ""
}

export async function POST(request: Request) {
  try {
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

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text().catch(() => "")

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "webhook_failed",
          message: "Xero export webhook failed.",
          webhook_status: response.status,
          webhook_response: responseText.slice(0, 1000),
          payload,
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      status: "sent",
      message: "Xero draft quote payload sent to export webhook.",
      webhook_status: response.status,
      webhook_response: responseText.slice(0, 1000),
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
