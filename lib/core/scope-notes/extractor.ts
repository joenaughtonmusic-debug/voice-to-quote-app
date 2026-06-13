import type { ScopeNote, ScopeNoteExtractionResult, ScopeNoteType } from "./types"

type ScopeNoteDraft = Omit<ScopeNote, "id">

function cleanSourceText(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]+$/g, "").trim()
}

function cleanLabel(value: string) {
  return value
    .replace(/\bfor\s+this\s+job\b/gi, "")
    .replace(/\brequired\b|\bneeded\b/gi, "")
    .replace(/\bby\s+client\b/gi, "")
    .replace(/^(?:the|any|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
    .trim()
    .toLowerCase()
}

function sentenceCandidates(text: string) {
  return Array.from(text.matchAll(/[^.!?\n]+[.!?]?/g))
    .map((match) => ({
      text: cleanSourceText(match[0]),
      start: match.index ?? 0,
    }))
    .filter((candidate) => candidate.text.length > 0)
}

function note(type: ScopeNoteType, label: string, sourceText: string, metadata?: ScopeNote["metadata"]): ScopeNoteDraft | null {
  const cleanedLabel = cleanLabel(label)
  const cleanedSourceText = cleanSourceText(sourceText)
  if (!cleanedLabel || !cleanedSourceText) return null

  return {
    type,
    label: cleanedLabel,
    source_text: cleanedSourceText,
    confidence: "high",
    metadata,
  }
}

function notesForSentence(sentence: string): ScopeNoteDraft[] {
  const notes: ScopeNoteDraft[] = []

  const notRequiredMatch = sentence.match(/\bno\s+(.+?)\s+(?:needed|required)\b/i)
  if (notRequiredMatch?.[1]) {
    const matchText = cleanSourceText(notRequiredMatch[0])
    const label = notRequiredMatch[1]
    const drafted = note("not_required", label, matchText)
    if (drafted) notes.push(drafted)
    return notes
  }

  const noExclusionMatch = sentence.match(/\bno\s+([a-z][a-z\s/-]{1,80}?)(?:\s+for\s+this\s+job)?$/i)
  if (noExclusionMatch?.[1]) {
    const drafted = note("exclusion", noExclusionMatch[1], noExclusionMatch[0])
    if (drafted) notes.push(drafted)
    return notes
  }

  const clientSuppliedMatch = sentence.match(/\bclient\s+(?:is\s+)?(?:supplying|supplies|supply|to\s+supply|providing|to\s+provide)\s+(.+?)$/i)
  if (clientSuppliedMatch?.[1]) {
    const drafted = note("client_supplied", clientSuppliedMatch[1], clientSuppliedMatch[0])
    if (drafted) notes.push(drafted)
    return notes
  }

  const clientRemovalMatch = sentence.match(/\bclient\s+(?:to\s+remove|removing|disposing(?:\s+of)?)\s+(.+?)$/i)
  if (clientRemovalMatch) {
    const drafted = note("not_required", clientRemovalMatch[1] || "removal", clientRemovalMatch[0], {
      responsibility: "client",
    })
    if (drafted) notes.push(drafted)
    return notes
  }

  const retainedMatch = sentence.match(/\b([a-z][a-z\s/-]{1,50}?)\s+(?:are|is)\s+(?:staying|retained|remaining|still\s+in\s+good\s+condition)\b/i)
  if (retainedMatch?.[1]) {
    const drafted = note("retained_existing", retainedMatch[1], retainedMatch[0])
    if (drafted) notes.push(drafted)
    return notes
  }

  const allowMatch = sentence.match(/\ballow\s+(?:time\s+for\s+|for\s+)?(.+?)$/i)
  if (allowMatch?.[1]) {
    const drafted = note("inclusion", allowMatch[1], allowMatch[0])
    if (drafted) notes.push(drafted)
    return notes
  }

  const accessMatch = sentence.match(/\baccess\s+(?:is|looks|seems)\s+([a-z][a-z\s-]{1,40})$/i)
  if (accessMatch?.[1]) {
    const drafted = note("site_note", `access ${accessMatch[1]}`, accessMatch[0], {
      field: "access",
    })
    if (drafted) notes.push(drafted)
  }

  return notes
}

function withIds(notes: ScopeNoteDraft[]) {
  return notes.map((scopeNote, index): ScopeNote => ({
    ...scopeNote,
    id: `scope-note-${index + 1}`,
  }))
}

function dedupeNotes(notes: ScopeNoteDraft[]) {
  const seen = new Set<string>()

  return notes.filter((scopeNote) => {
    const key = `${scopeNote.type}:${scopeNote.label}:${scopeNote.source_text}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractScopeNotes(text: string): ScopeNoteExtractionResult {
  const notes = sentenceCandidates(text).flatMap((candidate) => notesForSentence(candidate.text))

  return {
    notes: withIds(dedupeNotes(notes)),
    source_text: text,
  }
}
