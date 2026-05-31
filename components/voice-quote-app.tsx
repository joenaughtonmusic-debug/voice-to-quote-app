"use client"

import { useEffect, useState } from "react"
import { BottomNav, type Tab } from "@/components/bottom-nav"
import { RecordScreen } from "@/components/record-screen"
import { DraftsScreen } from "@/components/drafts-screen"
import { TemplatesScreen } from "@/components/templates-screen"
import { UploadsScreen } from "@/components/uploads-screen"
import { SettingsScreen } from "@/components/settings-screen"
import { QuoteReview } from "@/components/quote-review"
import { QuoteDraft } from "@/components/quote-draft"
import { AuthStatus } from "@/components/auth-status"
import { useAuth } from "@/hooks/use-auth"
import { LockKeyhole } from "lucide-react"
import { EMPTY_TRANSCRIPT } from "@/components/record-screen"
import { EMPTY_PROCESSED_QUOTE, type ProcessedQuote } from "@/lib/processed-quote"

export function VoiceQuoteApp() {
  const [tab, setTab] = useState<Tab>("record")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0)
  const [rawTranscript, setRawTranscript] = useState(EMPTY_TRANSCRIPT)
  const [processedQuote, setProcessedQuote] = useState<ProcessedQuote>(EMPTY_PROCESSED_QUOTE)
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

  function handleQuoteProcessed(nextRawTranscript: string, nextProcessedQuote: ProcessedQuote) {
    setRawTranscript(nextRawTranscript)
    setProcessedQuote(nextProcessedQuote)
    setReviewOpen(true)
  }

  function handleQuoteEdited(nextProcessedQuote: ProcessedQuote) {
    setProcessedQuote(nextProcessedQuote)
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
            <DraftsScreen onOpen={() => setReviewOpen(true)} refreshKey={draftsRefreshKey} />
          ) : (
            <SignInRequired onSignIn={signInWithGoogle} />
          )
        )}
        {tab === "templates" && <TemplatesScreen />}
        {tab === "uploads" && <UploadsScreen />}
        {tab === "settings" && <SettingsScreen />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      {signedIn && reviewOpen && (
        <QuoteReview
          onClose={() => setReviewOpen(false)}
          onPreviewDraft={() => setDraftOpen(true)}
          onSaved={handleDraftSaved}
          rawTranscript={rawTranscript}
          processedQuote={processedQuote}
          onQuoteEdited={handleQuoteEdited}
        />
      )}
      {signedIn && draftOpen && (
        <QuoteDraft
          onBack={() => setDraftOpen(false)}
          onSaved={handleDraftSaved}
          rawTranscript={rawTranscript}
          processedQuote={processedQuote}
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
