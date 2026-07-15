import { createHash } from "node:crypto"

/**
 * Idempotent Xero export dispatch (deterministic, injectable, unit-testable).
 *
 * The Xero export route fires a one-way webhook that creates a draft quote in Xero.
 * Without idempotency a double-click / retry creates duplicate Xero quotes. This module
 * derives a stable key from `draft_id` + a hash of the exact payload, persists the
 * webhook result, and returns the prior result on a repeat instead of re-firing.
 *
 * It does NOT change `buildXeroQuotePayload` output — it only hashes it.
 */

export type StoredXeroExport = {
  idempotencyKey: string
  draftId: string | null
  payloadHash: string
  status: string
  xeroQuoteId: string | null
  webhookStatus: number | null
  webhookResponse: string | null
}

/** Persistence for export results, keyed by idempotency key. Implemented over Supabase
 * in the route, and in-memory in tests. */
export type XeroExportStore = {
  get(idempotencyKey: string): Promise<StoredXeroExport | null>
  put(record: StoredXeroExport): Promise<void>
}

export type WebhookPoster = (
  url: string,
  payload: unknown,
) => Promise<{ ok: boolean; status: number; text: string }>

/** Deterministic JSON with recursively sorted object keys, so an unchanged payload
 * always hashes to the same value regardless of key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

export function hashXeroPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex")
}

/** Stable idempotency key from the draft id (when present) + the payload hash. */
export function xeroExportIdempotencyKey(draftId: string | null, payload: unknown): string {
  const hash = hashXeroPayload(payload)
  return draftId ? `${draftId}:${hash}` : hash
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

/** Best-effort extraction of a Xero quote id from a webhook response body. */
export function extractXeroQuoteId(responseText: string): string | null {
  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>
    return firstString(
      parsed.xero_quote_id,
      parsed.xeroQuoteId,
      parsed.QuoteID,
      parsed.quote_id,
      parsed.quoteId,
      parsed.id,
    )
  } catch {
    return null
  }
}

export type XeroExportDispatchResult = {
  ok: boolean
  /** "sent" | "already_sent" | "webhook_failed" */
  status: "sent" | "already_sent" | "webhook_failed"
  reused: boolean
  idempotencyKey: string
  xeroQuoteId: string | null
  webhookStatus: number | null
  webhookResponse: string | null
  message: string
}

/**
 * Fire the Xero export exactly once per (draftId + payload). On a repeat with a prior
 * successful result, returns that result WITHOUT calling the webhook again.
 */
export async function dispatchXeroExport(params: {
  payload: unknown
  draftId: string | null
  webhookUrl: string
  store: XeroExportStore
  postWebhook: WebhookPoster
}): Promise<XeroExportDispatchResult> {
  const idempotencyKey = xeroExportIdempotencyKey(params.draftId, params.payload)
  const payloadHash = hashXeroPayload(params.payload)

  const existing = await params.store.get(idempotencyKey)
  if (existing && existing.status === "sent") {
    return {
      ok: true,
      status: "already_sent",
      reused: true,
      idempotencyKey,
      xeroQuoteId: existing.xeroQuoteId,
      webhookStatus: existing.webhookStatus,
      webhookResponse: existing.webhookResponse,
      message: "This quote was already exported to Xero; returning the prior result (webhook not re-fired).",
    }
  }

  const response = await params.postWebhook(params.webhookUrl, params.payload)
  const webhookResponse = response.text.slice(0, 1000)

  if (!response.ok) {
    // Do NOT persist a failure as "sent" — a later retry must be allowed to re-fire.
    return {
      ok: false,
      status: "webhook_failed",
      reused: false,
      idempotencyKey,
      xeroQuoteId: null,
      webhookStatus: response.status,
      webhookResponse,
      message: "Xero export webhook failed.",
    }
  }

  const xeroQuoteId = extractXeroQuoteId(response.text)
  await params.store.put({
    idempotencyKey,
    draftId: params.draftId,
    payloadHash,
    status: "sent",
    xeroQuoteId,
    webhookStatus: response.status,
    webhookResponse,
  })

  return {
    ok: true,
    status: "sent",
    reused: false,
    idempotencyKey,
    xeroQuoteId,
    webhookStatus: response.status,
    webhookResponse,
    message: "Xero draft quote payload sent to export webhook.",
  }
}
