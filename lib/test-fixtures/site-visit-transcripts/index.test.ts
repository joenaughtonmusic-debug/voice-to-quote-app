import assert from "node:assert/strict"
import test from "node:test"
import { analyseSiteVisitTranscriptFixture } from "./processor"
import { siteVisitTranscriptFixtures } from "./fixtures"
import type { ExpectedMeasurement, ExpectedNonEvent, ExpectedReviewNotice } from "./types"

function normalise(value: string) {
  return value.toLowerCase()
}

function measurementMatches(actual: ReturnType<typeof analyseSiteVisitTranscriptFixture>["measurements"][number], expected: ExpectedMeasurement) {
  return (
    actual.value === expected.value &&
    (expected.unit === undefined || actual.unit === expected.unit) &&
    (expected.dimension === undefined || actual.dimension === expected.dimension) &&
    (expected.approximate === undefined || actual.approximate === expected.approximate) &&
    (expected.uncertain === undefined || actual.uncertain === expected.uncertain) &&
    (expected.unit_inferred === undefined || actual.unit_inferred === expected.unit_inferred)
  )
}

function noticeMatches(actual: ReturnType<typeof analyseSiteVisitTranscriptFixture>["reviewNotices"][number], expected: ExpectedReviewNotice) {
  return (
    (expected.id === undefined || actual.id === expected.id) &&
    (expected.messageIncludes === undefined || normalise(actual.message).includes(normalise(expected.messageIncludes))) &&
    (expected.trade === undefined || actual.metadata?.trade === expected.trade) &&
    (expected.category === undefined || actual.category === expected.category) &&
    (expected.severity === undefined || actual.severity === expected.severity)
  )
}

function nonEventHappened(result: ReturnType<typeof analyseSiteVisitTranscriptFixture>, nonEvent: ExpectedNonEvent) {
  if (nonEvent.fact && result.facts.includes(nonEvent.fact)) return true
  if (typeof nonEvent.measurementValue === "number" && result.measurements.some((measurement) => {
    if (measurement.value !== nonEvent.measurementValue) return false
    return nonEvent.measurementUnit === undefined || measurement.unit === nonEvent.measurementUnit
  })) {
    return true
  }

  return result.reviewNotices.some((notice) => {
    if (nonEvent.id && notice.id !== nonEvent.id) return false
    if (nonEvent.messageIncludes && !normalise(notice.message).includes(normalise(nonEvent.messageIncludes))) return false
    if (nonEvent.trade && notice.metadata?.trade !== nonEvent.trade) return false
    if (nonEvent.category && notice.category !== nonEvent.category) return false
    return Boolean(nonEvent.id || nonEvent.messageIncludes || nonEvent.trade || nonEvent.category)
  })
}

test("site visit transcript fixtures cover deterministic app quote-processing layers", () => {
  assert.equal(siteVisitTranscriptFixtures.length, 11)

  for (const fixture of siteVisitTranscriptFixtures) {
    const result = analyseSiteVisitTranscriptFixture(fixture.transcript)
    const prefix = `${fixture.id}:`

    assert.equal(result.tradeCategory, fixture.expected.tradeCategory, `${prefix} trade category`)

    for (const expectedMeasurement of fixture.expected.measurements ?? []) {
      assert.equal(
        result.measurements.some((measurement) => measurementMatches(measurement, expectedMeasurement)),
        true,
        `${prefix} expected measurement ${JSON.stringify(expectedMeasurement)} not found in ${JSON.stringify(result.measurements)}`,
      )
    }

    for (const expectedNotice of fixture.expected.reviewNotices ?? []) {
      assert.equal(
        result.reviewNotices.some((notice) => noticeMatches(notice, expectedNotice)),
        true,
        `${prefix} expected review notice ${JSON.stringify(expectedNotice)} not found in ${JSON.stringify(result.reviewNotices)}`,
      )
    }

    for (const expectedNote of fixture.expected.exclusionsOrNotes ?? []) {
      assert.equal(
        result.exclusionsOrNotes.some((note) => normalise(note).includes(normalise(expectedNote))),
        true,
        `${prefix} expected exclusion/note "${expectedNote}" not found in ${JSON.stringify(result.exclusionsOrNotes)}`,
      )
    }

    for (const expectedFact of fixture.expected.facts ?? []) {
      assert.equal(
        result.facts.includes(expectedFact),
        true,
        `${prefix} expected fact "${expectedFact}" not found in ${JSON.stringify(result.facts)}`,
      )
    }

    for (const nonEvent of fixture.expected.nonEvents ?? []) {
      assert.equal(
        nonEventHappened(result, nonEvent),
        false,
        `${prefix} non-event happened: ${JSON.stringify(nonEvent)} in ${JSON.stringify({
          facts: result.facts,
          reviewNotices: result.reviewNotices,
          measurements: result.measurements,
        })}`,
      )
    }
  }
})
