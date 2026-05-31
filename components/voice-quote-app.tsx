"use client"

import { useState } from "react"
import { BottomNav, type Tab } from "@/components/bottom-nav"
import { RecordScreen } from "@/components/record-screen"
import { DraftsScreen } from "@/components/drafts-screen"
import { TemplatesScreen } from "@/components/templates-screen"
import { UploadsScreen } from "@/components/uploads-screen"
import { SettingsScreen } from "@/components/settings-screen"
import { QuoteReview } from "@/components/quote-review"
import { QuoteDraft } from "@/components/quote-draft"

export function VoiceQuoteApp() {
  const [tab, setTab] = useState<Tab>("record")
  const [reviewOpen, setReviewOpen] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto min-h-screen max-w-md pb-24">
        {tab === "record" && <RecordScreen onProcess={() => setReviewOpen(true)} />}
        {tab === "drafts" && <DraftsScreen onOpen={() => setReviewOpen(true)} />}
        {tab === "templates" && <TemplatesScreen />}
        {tab === "uploads" && <UploadsScreen />}
        {tab === "settings" && <SettingsScreen />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      {reviewOpen && (
        <QuoteReview onClose={() => setReviewOpen(false)} onPreviewDraft={() => setDraftOpen(true)} />
      )}
      {draftOpen && <QuoteDraft onBack={() => setDraftOpen(false)} />}
    </div>
  )
}
