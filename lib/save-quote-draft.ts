"use client"

import type { EditableQuoteSection, ProcessedQuote } from "@/lib/processed-quote"
import { supabase } from "@/lib/supabase"

export async function saveGeneratedQuoteDraft(
  rawTranscript: string,
  processedQuote: ProcessedQuote,
  quoteSections: EditableQuoteSection[],
) {
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

  const { error } = await supabase.from("quote_drafts").insert({
    user_id: user.id,
    client_name: processedQuote.client_name || null,
    site_address: processedQuote.site_address || null,
    quote_title: processedQuote.quote_title || processedQuote.job_type || "Generated Quote",
    job_type: processedQuote.job_type || null,
    raw_transcript: rawTranscript,
    quote_sections: quoteSections,
    line_items: processedQuote.line_items,
    status: "Needs Review",
  })

  if (error) {
    return {
      ok: false,
      message: error.message,
    }
  }

  return {
    ok: true,
    message: "Draft saved to Supabase.",
  }
}
