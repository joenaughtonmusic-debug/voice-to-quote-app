import assert from "node:assert/strict"
import test from "node:test"

import {
  dispatchXeroExport,
  extractXeroQuoteId,
  hashXeroPayload,
  stableStringify,
  xeroExportIdempotencyKey,
  type StoredXeroExport,
  type XeroExportStore,
} from "./xero-export"

function inMemoryStore() {
  const rows = new Map<string, StoredXeroExport>()
  const store: XeroExportStore = {
    async get(key) {
      return rows.get(key) ?? null
    },
    async put(record) {
      rows.set(record.idempotencyKey, record)
    },
  }
  return { store, rows }
}

function countingWebhook(response: { ok: boolean; status: number; text: string }) {
  let calls = 0
  const postWebhook = async () => {
    calls += 1
    return response
  }
  return { postWebhook, calls: () => calls }
}

test("stableStringify is key-order independent; hash is stable", () => {
  const a = { a: 1, b: { c: 2, d: [3, 4] } }
  const b = { b: { d: [3, 4], c: 2 }, a: 1 }
  assert.equal(stableStringify(a), stableStringify(b))
  assert.equal(hashXeroPayload(a), hashXeroPayload(b))
  assert.notEqual(hashXeroPayload(a), hashXeroPayload({ a: 1, b: { c: 2, d: [4, 3] } }))
})

test("idempotency key combines draft id + payload hash", () => {
  const payload = { total: 100 }
  assert.equal(xeroExportIdempotencyKey("draft-1", payload), `draft-1:${hashXeroPayload(payload)}`)
  assert.equal(xeroExportIdempotencyKey(null, payload), hashXeroPayload(payload))
})

test("extractXeroQuoteId reads common id fields, else null", () => {
  assert.equal(extractXeroQuoteId(JSON.stringify({ QuoteID: "Q-123" })), "Q-123")
  assert.equal(extractXeroQuoteId(JSON.stringify({ xero_quote_id: "abc" })), "abc")
  assert.equal(extractXeroQuoteId("not json"), null)
})

test("a repeat export with the same key does NOT re-fire the webhook", async () => {
  const { store } = inMemoryStore()
  const webhook = countingWebhook({ ok: true, status: 200, text: JSON.stringify({ QuoteID: "Q-1" }) })
  const payload = { customer: "ClientB", total: 1760 }

  const first = await dispatchXeroExport({ payload, draftId: "draft-1", webhookUrl: "https://hook", store, postWebhook: webhook.postWebhook })
  assert.equal(first.status, "sent")
  assert.equal(first.reused, false)
  assert.equal(first.xeroQuoteId, "Q-1")
  assert.equal(webhook.calls(), 1)

  const second = await dispatchXeroExport({ payload, draftId: "draft-1", webhookUrl: "https://hook", store, postWebhook: webhook.postWebhook })
  assert.equal(second.status, "already_sent")
  assert.equal(second.reused, true)
  assert.equal(second.xeroQuoteId, "Q-1")
  assert.equal(webhook.calls(), 1, "webhook must not be re-fired on a repeat")
})

test("a DIFFERENT payload produces a new key and DOES fire the webhook", async () => {
  const { store } = inMemoryStore()
  const webhook = countingWebhook({ ok: true, status: 200, text: "{}" })

  await dispatchXeroExport({ payload: { total: 1 }, draftId: "d", webhookUrl: "h", store, postWebhook: webhook.postWebhook })
  await dispatchXeroExport({ payload: { total: 2 }, draftId: "d", webhookUrl: "h", store, postWebhook: webhook.postWebhook })
  assert.equal(webhook.calls(), 2)
})

test("a failed webhook is not persisted, so a retry re-fires", async () => {
  const { store, rows } = inMemoryStore()
  const failing = countingWebhook({ ok: false, status: 500, text: "boom" })
  const payload = { total: 5 }

  const failed = await dispatchXeroExport({ payload, draftId: "d", webhookUrl: "h", store, postWebhook: failing.postWebhook })
  assert.equal(failed.ok, false)
  assert.equal(failed.status, "webhook_failed")
  assert.equal(rows.size, 0, "a failed export must not be recorded as sent")

  const succeeding = countingWebhook({ ok: true, status: 200, text: "{}" })
  const retry = await dispatchXeroExport({ payload, draftId: "d", webhookUrl: "h", store, postWebhook: succeeding.postWebhook })
  assert.equal(retry.status, "sent")
  assert.equal(succeeding.calls(), 1, "retry after a failure must re-fire")
})
