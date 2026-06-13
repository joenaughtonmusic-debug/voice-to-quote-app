import assert from "node:assert/strict"
import test from "node:test"
import { buildQuoteReviewNotices, buildReviewNotices, reviewNoticeContributors } from "./index"

test("clean exact measurements do not create warning notices", () => {
  const notices = buildReviewNotices({ text: "Measure area 4m x 5m" })

  assert.equal(notices.some((notice) => notice.severity === "warning"), false)
  assert.deepEqual(notices, [])
})

test("approximate and uncertain measurements create warning notices", () => {
  const notices = buildReviewNotices({ text: "Deck about 5m wide and maybe 3.8m out" })
  const measurementNotices = notices.filter((notice) => notice.source === "measurement")

  assert.equal(measurementNotices.length, 2)
  assert.equal(measurementNotices.every((notice) => notice.category === "measurement"), true)
  assert.equal(measurementNotices.every((notice) => notice.severity === "warning"), true)
  assert.equal(measurementNotices.some((notice) => /about 5m wide/i.test(notice.message)), true)
  assert.equal(measurementNotices.some((notice) => /maybe 3.8m out/i.test(notice.message)), true)
})

test("rough measurements and inferred units create universal review notices", () => {
  const notices = buildReviewNotices({ text: "Retaining wall roughly 10m long and 800 high" })
  const approximate = notices.find((notice) => /10m long/i.test(notice.message))
  const inferred = notices.find((notice) => /Assumed 800 means 800mm\. Please verify\./i.test(notice.message))

  assert.equal(approximate?.severity, "warning")
  assert.equal(approximate?.metadata?.approximate, true)
  assert.equal(inferred?.severity, "info")
  assert.equal(inferred?.metadata?.unit_inferred, true)
  assert.equal(inferred?.metadata?.unit, "mm")
})

test("text with no measurements returns no notices for now", () => {
  const notices = buildReviewNotices({ text: "Install six downlights and two power points." })

  assert.deepEqual(notices, [])
})

test("review notice registry includes measurement and active trade contributors", () => {
  assert.deepEqual(reviewNoticeContributors.map((contributor) => contributor.id), ["measurement", "decking", "retaining"])
})

test("decking quote with missing estimating details creates decking notices", () => {
  const notices = buildReviewNotices({ text: "Quote for Steve. Decking 4m x 5m." })
  const deckingNotices = notices.filter((notice) => notice.metadata?.trade === "decking")

  assert.equal(deckingNotices.some((notice) => /species\/material/i.test(notice.message)), true)
  assert.equal(deckingNotices.some((notice) => /build scope/i.test(notice.message)), true)
  assert.equal(deckingNotices.some((notice) => /waste\/removal/i.test(notice.message)), true)
  assert.equal(deckingNotices.every((notice) => notice.source === "trade"), true)
  assert.equal(notices.some((notice) => notice.metadata?.trade === "retaining"), false)
})

test("decking quote with material scope waste and access creates fewer missing-info notices", () => {
  const notices = buildReviewNotices({
    text: "Build a 4m x 5m Kwila deck. Existing posts and subframe are retained. Remove old decking waste. Access is easy.",
  })
  const deckingMissingInfo = notices.filter((notice) => notice.metadata?.trade === "decking" && notice.category === "missing_info")

  assert.deepEqual(deckingMissingInfo, [])
})

test("decking quote with remove existing deck does not create missing waste notice", () => {
  const notices = buildReviewNotices({
    text: "Deck comes out 12.8m and across 15.6m. Need to remove existing deck. Use Kwila 140x19. Posts are still in good condition. Access is poor.",
  })

  assert.equal(notices.some((notice) => notice.id === "decking.missing-waste"), false)
})

test("decking quote without removal or waste language still creates missing waste notice", () => {
  const notices = buildReviewNotices({
    text: "Build a 4m x 5m Kwila deck. Existing posts are retained. Access is easy.",
  })

  assert.equal(notices.some((notice) => notice.id === "decking.missing-waste"), true)
})

test("retaining quote with missing estimating details creates retaining notices", () => {
  const notices = buildReviewNotices({ text: "Build retaining wall 10m long and 800mm high." })
  const retainingNotices = notices.filter((notice) => notice.metadata?.trade === "retaining")

  assert.equal(retainingNotices.some((notice) => /drainage/i.test(notice.message)), true)
  assert.equal(retainingNotices.some((notice) => /material/i.test(notice.message)), true)
  assert.equal(retainingNotices.some((notice) => /posts\/post holes/i.test(notice.message)), true)
  assert.equal(retainingNotices.some((notice) => /waste\/removal/i.test(notice.message)), true)
  assert.equal(retainingNotices.some((notice) => /access/i.test(notice.message)), true)
  assert.equal(retainingNotices.every((notice) => notice.source === "trade"), true)
  assert.equal(notices.some((notice) => notice.metadata?.trade === "decking"), false)
})

test("retaining quote with material drainage waste and access creates fewer missing-info notices", () => {
  const notices = buildReviewNotices({
    text: "Build timber retaining wall 10m long and 800mm high. Include drainage and posts. Remove old wall waste. Access is easy.",
  })
  const retainingMissingInfo = notices.filter((notice) => notice.metadata?.trade === "retaining" && notice.category === "missing_info")

  assert.deepEqual(retainingMissingInfo, [])
})

test("non-trade quote creates no trade-specific notices", () => {
  const notices = buildReviewNotices({ text: "Install six downlights and two power points." })

  assert.equal(notices.some((notice) => notice.source === "trade"), false)
})

test("quote review notices can be built from approximate transcript text", () => {
  const notices = buildQuoteReviewNotices({
    rawTranscript: "Deck about 5m wide and maybe 3.8m out",
    quoteTextParts: ["Build deck 5m x 3.8m"],
  })

  assert.equal(notices.length >= 2, true)
  assert.equal(notices.some((notice) => /about 5m wide/i.test(notice.message)), true)
  assert.equal(notices.some((notice) => /maybe 3.8m out/i.test(notice.message)), true)
})

test("quote review notices produce no warning notices for exact transcript text", () => {
  const notices = buildQuoteReviewNotices({
    rawTranscript: "Measure area 4m x 5m",
    quoteTextParts: ["Measure area 4m x 5m"],
  })

  assert.equal(notices.some((notice) => notice.severity === "warning"), false)
  assert.deepEqual(notices, [])
})
