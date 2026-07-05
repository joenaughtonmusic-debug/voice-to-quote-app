import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Lazily initialised so Next.js static prerender does not throw when
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are absent
// at build time (e.g. Vercel preview builds before env vars are set).
// The client is only created on first access, which only happens at
// runtime inside browser / server-side event handlers.
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error(
        "Missing Supabase environment variables. " +
          "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
          "in your Vercel project settings (or .env.local for local dev).",
      )
    }
    _client = createClient(url, key)
  }
  return _client
}

// Drop-in replacement for the previously module-level `supabase` export.
// All existing call-sites (supabase.auth.*, supabase.from(), etc.) continue
// to work unchanged because property access is forwarded to the real client.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop, getClient())
  },
})