export type ScopeNoteType =
  | "exclusion"
  | "inclusion"
  | "client_supplied"
  | "retained_existing"
  | "not_required"
  | "site_note"

export type ScopeNoteConfidence = "high" | "medium" | "low"

export type ScopeNote = {
  id: string
  type: ScopeNoteType
  label: string
  source_text: string
  confidence: ScopeNoteConfidence
  metadata?: Record<string, string | number | boolean | null>
}

export type ScopeNoteExtractionResult = {
  notes: ScopeNote[]
  source_text: string
}
