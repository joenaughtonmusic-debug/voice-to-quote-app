import assert from "node:assert/strict"
import test from "node:test"

import { authenticateRequest, getBearerToken } from "./api-auth"

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", { method: "POST", headers })
}

// Fake token-scoped Supabase client factory (no network, no env).
function fakeClient(result: { user?: { id: string } | null; errorMessage?: string }) {
  return () =>
    ({
      auth: {
        getUser: async () => ({
          data: { user: result.user ?? null },
          error: result.errorMessage ? { message: result.errorMessage } : null,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
}

test("getBearerToken parses a valid header and rejects others", () => {
  assert.equal(getBearerToken(requestWith({ authorization: "Bearer abc123" })), "abc123")
  assert.equal(getBearerToken(requestWith({ authorization: "bearer  spaced  " })), "spaced")
  assert.equal(getBearerToken(requestWith({})), null)
  assert.equal(getBearerToken(requestWith({ authorization: "Basic abc" })), null)
})

test("authenticateRequest returns 401 when no bearer token is present", async () => {
  const result = await authenticateRequest(requestWith({}))
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.response.status, 401)
  const body = await result.response.json()
  assert.equal(body.error, "Authentication token is required.")
})

test("authenticateRequest returns 401 when the token resolves to no user", async () => {
  const result = await authenticateRequest(requestWith({ authorization: "Bearer bad-token" }), {
    createClient: fakeClient({ user: null, errorMessage: "invalid token" }),
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.response.status, 401)
  const body = await result.response.json()
  assert.equal(body.error, "invalid token")
})

test("authenticateRequest returns the user + supabase client when the token is valid", async () => {
  const result = await authenticateRequest(requestWith({ authorization: "Bearer good-token" }), {
    createClient: fakeClient({ user: { id: "user-1" } }),
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.context.user.id, "user-1")
  assert.equal(result.context.accessToken, "good-token")
  assert.ok(result.context.supabase)
})
