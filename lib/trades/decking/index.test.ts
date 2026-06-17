import assert from "node:assert/strict"
import test from "node:test"
import { calculateDecking, detectDeckingFromText } from "./index"

test("detects and calculates a single deck area", () => {
  const transcript = "Quote for Steve at 12 Oak Road. Construct a 4m x 5m pine deck."
  const detection = detectDeckingFromText(transcript)
  const result = calculateDecking(detection.request)

  assert.equal(detection.is_decking, true)
  assert.equal(detection.request.areas.length, 1)
  assert.equal(result.areas.length, 1)
  assert.equal(result.areas[0].length_m, 4)
  assert.equal(result.areas[0].width_m, 5)
  assert.equal(result.areas[0].square_metres, 20)
  assert.equal(result.areas[0].board_type, "pine")
  assert.equal(result.total_square_metres, 20)
})

test("detects multiple deck areas with existing posts and waste removal", () => {
  const transcript =
    "Build a 4m x 5m pine deck. Also replace decking boards on a 3m x 4m section where posts already exist. Remove old decking waste."
  const detection = detectDeckingFromText(transcript)
  const result = calculateDecking(detection.request)

  assert.equal(detection.is_decking, true)
  assert.equal(result.areas.length, 2)

  assert.equal(result.areas[0].length_m, 4)
  assert.equal(result.areas[0].width_m, 5)
  assert.equal(result.areas[0].square_metres, 20)
  assert.equal(result.areas[0].build_scope, "full_build")

  assert.equal(result.areas[1].length_m, 3)
  assert.equal(result.areas[1].width_m, 4)
  assert.equal(result.areas[1].square_metres, 12)
  assert.equal(result.areas[1].build_scope, "decking_boards_only")
  assert.equal(result.areas[1].existing_posts, "yes")

  assert.equal(result.total_square_metres, 32)
  assert.deepEqual(result.waste_removal_notes, ["Remove old decking waste"])
  assert.equal(
    result.areas[0].warnings.some((warning) => warning.code === "subframe_status_unclear"),
    false,
  )
})

test("detects and calculates area from 'N by M metre' phrasing", () => {
  const transcript = "Build a 4 by 5 metre Kwila deck."
  const detection = detectDeckingFromText(transcript)
  const result = calculateDecking(detection.request)

  assert.equal(detection.is_decking, true)
  assert.equal(detection.request.areas.length, 1)
  assert.equal(result.areas[0].length_m, 4)
  assert.equal(result.areas[0].width_m, 5)
  assert.equal(result.areas[0].square_metres, 20)
  assert.equal(result.areas[0].board_type, "kwila")
})

test("does not detect decking from electrical transcript", () => {
  const transcript = "Install six downlights and two power points."
  const detection = detectDeckingFromText(transcript)
  const result = calculateDecking(detection.request)

  assert.equal(detection.is_decking, false)
  assert.equal(detection.confidence, "none")
  assert.equal(detection.request.areas.length, 0)
  assert.equal(result.areas.length, 0)
  assert.equal(result.total_square_metres, null)
})
