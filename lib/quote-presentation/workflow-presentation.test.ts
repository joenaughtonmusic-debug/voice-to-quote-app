import assert from "node:assert/strict"
import test from "node:test"

import { buildGardenTidyProcessedQuote } from "../garden-tidy-processing"
import { EMPTY_PROCESSED_QUOTE } from "../processed-quote"
import type { QuoteOption } from "../quote-options"
import {
  buildQuotePresentationModel,
  customerViewLines,
  exportViewLines,
  isGardenTidyWorkflow,
  isTradeCalculatorWorkflow,
} from "./index"

function tradeOption(id: string, areaLabel: string, itemName: string, quantity: number, unit: string, unitPrice: number): QuoteOption {
  const subtotal = quantity * unitPrice
  return {
    id,
    label: areaLabel,
    title: areaLabel,
    category: "material",
    source: "trade_calculator",
    areaLabel,
    lineItems: [
      {
        itemName,
        quantity,
        unit,
        unitPrice,
        total: subtotal,
      },
    ],
    subtotal,
  }
}

test("garden tidy presentation model includes scope and greenwaste lines", () => {
  const shirleyTranscript =
    "Just went to see Shirley at 6 Percival Parade, Freemans Bay. The quote is a one-off tidy, mostly hedge trimming and tree pruning. We need to prune back the Mexican elder trees on the right-hand boundary. That job will take two people one and a quarter days with two trailer loads of green waste."

  const quote = {
    ...buildGardenTidyProcessedQuote(shirleyTranscript),
    selected_template_name: "One-Off Garden Tidy",
  }

  assert.ok(isGardenTidyWorkflow(quote))
  const model = buildQuotePresentationModel({ quote, rawTranscript: shirleyTranscript })
  assert.ok(model)
  assert.equal(model?.workflow, "garden_tidy")

  const customerLines = customerViewLines(model!)
  assert.ok(customerLines.some((line) => line.role === "scope_line"))
  assert.ok(customerLines.some((line) => line.role === "waste"))

  const exportLines = exportViewLines(model!)
  assert.ok(exportLines.some((line) => line.role === "labour"))
  assert.ok(exportLines.some((line) => line.role === "waste"))
})

test("trade calculator presentation model surfaces priced decking quote_options", () => {
  const quote = {
    ...EMPTY_PROCESSED_QUOTE,
    job_type: "Decking",
    quote_title: "Decking Quote",
    quote_options: [tradeOption("decking-bill-1-main-deck", "Main deck", "90x19 Kwila Decking", 20, "m2", 6.8)],
  }

  assert.ok(isTradeCalculatorWorkflow(quote))
  const model = buildQuotePresentationModel({ quote })
  assert.ok(model)
  assert.equal(model?.workflow, "decking")

  const pricedLines = model!.lines.filter((line) => line.exportable)
  assert.equal(pricedLines.length, 1)
  assert.equal(pricedLines[0]?.subtotal, 136)
  assert.equal(pricedLines[0]?.itemCode, undefined)
})

test("trade calculator presentation falls back to unpriced facts when quote_options are absent", () => {
  const quote = {
    ...EMPTY_PROCESSED_QUOTE,
    job_type: "Retaining",
    quote_title: "Retaining Quote",
    primary_quote: {
      ...EMPTY_PROCESSED_QUOTE.primary_quote,
      scope: ["Build a 10m long retaining wall, 600mm high."],
    },
  }

  const model = buildQuotePresentationModel({ quote })
  assert.ok(model)
  assert.equal(model?.workflow, "retaining")
  assert.ok(model!.lines.some((line) => line.role === "labour" && line.reviewRequired))
  assert.ok(model!.lines.some((line) => line.role === "material" && line.reviewRequired))
})
