import assert from "node:assert/strict"
import test from "node:test"
import { extractClientNameFromTranscript } from "./client-name-extraction"

test("extracts client name from short Quote for Name sentence", () => {
  const clientName = extractClientNameFromTranscript(
    "Quote for Sarah. Lower planting area: 11.5m Ficus Tuffi hedge.",
  )

  assert.equal(clientName, "Sarah")
})

test("extracts client name from service for Name at address phrasing", () => {
  const clientName = extractClientNameFromTranscript(
    "Monthly maintenance for Stella at 6 Tarawera Terrace, St Heliers.",
  )

  assert.equal(clientName, "Stella")
})

test("does not treat planting area labels as client names", () => {
  const clientName = extractClientNameFromTranscript("Quote for lower planting area: 11.5m Ficus Tuffi hedge.")

  assert.equal(clientName, null)
})

test("does not treat plant names as client names", () => {
  const clientName = extractClientNameFromTranscript("Quote for Ficus Tuffi hedge.")

  assert.equal(clientName, null)
})
