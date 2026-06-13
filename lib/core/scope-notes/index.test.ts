import assert from "node:assert/strict"
import test from "node:test"
import { extractScopeNotes } from "./index"
import type { ScopeNoteType } from "./types"

function noteSummary(text: string) {
  return extractScopeNotes(text).notes.map((note) => [note.type, note.label, note.source_text, note.confidence])
}

function hasNote(text: string, type: ScopeNoteType, label: string) {
  return extractScopeNotes(text).notes.some((note) => note.type === type && note.label === label)
}

test("detects staining exclusion", () => {
  assert.deepEqual(noteSummary("No staining for this job"), [
    ["exclusion", "staining", "No staining for this job", "high"],
  ])
})

test("detects irrigation exclusion", () => {
  assert.deepEqual(noteSummary("No irrigation"), [
    ["exclusion", "irrigation", "No irrigation", "high"],
  ])
})

test("detects client supplied plants", () => {
  assert.deepEqual(noteSummary("Client supplying plants"), [
    ["client_supplied", "plants", "Client supplying plants", "high"],
  ])
})

test("detects retained existing posts", () => {
  assert.deepEqual(noteSummary("Posts are staying"), [
    ["retained_existing", "posts", "Posts are staying", "high"],
  ])
})

test("detects not required removal", () => {
  assert.deepEqual(noteSummary("No removal needed"), [
    ["not_required", "removal", "No removal needed", "high"],
  ])
})

test("detects tidy up inclusion", () => {
  assert.deepEqual(noteSummary("Allow time for tidy up"), [
    ["inclusion", "tidy up", "Allow time for tidy up", "high"],
  ])
})

test("detects poor access site note", () => {
  const notes = extractScopeNotes("Access is poor").notes

  assert.equal(notes.length, 1)
  assert.equal(notes[0].type, "site_note")
  assert.equal(notes[0].label, "access poor")
  assert.equal(notes[0].metadata?.field, "access")
})

test("detects generic negative waste and client responsibility notes", () => {
  assert.equal(hasNote("No waste removal required", "not_required", "waste removal"), true)
  assert.equal(hasNote("No disposal needed", "not_required", "disposal"), true)
  assert.equal(hasNote("Client disposing old boards", "not_required", "old boards"), true)
})

test("ordinary quote text with no scope notes returns empty", () => {
  const result = extractScopeNotes("Build a 4m x 5m deck with pine boards.")

  assert.deepEqual(result.notes, [])
})
