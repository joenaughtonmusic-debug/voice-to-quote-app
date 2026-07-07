import assert from "node:assert/strict"
import test from "node:test"
import { calculatePlantCount, calculatePlantingQuote, extractPlantCalculatorRequestsFromText, extractSpokenSpacingMmFromText } from "./index"

test("calculates 11m at 800mm spacing", () => {
  const result = calculatePlantCount({ length_m: 11, spoken_spacing_mm: 800 })

  assert.equal(result.plant_count, 15)
  assert.equal(result.quantity_source, "calculated_from_spacing")
  assert.equal(result.formula, "ceil(11 / 0.8) + 1")
  assert.deepEqual(result.warnings, [])
})

test("calculates 11.5m at 800mm spacing", () => {
  const result = calculatePlantCount({ length_m: 11.5, spoken_spacing_mm: 800 })

  assert.equal(result.plant_count, 16)
  assert.equal(result.quantity_source, "calculated_from_spacing")
  assert.equal(result.formula, "ceil(11.5 / 0.8) + 1")
})

test("spoken quantity overrides spacing calculation", () => {
  const result = calculatePlantCount({
    spoken_quantity: 24,
    length_m: 11,
    spoken_spacing_mm: 800,
  })

  assert.equal(result.plant_count, 24)
  assert.equal(result.quantity_source, "spoken_quantity")
  assert.equal(result.formula, null)
  assert.equal(result.spacing_mm, 800)
  assert.deepEqual(result.warnings, [])
})

test("returns missing spacing warning when length is supplied without spacing", () => {
  const result = calculatePlantingQuote({ length_m: 11 })

  assert.equal(result.plant_count, null)
  assert.equal(result.quantity_source, "missing")
  assert.equal(result.warnings.some((warning) => warning.code === "missing_spacing"), true)
})

test("returns missing quantity warning when quantity and length are absent", () => {
  const result = calculatePlantingQuote({})

  assert.equal(result.plant_count, null)
  assert.equal(result.quantity_source, "missing")
  assert.equal(result.warnings.some((warning) => warning.code === "missing_quantity"), true)
  assert.equal(result.warnings.some((warning) => warning.code === "missing_length"), true)
})

test("extracts PlantCalculatorRequest from hedge length transcript", () => {
  const requests = extractPlantCalculatorRequestsFromText("11.5m Ficus Tuffi hedge")

  assert.equal(requests.length, 1)
  assert.equal(requests[0].plant_name, "Ficus Tuffi")
  assert.equal(requests[0].length_m, 11.5)
})

test("extracts spoken quantity from supply and install transcript", () => {
  const requests = extractPlantCalculatorRequestsFromText("Supply and install 24 Ficus Tuffi plants")
  const result = calculatePlantingQuote(requests[0])

  assert.equal(requests.length, 1)
  assert.equal(requests[0].plant_name, "Ficus Tuffi")
  assert.equal(requests[0].spoken_quantity, 24)
  assert.equal(result.plant_count, 24)
  assert.equal(result.quantity_source, "spoken_quantity")
  assert.equal(result.spacing_source, "not_required")
  assert.deepEqual(result.warnings, [])
})

test("extracts spoken quantity before newline notes", () => {
  const requests = extractPlantCalculatorRequestsFromText("Voice transcript:\nSupply and install 24 Ficus Tuffi plants\n\nAdded notes:\nFront boundary")
  const result = calculatePlantingQuote(requests[0])

  assert.equal(requests.length, 1)
  assert.equal(requests[0].plant_name, "Ficus Tuffi")
  assert.equal(requests[0].spoken_quantity, 24)
  assert.equal(result.plant_count, 24)
  assert.equal(result.warnings.some((warning) => warning.code === "missing_quantity"), false)
})

test("calculates 11.5m hedge at 600mm spacing", () => {
  const [request] = extractPlantCalculatorRequestsFromText("11.5m Ficus Tuffi hedge at 600mm spacing")
  const result = calculatePlantingQuote(request)

  assert.equal(request.plant_name, "Ficus Tuffi")
  assert.equal(request.length_m, 11.5)
  assert.equal(request.spoken_spacing_mm, 600)
  assert.equal(result.plant_count, 21)
  assert.equal(result.quantity_source, "calculated_from_spacing")
})

// ---------------------------------------------------------------------------
// Michelia transcript: "plant she wanted was" phrasing + "metres long" length sentence
// ---------------------------------------------------------------------------

const micheliaTranscriptForCalc = `
The planting area is approximately 14.2 metres long.

The plant she wanted was Michelia gracipes.

She does not want the biggest size, but please show both size options if available.

Plant spacing should be 50 centimetres.
`.trim()

test("Michelia transcript: does not extract 'long' as plant name from length sentence", () => {
  const requests = extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc)
  const badRequest = requests.find((r) => /^long$/i.test(r.plant_name ?? ""))
  assert.ok(
    !badRequest,
    `Must not produce plant_name="long" from a length sentence. Requests: ${JSON.stringify(requests)}`,
  )
})

test("Michelia transcript: does not produce bogus 'metres long. The' plant name", () => {
  const requests = extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc)
  const badRequest = requests.find((r) => /metres.*long/i.test(r.plant_name ?? ""))
  assert.ok(
    !badRequest,
    `Must not produce a plant_name containing "metres long" from the length/plant sentences. Requests: ${JSON.stringify(requests.map((r) => r.plant_name))}`,
  )
})

test("Michelia transcript: produces exactly one calculator request", () => {
  const requests = extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc)
  assert.equal(
    requests.length,
    1,
    `Expected exactly 1 request, got ${requests.length}: ${JSON.stringify(requests.map((r) => r.plant_name))}`,
  )
})

test("Michelia transcript: extracts Michelia gracipes as plant name", () => {
  const [request] = extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc)
  assert.ok(request, `Expected at least one request. Got: ${JSON.stringify(extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc))}`)
  assert.match(request.plant_name ?? "", /michelia/i)
})

test("Michelia transcript: extracts 14.2m as planting length", () => {
  const [request] = extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc)
  assert.ok(request, "Expected a request")
  assert.equal(request.length_m, 14.2)
})

test("Michelia transcript: extracts 500mm (50cm) spacing", () => {
  const [request] = extractPlantCalculatorRequestsFromText(micheliaTranscriptForCalc)
  assert.ok(request, "Expected a request")
  assert.equal(request.spoken_spacing_mm, 500)
})

test("extracts Stephanie Cotswold planting area plant name and centimetre spacing", () => {
  const transcript =
    "it was a 14.2 metre planting area, and the plant she wanted planting was Michaelia gracipes. Maybe give both sizes as an option, probably with 50 centimetre spacing"

  assert.equal(extractSpokenSpacingMmFromText(transcript), 500)

  const [request] = extractPlantCalculatorRequestsFromText(transcript)
  assert.equal(request.length_m, 14.2)
  assert.match(request.plant_name ?? "", /gracipes/i)
  assert.equal(request.spoken_spacing_mm, 500)
})

test("extracts separate lower and upper planting area requests", () => {
  const requests = extractPlantCalculatorRequestsFromText(`Lower planting area:
11.5m Ficus Tuffi hedge.
Need pricing for 1.2m, 25L and 45L.

Upper planting area:
13.7m Ficus Tuffi hedge.
Need pricing for 1.2m, 25L and 45L.`)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].area_label, "Lower planting area")
  assert.equal(requests[0].length_m, 11.5)
  assert.deepEqual(requests[0].requested_option_sizes, ["1.2m", "25l", "45l"])
  assert.equal(requests[1].area_label, "Upper planting area")
  assert.equal(requests[1].length_m, 13.7)
  assert.deepEqual(requests[1].requested_option_sizes, ["1.2m", "25l", "45l"])
})

test("extracts mixed length and quantity planting areas", () => {
  const requests = extractPlantCalculatorRequestsFromText(`Front boundary:
12m Ficus Tuffi hedge.

Driveway planting:
20 Lomandra Lime Tuff plants.`)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].area_label, "Front boundary")
  assert.equal(requests[0].plant_name, "Ficus Tuffi")
  assert.equal(requests[0].length_m, 12)
  assert.equal(requests[1].area_label, "Driveway planting")
  assert.equal(requests[1].plant_name, "Lomandra Lime Tuff")
  assert.equal(requests[1].spoken_quantity, 20)
})

test("falls back to numbered planting area labels when no labels are spoken", () => {
  const requests = extractPlantCalculatorRequestsFromText(`Plant 12m Ficus Tuffi hedge.
Plant 8m Griselinia hedge.`)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].area_label, "Planting area 1")
  assert.equal(requests[1].area_label, "Planting area 2")
})

test("extracts messy Sarah multi-area planting without treating sizes or paver dimensions as plant rows", () => {
  const requests = extractPlantCalculatorRequestsFromText(`Quote for Sarah.

11.5m lower planting area. Need to add 1 hour for access. Need pricing for approximately 1m size Ficus Tuffi, 25L and 45L.

Labour for lower planting: assume 1.25 days, 2 people.

Lower paver area: 1.5m x 3.5m.

Upper planting area: 13.7m hedge row to be planted.

Need to determine the number of plants relative to size using a calculator. Pricing options same as lower hedge: approximately 1m, 25L and 45L.

Labour for upper planting: assume 1.75 days, 2 people.

Include hardfill / removal of old soil.

Include 6 bags garden mix.`)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].area_label, "Lower planting area")
  assert.equal(requests[0].plant_name, "Ficus Tuffi")
  assert.equal(requests[0].length_m, 11.5)
  assert.deepEqual(requests[0].requested_option_sizes, ["1m", "25l", "45l"])

  assert.equal(requests[1].area_label, "Upper planting area")
  assert.equal(requests[1].plant_name, "Ficus Tuffi")
  assert.equal(requests[1].length_m, 13.7)
  assert.deepEqual(requests[1].requested_option_sizes, ["1m", "25l", "45l"])
})

test("extracts Simon multi-area planting when plant name only appears in pricing options paragraph", () => {
  const requests = extractPlantCalculatorRequestsFromText(`Quote for Simon at 4A Amy Street, Ellerslie.

11.5m lower planting area.

13.7m upper planting area.

Need pricing for 25L and 45L Ficus Tuffi.

Include 6 bags garden mix at $18 each.

Include hardfill/removal of old soil at a cost of $154.`)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].area_label, "Lower planting area")
  assert.equal(requests[0].plant_name, "Ficus Tuffi")
  assert.equal(requests[0].length_m, 11.5)
  assert.deepEqual(requests[0].requested_option_sizes, ["25l", "45l"])

  assert.equal(requests[1].area_label, "Upper planting area")
  assert.equal(requests[1].plant_name, "Ficus Tuffi")
  assert.equal(requests[1].length_m, 13.7)
  assert.deepEqual(requests[1].requested_option_sizes, ["25l", "45l"])
})

// QA-9: structural landscaping phrases must never be treated as plant names, so a
// retaining-wall length sentence cannot fabricate a planting request/area. This is
// what caused the Adam/Titirangi customer preview to be taken over by the planting
// renderer (it read "16.8m for the retaining wall" as a 16.8m planting row).
test("does not create a plant calculator request from '16.8m for the retaining wall'", () => {
  const requests = extractPlantCalculatorRequestsFromText(
    "And the length is going to be 16.8m for the retaining wall.",
  )
  assert.deepEqual(requests, [])
})

test("'the retaining wall' is not accepted as a plant name (no request, and never as a plant_name)", () => {
  const requests = extractPlantCalculatorRequestsFromText(
    "The area is approximately 6m by 16.8m. And the length is going to be 16.8m for the retaining wall.",
  )
  assert.ok(
    !requests.some((r) => /retain|wall|fence|post|polythene|topsoil/i.test(r.plant_name ?? "")),
    `No request may carry a structural noun as a plant name. Got: ${JSON.stringify(requests)}`,
  )
})

test("Adam-style optional Ficus hedge without a count/length produces no fabricated planting request", () => {
  const requests = extractPlantCalculatorRequestsFromText(
    "It would be great to also do an optional price for planting a Ficus Tuffi hedge along the fence with roughly one metre sized plants, and the length is going to be 16.8m for the retaining wall.",
  )
  assert.deepEqual(requests, [])
})

test("still extracts a genuine plant request (regression guard for the structural-noun filter)", () => {
  const [request] = extractPlantCalculatorRequestsFromText("11.5m Ficus Tuffi hedge")
  assert.ok(request, "a real plant length sentence must still produce a request")
  assert.equal(request.plant_name, "Ficus Tuffi")
  assert.equal(request.length_m, 11.5)
})
