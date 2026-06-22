"use client"

import { buildQuoteDraftPersistedFields, type EditableQuoteSection, type ProcessedQuote } from "@/lib/processed-quote"
import { supabase } from "@/lib/supabase"

export type SaveDraftResult = { ok: boolean; message: string; draftId?: string | null }

export { buildQuoteDraftPersistedFields as buildQuoteDraftPayload }

export async function saveGeneratedQuoteDraft(
  rawTranscript: string,
  processedQuote: ProcessedQuote,
  quoteSections: EditableQuoteSection[],
  draftId?: string | null,
): Promise<SaveDraftResult> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      message: userError?.message ?? "You must be signed in to save a draft.",
    }
  }

  const payload = buildQuoteDraftPersistedFields(rawTranscript, processedQuote, quoteSections, user.id)

  if (draftId) {
    const { error } = await supabase
      .from("quote_drafts")
      .update(payload)
      .eq("id", draftId)
      .eq("user_id", user.id)

    if (error) {
      return { ok: false, message: error.message }
    }

    return { ok: true, message: "Draft updated in Supabase.", draftId }
  }

  const { data, error } = await supabase
    .from("quote_drafts")
    .insert(payload)
    .select("id")
    .single()

  if (error) {
    return { ok: false, message: error.message }
  }

  return {
    ok: true,
    message: "Draft saved to Supabase.",
    draftId: data?.id ?? null,
  }
}
