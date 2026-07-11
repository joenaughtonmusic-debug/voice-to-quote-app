import assert from "node:assert/strict"
import test from "node:test"

import { parsePlantingMaterialQuantity, plantingMaterialsToBills } from "./to-material-bill"
import { clientALiveTranscript } from "../../quote-presentation/client-a-live-transcript"

test("plantingMaterialsToBills extracts five bags of garden mix from Client A transcript", () => {
  const bills = plantingMaterialsToBills({ transcript: clientALiveTranscript })

  assert.equal(bills.length, 1)
  assert.equal(bills[0]?.trade, "planting")
  assert.equal(bills[0]?.entries.length, 1)

  const gardenMix = bills[0]?.entries[0]
  assert.equal(gardenMix?.label, "Garden mix")
  assert.equal(gardenMix?.quantity, 5)
  assert.equal(gardenMix?.unit, "bags")
})

test("parsePlantingMaterialQuantity supports word-number bags", () => {
  const spec = {
    id: "garden-mix",
    label: "Garden mix",
    pattern: /\bgarden\s+mix\b/i,
    defaultUnit: "bags" as const,
    aliases: ["garden mix"],
  }

  const parsed = parsePlantingMaterialQuantity("she'll also need five bags of garden mix", spec)
  assert.equal(parsed.quantity, 5)
  assert.equal(parsed.unit, "bags")
})

test("plantingMaterialsToBills extracts cubic metres of mulch", () => {
  const bills = plantingMaterialsToBills({
    transcript: "Plant hedge and allow 3 cubic metres of mulch.",
  })

  const mulch = bills[0]?.entries.find((entry) => entry.label === "Mulch")
  assert.ok(mulch)
  assert.equal(mulch.quantity, 3)
  assert.equal(mulch.unit, "m3")
})

test("plantingMaterialsToBills reads quantities from processed quote materials", () => {
  const bills = plantingMaterialsToBills({
    transcript: "Planting job for Client A.",
    materials: ["Five bags of garden mix"],
  })

  const gardenMix = bills[0]?.entries.find((entry) => entry.label === "Garden mix")
  assert.ok(gardenMix)
  assert.equal(gardenMix.quantity, 5)
  assert.equal(gardenMix.unit, "bags")
})

test("plantingMaterialsToBills adds plant delivery allowance when delivery is mentioned", () => {
  const bills = plantingMaterialsToBills({
    transcript: "Plant hedge and include plant delivery.",
  })

  const delivery = bills[0]?.entries.find((entry) => entry.label === "Plant delivery")
  assert.ok(delivery)
  assert.equal(delivery.quantity, 1)
  assert.equal(delivery.unit, "each")
})
