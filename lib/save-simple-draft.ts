"use client"

import { supabase } from "@/lib/supabase"
import { toSimpleDraftFields } from "@/lib/simple/draft-row"
import type { SimpleQuote } from "@/lib/simple/types"
import type { SaveDraftResult } from "@/lib/save-quote-draft"

export async function saveSimpleQuoteDraft(quote: SimpleQuote, draftId?: string | null): Promise<SaveDraftResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, message: userError?.message ?? "You must be signed in to save a draft." }
  }

  const fields = toSimpleDraftFields(quote, user.id)

  if (draftId) {
    const { error } = await supabase.from("quote_drafts").update(fields).eq("id", draftId).eq("user_id", user.id)
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: "Draft updated.", draftId }
  }

  const { data, error } = await supabase.from("quote_drafts").insert(fields).select("id").single()
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: "Draft saved.", draftId: data?.id ?? null }
}
