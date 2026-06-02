"use client"

import { useEffect, useState } from "react"
import { BottomNav, type Tab } from "@/components/bottom-nav"
import { RecordScreen } from "@/components/record-screen"
import { DraftsScreen } from "@/components/drafts-screen"
import { KnowledgeBaseScreen } from "@/components/knowledge-base-screen"
import { SettingsScreen } from "@/components/settings-screen"
import { QuoteReview } from "@/components/quote-review"
import { QuoteDraft } from "@/components/quote-draft"
import { AuthStatus } from "@/components/auth-status"
import { useAuth } from "@/hooks/use-auth"
import { LockKeyhole } from "lucide-react"
import { EMPTY_TRANSCRIPT } from "@/components/record-screen"
import {
  EMPTY_PROCESSED_QUOTE,
  savedDraftToEditableState,
  type EditableQuoteSection,
  type ProcessedQuote,
} from "@/lib/processed-quote"
import { supabase } from "@/lib/supabase"

export function VoiceQuoteApp() {
  const [tab, setTab] = useState<Tab>("record")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0)
  const [rawTranscript, setRawTranscript] = useState(EMPTY_TRANSCRIPT)
  const [correctedTranscript, setCorrectedTranscript] = useState(EMPTY_TRANSCRIPT)
  const [processedQuote, setProcessedQuote] = useState<ProcessedQuote>(EMPTY_PROCESSED_QUOTE)
  const [quoteSections, setQuoteSections] = useState<EditableQuoteSection[] | null>(null)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [openDraftLoading, setOpenDraftLoading] = useState(false)
  const [openDraftError, setOpenDraftError] = useState("")
  const { user, loading, displayName, signInWithGoogle, signOut } = useAuth()
  const signedIn = Boolean(user)

  useEffect(() => {
    if (signedIn) return
    setReviewOpen(false)
    setDraftOpen(false)
  }, [signedIn])

  function handleDraftSaved() {
    setDraftsRefreshKey((key) => key + 1)
  }

  function handleQuoteProcessed(
    nextRawTranscript: string,
    nextCorrectedTranscript: string,
    nextProcessedQuote: ProcessedQuote,
  ) {
    setRawTranscript(nextRawTranscript)
    setCorrectedTranscript(nextCorrectedTranscript)
    setProcessedQuote(nextProcessedQuote)
    setQuoteSections(null)
    setEditingDraftId(null)
    setOpenDraftError("")
    setReviewOpen(true)
  }

  function handleQuoteEdited(nextProcessedQuote: ProcessedQuote) {
    setProcessedQuote(nextProcessedQuote)
  }

  function handleSectionsEdited(nextSections: EditableQuoteSection[]) {
    setQuoteSections(nextSections)
  }

  async function handleOpenDraft(draftId: string) {
    setOpenDraftLoading(true)
    setOpenDraftError("")

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setOpenDraftLoading(false)
      setOpenDraftError(userError?.message ?? "Sign in to open quote drafts.")
      return
    }

    const { data, error } = await supabase
      .from("quote_drafts")
      .select("id, client_name, site_address, quote_title, job_type, raw_transcript, quote_sections, line_items")
      .eq("id", draftId)
      .eq("user_id", user.id)
      .single()

    setOpenDraftLoading(false)

    if (error || !data) {
      setOpenDraftError(error?.message ?? "Could not open quote draft.")
      return
    }

    const editableState = savedDraftToEditableState(data)
    setRawTranscript(editableState.rawTranscript)
    setCorrectedTranscript(editableState.rawTranscript)
    setProcessedQuote(editableState.processedQuote)
    setQuoteSections(editableState.sections)
    setEditingDraftId(data.id)
    setReviewOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <AuthStatus
        displayName={displayName}
        email={user?.email ?? null}
        loading={loading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
      />

      <main className="mx-auto min-h-screen max-w-md pb-24">
        {tab === "record" && (
          signedIn ? (
            <RecordScreen onProcess={handleQuoteProcessed} />
          ) : (
            <SignInRequired onSignIn={signInWithGoogle} />
          )
        )}
        {tab === "drafts" && (
          signedIn ? (
            <DraftsScreen onOpen={handleOpenDraft} refreshKey={draftsRefreshKey} />
          ) : (
            <SignInRequired onSignIn={signInWithGoogle} />
          )
        )}
        {tab === "knowledge" && <KnowledgeBaseScreen />}
        {tab === "settings" && <SettingsScreen />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      {(openDraftLoading || openDraftError) && (
        <div className="fixed inset-x-5 top-20 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 text-sm shadow-lg">
          {openDraftLoading ? (
            <p className="text-muted-foreground">Opening draft...</p>
          ) : (
            <p className="text-destructive">{openDraftError}</p>
          )}
        </div>
      )}

      {signedIn && reviewOpen && (
        <QuoteReview
          onClose={() => setReviewOpen(false)}
          onPreviewDraft={() => setDraftOpen(true)}
          onSaved={handleDraftSaved}
          rawTranscript={correctedTranscript || rawTranscript}
          originalTranscript={rawTranscript}
          processedQuote={processedQuote}
          onQuoteEdited={handleQuoteEdited}
          onSectionsEdited={handleSectionsEdited}
          draftId={editingDraftId}
          initialSections={quoteSections}
        />
      )}
      {signedIn && draftOpen && (
        <QuoteDraft
          onBack={() => setDraftOpen(false)}
          onSaved={handleDraftSaved}
          rawTranscript={rawTranscript}
          processedQuote={processedQuote}
          draftId={editingDraftId}
          quoteSections={quoteSections}
        />
      )}
    </div>
  )
}

function SignInRequired({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <div className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Sign in to use quotes</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Your recordings and drafts are linked to your Supabase user account.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}
