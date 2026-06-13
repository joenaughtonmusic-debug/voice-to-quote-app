import assert from "node:assert/strict"
import test from "node:test"

import { resolveServiceLineLabel } from "./service-line-labels"

test("resolves maintenance labour without falling back to planting", () => {
  const label = resolveServiceLineLabel({
    item: { item_name: "Garden Labour", item_type: "labour" },
    jobType: "maintenance",
    quoteTextParts: ["Weeding, pruning, herbicide spraying and plant health checks."],
  })

  assert.equal(label, "Garden maintenance labour")
})

test("resolves planting labour only when planting intent is present", () => {
  const label = resolveServiceLineLabel({
    item: { item_name: "Landscaping Labour", item_type: "labour" },
    jobType: "planting",
    quoteTextParts: ["Supply and install Ficus Tuffi hedge plants."],
    hasPlantingIntent: true,
  })

  assert.equal(label, "Planting labour")
})

test("resolves common trade labour labels", () => {
  assert.equal(resolveServiceLineLabel({ jobType: "decking", quoteTextParts: ["Build a deck."] }), "Decking labour")
  assert.equal(resolveServiceLineLabel({ jobType: "retaining", quoteTextParts: ["Build retaining wall."] }), "Retaining labour")
  assert.equal(resolveServiceLineLabel({ jobType: "landscaping", quoteTextParts: ["Paving and hardscape work."] }), "Landscaping labour")
})

test("uses selected template metadata when quote text is sparse", () => {
  const label = resolveServiceLineLabel({
    selectedTemplate: {
      category: "maintenance",
      template_name: "Ongoing Garden Maintenance Template",
    },
  })

  assert.equal(label, "Garden maintenance labour")
})

test("unknown labour falls back safely", () => {
  assert.equal(resolveServiceLineLabel({ quoteTextParts: ["General site visit."] }), "Labour")
})

test("specific imported item label wins over inferred context", () => {
  const label = resolveServiceLineLabel({
    item: {
      item_name: "Senior Arborist Climbing Labour",
      item_type: "labour",
    },
    jobType: "maintenance",
    quoteTextParts: ["Garden maintenance visit."],
  })

  assert.equal(label, "Senior Arborist Climbing Labour")
})
