import assert from "node:assert/strict"
import test from "node:test"
import { parseJsonWithRepair } from "./quote-json-repair"

test("repairs markdown fenced JSON", () => {
  const result = parseJsonWithRepair("```json\n{\"client_name\":\"Amy\"}\n```")

  assert.equal(result.repaired, true)
  assert.deepEqual(result.parsed, { client_name: "Amy" })
})

test("extracts first valid JSON object from surrounding text", () => {
  const result = parseJsonWithRepair("Here is the quote:\n{\"client_name\":\"Amy\",\"site_address\":\"44 Amy Street\"}\nThanks.")

  assert.equal(result.repaired, true)
  assert.deepEqual(result.parsed, {
    client_name: "Amy",
    site_address: "44 Amy Street",
  })
})

test("removes safe trailing commas", () => {
  const result = parseJsonWithRepair(`{
    "client_name": "Amy",
    "customer_scope": [
      "Install Ficus Tuffi hedge",
    ],
  }`)

  assert.equal(result.repaired, true)
  assert.deepEqual(result.parsed, {
    client_name: "Amy",
    customer_scope: ["Install Ficus Tuffi hedge"],
  })
})

test("returns null for genuinely invalid JSON", () => {
  const result = parseJsonWithRepair("not json { definitely broken")

  assert.equal(result.parsed, null)
  assert.equal(result.repaired, false)
  assert.ok(result.errorMessage.length > 0)
})
