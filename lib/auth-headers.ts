import { supabase } from "@/lib/supabase"

/**
 * Authorization header for the current Supabase session.
 *
 * The app's mutating API routes (process-quote, transcribe, correct-transcript,
 * export-xero-quote, analyse-uploaded-quote) authenticate a Bearer access token via
 * lib/api-auth.ts. Browser callers must therefore attach the signed-in user's token; this
 * helper reads it from the Supabase session. It throws a clear, user-facing message when
 * there is no session so callers surface "sign in" rather than a raw 401.
 */
export async function bearerAuthHeader(): Promise<{ Authorization: string }> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error("Please sign in to continue.")
  }

  return { Authorization: `Bearer ${session.access_token}` }
}
