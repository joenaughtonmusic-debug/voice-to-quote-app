import assert from "node:assert/strict"
import test from "node:test"
import { assessBuildConfidence, jobTypeRecognised } from "./quote-build-confidence"

test("route + price + recognised job type -> builds, no reasons", () => {
  const r = assessBuildConfidence({ hasRoute: true, hasPrice: true, jobTypeRecognised: true })
  assert.equal(r.canBuild, true)
  assert.deepEqual(r.reasons, [])
})

test("THE BUG: a route rendered but there is no price -> NOT buildable, loud reason", () => {
  const r = assessBuildConfidence({ hasRoute: true, hasPrice: false, jobTypeRecognised: true })
  assert.equal(r.canBuild, false)
  assert.equal(r.headline, "Couldn't build this quote reliably")
  assert.ok(r.reasons.some((x) => /no price/i.test(x)))
})

test("no route matched -> NOT buildable, route reason", () => {
  const r = assessBuildConfidence({ hasRoute: false, hasPrice: true, jobTypeRecognised: false })
  assert.equal(r.canBuild, false)
  assert.ok(r.reasons.some((x) => /job type wasn't confidently recognised/i.test(x)))
})

test("neither route nor price -> both reasons", () => {
  const r = assessBuildConfidence({ hasRoute: false, hasPrice: false, jobTypeRecognised: false })
  assert.equal(r.canBuild, false)
  assert.equal(r.reasons.length, 2)
})

test("buildable but vague job type -> builds with a caution reason", () => {
  const r = assessBuildConfidence({ hasRoute: true, hasPrice: true, jobTypeRecognised: false })
  assert.equal(r.canBuild, true)
  assert.ok(r.reasons.some((x) => /unclear/i.test(x)))
})

test("jobTypeRecognised helper", () => {
  assert.equal(jobTypeRecognised("One-Off Garden Tidy"), true)
  assert.equal(jobTypeRecognised(""), false)
  assert.equal(jobTypeRecognised("not captured"), false)
  assert.equal(jobTypeRecognised("general"), false)
})
