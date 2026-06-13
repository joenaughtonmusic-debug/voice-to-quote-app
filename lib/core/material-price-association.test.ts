import assert from "node:assert/strict"
import test from "node:test"
import { associateMaterialPrices } from "./material-price-association"

test("associates separate material prices by nearest clause", () => {
  const result = associateMaterialPrices(
    "Include hardfill/removal of old soil at a cost of $154. Include 6 bags garden mix at $18 each.",
    [
      {
        id: "hardfill",
        description: "Hardfill / spoil removal",
        aliases: ["hardfill", "removal of old soil", "old soil"],
        defaultQuantity: 1,
        defaultUnit: "each",
      },
      {
        id: "garden-mix",
        description: "Garden mix",
        aliases: ["garden mix"],
      },
    ],
  )

  assert.equal(result[0].quantity, 1)
  assert.equal(result[0].unitAmount, 154)
  assert.equal(result[0].totalAmount, 154)
  assert.equal(result[0].confidence, "high")
  assert.equal(result[1].quantity, 6)
  assert.equal(result[1].unitAmount, 18)
  assert.equal(result[1].totalAmount, undefined)
  assert.equal(result[1].confidence, "high")
})

test("works for non-planting material and equipment examples", () => {
  const result = associateMaterialPrices(
    "Install 3 downlights at $45 each and allow cable at $120 total",
    [
      { id: "downlights", description: "Downlights", aliases: ["downlights", "downlight"] },
      { id: "cable", description: "Cable", aliases: ["cable"], defaultQuantity: 1, defaultUnit: "each" },
    ],
  )

  assert.equal(result[0].quantity, 3)
  assert.equal(result[0].unitAmount, 45)
  assert.equal(result[1].quantity, 1)
  assert.equal(result[1].unitAmount, 120)
  assert.equal(result[1].totalAmount, 120)
})

test("does not guess ambiguous shared pricing", () => {
  const result = associateMaterialPrices(
    "Install downlights cable for $120",
    [
      { id: "downlights", description: "Downlights", aliases: ["downlights", "downlight"] },
      { id: "cable", description: "Cable", aliases: ["cable"] },
    ],
  )

  assert.equal(result[0].unitAmount, undefined)
  assert.equal(result[0].confidence, "low")
  assert.equal(result[1].unitAmount, undefined)
  assert.equal(result[1].confidence, "low")
})
