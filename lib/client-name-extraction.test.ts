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

test("extracts client name from went and saw Name at address phrasing", () => {
  const clientName = extractClientNameFromTranscript(
    "Okay, just went and saw Monash at 19A Moore Avenue, Te Atatū Peninsula.",
  )

  assert.equal(clientName, "Monash")
})

test("extracts client name from went to see Name at address phrasing", () => {
  const clientName = extractClientNameFromTranscript("Just went to see Shirley at 6 Percival Parade, Freemans Bay.")

  assert.equal(clientName, "Shirley")
})

test("splits name directly before an address (no 'at'): 'Dan 54 Marua Road' -> Dan", () => {
  assert.equal(extractClientNameFromTranscript("Dan 54 Marua Road. Maintenance job, trim the Tecoma hedge."), "Dan")
  assert.equal(extractClientNameFromTranscript("Dan Smith, 54 Marua Road, Ellerslie."), "Dan Smith")
  assert.equal(extractClientNameFromTranscript("Maintenance quote for Dan 54 Marua Road."), "Dan")
})

test("name-before-address does not turn a trade phrase into a name", () => {
  // "trim the hedge" then an address must not yield "The hedge"/"The".
  assert.equal(extractClientNameFromTranscript("Trim the hedge. 54 Marua Road."), null)
})
