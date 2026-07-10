import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

/**
 * Shared API-route authentication (extracted verbatim from
 * app/api/analyse-uploaded-quote/route.ts — behaviour is unchanged).
 *
 * Every mutating API route must authenticate the caller: a Bearer access token in the
 * Authorization header is used to look up the Supabase user. Missing/invalid token →
 * 401. The same messages and status codes as the original inline implementation are
 * preserved so existing clients are unaffected.
 */

/** Extract the Bearer access token from the Authorization header, or null. */
export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null
  return authorization.slice("bearer ".length).trim()
}

/** A Supabase client scoped to the caller's access token (RLS applies as that user). */
export function createAuthedSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

export type AuthenticatedContext = {
  user: User
  supabase: SupabaseClient
  accessToken: string
}

export type AuthResult =
  | { ok: true; context: AuthenticatedContext }
  | { ok: false; response: NextResponse }

/** Injectable client factory so the gate can be unit-tested without Supabase/network. */
export type AuthenticateDeps = {
  createClient?: (accessToken: string) => SupabaseClient
}

/**
 * Authenticate an API request. Returns `{ ok: true, context }` with the resolved user
 * and a token-scoped Supabase client, or `{ ok: false, response }` carrying the 401 to
 * return. Mirrors the original analyse-uploaded-quote behaviour exactly.
 */
export async function authenticateRequest(request: Request, deps: AuthenticateDeps = {}): Promise<AuthResult> {
  const accessToken = getBearerToken(request)
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication token is required." }, { status: 401 }),
    }
  }

  const supabase = (deps.createClient ?? createAuthedSupabaseClient)(accessToken)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken)

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: userError?.message ?? "Authenticated user was not found." },
        { status: 401 },
      ),
    }
  }

  return { ok: true, context: { user, supabase, accessToken } }
}
