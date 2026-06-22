import assert from "node:assert/strict"
import test from "node:test"
import { buildXeroQuotePayload, xeroPayloadHasInternalDetails, type XeroPayloadQuote } from "./xero-quote-payload"
import type { PlantCalculatorResult } from "./calculators/planting"
import type { QuoteOption } from "./quote-options"

function plantOption(
  id: string,
  title: string,
  areaLabel: string,
  quantity: number,
  subtotal: number,
  itemCode: string,
  metadata: Partial<QuoteOption["lineItems"][number]> = {},
): QuoteOption {
  return {
    id,
    label: "Option",
    title,
    category: "planting",
    source: "plant_calculator",
    areaLabel,
    lineItems: [
      {
        itemName: title,
        itemCode,
        ...metadata,
        quantity,
        unit: "each",
        unitPrice: subtotal / quantity,
        total: subtotal,
        supplier: "Internal Nursery",
        stockStatus: "In stock",
      },
    ],
    subtotal,
    notes: ["Spacing source: plant_library", "Plant count formula: ceil(11.5 / 0.85) + 1"],
  }
}

function plantResult(areaLabel: string, lengthM: number, plantCount: number): PlantCalculatorResult {
  return {
    area_label: areaLabel,
    plant_name: "Ficus Tuffi",
    plant_count: plantCount,
    quantity_source: "calculated_from_spacing",
    length_m: lengthM,
    spacing_mm: 850,
    spacing_source: "plant_library",
    formula: `ceil(${lengthM} / 0.85) + 1`,
    library_match: null,
    options: [],
    option_groups: [],
    warnings: [],
  }
}

const sarahQuote: XeroPayloadQuote = {
  client_name: "Sarah",
  site_address: "44 Sarah Street",
  quote_title: "Hedge planting quote",
  job_type: "Hedge Planting",
  customer_scope: [],
  line_items: [
    {
      item_code: "10010",
      item_name: "Landscaping Labour",
      item_type: "labour",
      quantity: "48 hours",
      unit: "hours",
      final_rate_used: "110",
      total: "5280.00",
      account_code: "4100",
      tax_type: "OUTPUT2",
    },
    {
      item_code: "MAT-GARDEN-MIX",
      item_name: "garden mix",
      item_type: "material",
      quantity: "6 bags",
      unit: "bags",
      warning: "Rate missing",
      sales_account_code: "4200",
      tax_code: "GST on Income",
    },
    {
      item_code: "WASTE-HARDFILL",
      item_name: "hardfill",
      item_type: "material",
      warning: "Quantity missing",
      account_code: "4300",
      gst_rate: 15,
    },
  ],
  quote_options: [
    plantOption("lower-25l", "Lower planting area - Ficus Tuffi 25L", "Lower planting area", 15, 1781.25, "PLANT-060", {
      accountCode: "4400",
      taxType: "OUTPUT2",
      sourceItemId: "plant-row-060",
    }),
    plantOption("upper-25l", "Upper planting area - Ficus Tuffi 25L", "Upper planting area", 18, 2137.5, "PLANT-060", {
      accountCode: "4400",
      taxType: "OUTPUT2",
      sourceItemId: "plant-row-060",
    }),
    plantOption("lower-45l", "Lower planting area - Ficus Tuffi 45L", "Lower planting area", 15, 2625, "PLANT-072", {
      salesAccountCode: "4400",
      taxCode: "GST on Income",
    }),
    plantOption("upper-45l", "Upper planting area - Ficus Tuffi 45L", "Upper planting area", 18, 3150, "PLANT-072", {
      salesAccountCode: "4400",
      taxCode: "GST on Income",
    }),
  ],
  plant_calculator_results: [plantResult("Lower planting area", 11.5, 15), plantResult("Upper planting area", 13.7, 18)],
}

test("builds Sarah Xero draft quote payload with base plant option and upgrade note", () => {
  const payload = buildXeroQuotePayload(sarahQuote, { now: new Date("2026-06-07T00:00:00.000Z"), draftId: "draft-1" })

  assert.equal(payload.provider, "xero")
  assert.equal(payload.action, "create_draft_quote")
  assert.equal(payload.quote.status, "DRAFT")
  assert.equal(payload.contact.name, "Sarah")
  assert.equal(payload.contact.address, "44 Sarah Street")
  assert.deepEqual(payload.contactCollection, [{ Name: "Sarah", Address: "44 Sarah Street" }])
  assert.equal(payload.quote.date, "2026-06-07")
  assert.equal(payload.quote.expiryDate, "2026-07-07")
  assert.deepEqual(
    payload.quote.lineItems.map((item) => [item.description, item.quantity, item.unitAmount]),
    [
      ["Planting labour - Plant multiple Ficus Tuffi along lower planting area", 1, 5280],
      ["Plants - Ficus Tuffi 25L, 33 plants", 1, 3918.75],
      ["Garden mix - 6 bags", 6, undefined],
      ["Hardfill / spoil removal", 1, undefined],
    ],
  )
  assert.deepEqual(payload.quote.lineItemsArray, payload.quote.lineItems)
  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [
      item.Description,
      item.Quantity,
      item.UnitAmount,
      item.ItemCode ?? "",
      item.AccountCode ?? "",
      item.TaxType,
    ]),
    [
      ["Planting labour - Plant multiple Ficus Tuffi along lower planting area", 1, 5280, "", "4100", "OUTPUT2"],
      ["Plants - Ficus Tuffi 25L", 33, 118.75, "", "4400", "OUTPUT2"],
      ["Garden mix - 6 bags", 6, 0, "", "4200", "OUTPUT2"],
      ["Hardfill / spoil removal", 1, 0, "", "4300", "OUTPUT2"],
    ],
  )
  assert.equal(payload.quote.lineItems.some((item) => "ItemCode" in item), false)
  assert.equal(
    payload.quote.xeroLineItemsArray.every((item) =>
      typeof item.Description === "string" &&
      typeof item.Quantity === "number" &&
      typeof item.UnitAmount === "number" &&
      item.TaxType === "OUTPUT2",
    ),
    true,
  )
  assert.equal(
    payload.quote.notes.includes("Upgrade option available: Ficus Tuffi 45L, 33 plants: $5,775.00"),
    true,
  )
  assert.equal(xeroPayloadHasInternalDetails(payload), false)
})

test("missing customer email and missing material rates do not crash Xero payload generation", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      customer_email: null,
      line_items: sarahQuote.line_items.map((item) => ({ ...item, rate: null, final_rate_used: item.item_type === "labour" ? item.final_rate_used : null })),
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal("emailAddress" in payload.contact, false)
  assert.equal(payload.quote.lineItems.some((item) => item.description.startsWith("Garden mix")), true)
})

test("recovers garden mix quantity from material description when quantity field is missing", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: [
        {
          item_code: "MAT-GARDEN-MIX",
          item_name: "Garden mix",
          item_type: "material",
          description: "Include 6 bags garden mix",
          quantity: null,
          unit: "bags",
          warning: "Rate missing",
        },
      ],
      quote_options: [],
      plant_calculator_results: [],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const gardenMix = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Garden mix"))
  assert.equal(gardenMix?.Quantity, 6)
  assert.equal(gardenMix?.UnitAmount, 0)
})

test("planting renderer exports material and removal lines from quote facts", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: sarahQuote.line_items.filter((item) => item.item_type === "labour"),
      materials: ["Include 6 bags garden mix", "hardfill / removal of old soil"],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const gardenMix = payload.quote.xeroLineItemsArray.find((item) => item.Description === "Garden mix")
  const hardfill = payload.quote.xeroLineItemsArray.find((item) => item.Description === "Hardfill / spoil removal")

  assert.equal(gardenMix?.Quantity, 6)
  assert.equal(gardenMix?.UnitAmount, 0)
  assert.equal(gardenMix?.AccountCode, "10011")
  assert.equal(gardenMix?.TaxType, "OUTPUT2")
  assert.equal(hardfill?.Quantity, 1)
  assert.equal(hardfill?.UnitAmount, 0)
  assert.equal(hardfill?.AccountCode, "10011")
  assert.equal(hardfill?.TaxType, "OUTPUT2")
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes('Price missing for "Garden mix"')), true)
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes('Price missing for "Hardfill / spoil removal"')), true)
})

test("planting renderer preserves explicit hardfill removal lump-sum price from quote facts", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: sarahQuote.line_items.filter((item) => item.item_type === "labour"),
      materials: ["Include hardfill/removal of old soil at a cost of $154."],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const hardfill = payload.quote.xeroLineItemsArray.find((item) => item.Description === "Hardfill / spoil removal")

  assert.equal(hardfill?.Quantity, 1)
  assert.equal(hardfill?.UnitAmount, 154)
  assert.equal(hardfill?.AccountCode, "10011")
  assert.equal(hardfill?.TaxType, "OUTPUT2")
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes('Price missing for "Hardfill / spoil removal"')), false)
})

test("Simon planting quote preserves hardfill removal price when matched line item has quantity only", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      client_name: "Simon",
      line_items: [
        {
          ...sarahQuote.line_items[0],
          account_code: "",
          sales_account_code: "",
          tax_type: "",
          tax_code: "",
          gst_rate: undefined,
        },
        {
          item_name: "Garden mix",
          item_type: "material",
          quantity: "6 bags",
          unit: "bags",
          final_rate_used: "18",
          total: "108",
        },
        {
          item_name: "Hardfill / old soil removal",
          item_type: "material",
          quantity: "1",
          unit: "each",
          final_rate_used: null,
          total: null,
          warning: "Rate missing",
        },
      ],
      quote_options: sarahQuote.quote_options?.map((option) => ({
        ...option,
        lineItems: option.lineItems.map((item) => ({
          ...item,
          accountCode: undefined,
          salesAccountCode: undefined,
          taxType: undefined,
          taxCode: undefined,
          gstRate: undefined,
        })),
      })),
      materials: ["Include 6 bags garden mix at $18 each.", "Include hardfill/removal of old soil at a cost of $154."],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const gardenMix = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Garden mix"))
  const hardfill = payload.quote.xeroLineItemsArray.find((item) => item.Description === "Hardfill / spoil removal")

  assert.equal(gardenMix?.Quantity, 6)
  assert.equal(gardenMix?.UnitAmount, 18)
  assert.equal(gardenMix?.AccountCode, "10011")
  assert.equal(gardenMix?.TaxType, "OUTPUT2")
  assert.equal(hardfill?.Quantity, 1)
  assert.equal(hardfill?.UnitAmount, 154)
  assert.equal(hardfill?.AccountCode, "10011")
  assert.equal(hardfill?.TaxType, "OUTPUT2")
  assert.equal(payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Planting labour"))?.AccountCode, "10010")
  assert.equal(payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Plants -"))?.AccountCode, "10115")
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes('Price missing for "Hardfill / spoil removal"')), false)
})

test("missing contact creates empty contact collection for API guard", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      client_name: "Not captured",
      site_address: "44 Sarah Street",
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.contact.name, "Not captured")
  assert.deepEqual(payload.contactCollection, [])
})

test("missing item codes do not crash Xero payload generation", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: sarahQuote.line_items.map((item) => ({ ...item, item_code: "" })),
      quote_options: sarahQuote.quote_options?.map((option) => ({
        ...option,
        lineItems: option.lineItems.map((item) => ({ ...item, itemCode: undefined })),
      })),
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.xeroLineItemsArray.length, 4)
  assert.equal(payload.quote.xeroLineItemsArray.every((item) => !("ItemCode" in item)), true)
})

test("uses category account defaults when imported account metadata is missing", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: sarahQuote.line_items.map((item) => ({
        ...item,
        account_code: "",
        sales_account_code: "",
      })),
      quote_options: sarahQuote.quote_options?.map((option) => ({
        ...option,
        lineItems: option.lineItems.map((item) => ({
          ...item,
          accountCode: undefined,
          salesAccountCode: undefined,
          taxType: undefined,
          taxCode: undefined,
          gstRate: undefined,
        })),
      })),
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const labourLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Planting labour"))
  const plantLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Plants -"))
  const materialLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Garden mix"))
  assert.equal(labourLine?.AccountCode, "10010")
  assert.equal(plantLine?.AccountCode, "10115")
  assert.equal(materialLine?.AccountCode, "10011")
  assert.equal(plantLine?.TaxType, "OUTPUT2")
})

test("uses user-confirmed export mappings before compatibility defaults", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: sarahQuote.line_items.map((item) => ({
        ...item,
        account_code: "",
        sales_account_code: "",
        tax_type: "",
        tax_code: "",
        gst_rate: undefined,
      })),
      quote_options: sarahQuote.quote_options?.map((option) => ({
        ...option,
        lineItems: option.lineItems.map((item) => ({
          ...item,
          accountCode: undefined,
          salesAccountCode: undefined,
          taxType: undefined,
          taxCode: undefined,
          gstRate: undefined,
        })),
      })),
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        {
          provider: "xero",
          category: "labour",
          account_code: "700",
          tax_type: "OUTPUT2",
          export_enabled: true,
          item_code_policy: "confirmed_inventory_only",
          is_user_confirmed: true,
          source: "user",
        },
        {
          provider: "xero",
          category: "plants",
          account_code: "710",
          tax_type: "OUTPUT2",
          export_enabled: true,
          item_code_policy: "confirmed_inventory_only",
          is_user_confirmed: true,
          source: "user",
        },
        {
          provider: "xero",
          category: "materials",
          account_code: "720",
          tax_type: "OUTPUT2",
          export_enabled: true,
          item_code_policy: "confirmed_inventory_only",
          is_user_confirmed: true,
          source: "user",
        },
        {
          provider: "xero",
          category: "waste",
          account_code: "730",
          tax_type: "OUTPUT2",
          export_enabled: true,
          item_code_policy: "confirmed_inventory_only",
          is_user_confirmed: true,
          source: "user",
        },
      ],
    },
  )

  const labourLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Planting labour"))
  const plantLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Plants -"))
  const materialLine = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Garden mix"))
  const wasteLine = payload.quote.xeroLineItemsArray.find((item) => item.Description === "Hardfill / spoil removal")

  assert.equal(labourLine?.AccountCode, "700")
  assert.equal(plantLine?.AccountCode, "710")
  assert.equal(materialLine?.AccountCode, "720")
  assert.equal(wasteLine?.AccountCode, "730")
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes("No export mapping set")), false)
})

test("maps Xero inventory account and tax metadata without inventing codes", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: [
        {
          item_code: "XERO-GMIX",
          source_system: "Xero",
          item_name: "Garden mix",
          item_type: "material",
          quantity: "6 bags",
          unit: "bags",
          final_rate_used: "12.50",
          total: "75.00",
          account_code: "210",
          tax_code: "GST on Income",
        },
      ],
      quote_options: [],
      plant_calculator_results: [],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const gardenMix = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Garden mix"))
  assert.equal(gardenMix?.ItemCode, "XERO-GMIX")
  assert.equal(gardenMix?.AccountCode, "210")
  assert.equal(gardenMix?.TaxType, "OUTPUT2")
  assert.equal(gardenMix?.Quantity, 6)
  assert.equal(gardenMix?.UnitAmount, 12.5)
})

test("zero-rated tax metadata is not forced to OUTPUT2", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: [
        {
          item_code: "ZERO-RATED",
          source_system: "Xero",
          item_name: "Zero rated material",
          item_type: "material",
          description: "Garden mix",
          quantity: "1 bag",
          unit: "bag",
          final_rate_used: "10",
          total: "10",
          tax_type: "zero rated",
        },
      ],
      quote_options: [],
      plant_calculator_results: [],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const line = payload.quote.xeroLineItemsArray.find((item) => item.ItemCode === "ZERO-RATED")
  assert.equal(line?.TaxType, "ZERORATEDOUTPUT")
})

test("does not use item name as Xero ItemCode", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: [
        {
          item_code: "Landscaping Labour",
          item_name: "Landscaping Labour",
          item_type: "labour",
          quantity: "48 hours",
          unit: "hours",
          final_rate_used: "110",
          total: "5280",
        },
      ],
      quote_options: [],
      plant_calculator_results: [],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const labour = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Planting labour"))
  assert.equal(labour?.ItemCode, undefined)
  assert.equal(labour?.TaxType, "OUTPUT2")
})

test("numeric gst_rate zero is treated as ambiguous and defaults to OUTPUT2", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      line_items: [
        {
          item_code: "LAB-REAL",
          source_system: "Xero",
          item_name: "Labour",
          item_type: "labour",
          quantity: "1 hour",
          unit: "hour",
          final_rate_used: "100",
          total: "100",
          gst_rate: 0,
        },
      ],
      quote_options: [
        plantOption("plant-zero-gst", "Ficus Tuffi 25L", "", 10, 1000, "PLANT-REAL", {
          sourceSystem: "Xero",
          gstRate: 0,
        }),
      ],
      plant_calculator_results: [],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const labour = payload.quote.xeroLineItemsArray.find((item) => item.ItemCode === "LAB-REAL")
  const plant = payload.quote.xeroLineItemsArray.find((item) => item.ItemCode === "PLANT-REAL")
  assert.equal(labour?.TaxType, "OUTPUT2")
  assert.equal(plant?.TaxType, "OUTPUT2")
  assert.equal(plant?.AccountCode, "10115")
})

test("non-planting quotes use generic Xero renderer", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      job_type: "Electrical",
      quote_title: "Electrical Quote",
      plant_calculator_results: [],
      quote_options: [],
      line_items: [
        {
          item_code: "ELEC-LAB",
          source_system: "Xero",
          item_name: "Electrical Labour",
          item_type: "labour",
          quantity: "2 hours",
          unit: "hours",
          final_rate_used: "120",
          total: "240",
          account_code: "10010",
          tax_type: "OUTPUT2",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.ItemCode ?? "", item.AccountCode ?? "", item.TaxType]),
    [["Labour", 1, 240, "ELEC-LAB", "10010", "OUTPUT2"]],
  )
})

test("maintenance display labour labels do not change Xero account or tax mapping", () => {
  const payload = buildXeroQuotePayload(
    {
      ...sarahQuote,
      job_type: "maintenance",
      quote_title: "Garden Maintenance Quote",
      plant_calculator_results: [],
      quote_options: [],
      primary_quote: {
        quote_title: "Garden Maintenance",
        scope: ["Weeding", "Pruning", "Plant health checks"],
        notes: [],
      },
      line_items: [
        {
          item_code: "MAINT-LAB",
          source_system: "Xero",
          item_name: "Garden Labour",
          item_type: "labour",
          quantity: "4 hours",
          unit: "hours",
          final_rate_used: "90",
          total: "360",
          account_code: "876",
          tax_type: "OUTPUT2",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.ItemCode ?? "", item.AccountCode ?? "", item.TaxType]),
    [["Labour", 1, 360, "MAINT-LAB", "876", "OUTPUT2"]],
  )
})

test("single decking quote exports decking labour and materials from QuoteFacts", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Steve",
      site_address: "12 Oak Road",
      quote_title: "Decking Quote",
      job_type: "Decking",
      line_items: [],
      primary_quote: {
        quote_title: "Decking Quote",
        scope: ["Construct a 4m x 5m pine deck."],
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "900", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "901", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.AccountCode, item.TaxType]),
    [
      ["Decking labour / installation - Area 1: 4m x 5m (20m2), full build", 1, 0, "900", "OUTPUT2"],
      ["Decking materials - Area 1: 4m x 5m (20m2), full build", 20, 0, "901", "OUTPUT2"],
    ],
  )
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes("No export mapping set")), false)
})

test("multiple decking areas export total area and waste when present", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Steve",
      site_address: "12 Oak Road",
      quote_title: "Decking Quote",
      job_type: "Decking",
      line_items: [],
      primary_quote: {
        quote_title: "Decking Quote",
        scope: [
          "Build a 4m x 5m pine deck.",
          "Also replace decking boards on a 3m x 4m section where posts already exist.",
          "Remove old decking waste.",
        ],
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "910", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "911", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "waste", account_code: "912", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  assert.deepEqual(
    payload.quote.lineItems.map((item) => [item.description, item.quantity, item.unitAmount]),
    [
      ["Decking labour / installation - 32m2", 1, undefined],
      ["Decking materials - 32m2", 32, undefined],
      ["Decking waste/removal - Remove old decking waste", 1, undefined],
    ],
  )
  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.AccountCode, item.TaxType]),
    [
      [
        "Decking labour / installation - Area 1: 4m x 5m (20m2), full build; Area 2: 3m x 4m (12m2), boards only",
        1,
        0,
        "910",
        "OUTPUT2",
      ],
      [
        "Decking materials - Area 1: 4m x 5m (20m2), full build; Area 2: 3m x 4m (12m2), boards only",
        32,
        0,
        "911",
        "OUTPUT2",
      ],
      ["Decking waste/removal - Remove old decking waste", 1, 0, "912", "OUTPUT2"],
    ],
  )
})

test("decking waste export line is omitted when no waste fact exists", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Steve",
      site_address: "12 Oak Road",
      quote_title: "Decking Quote",
      job_type: "Decking",
      line_items: [],
      primary_quote: {
        quote_title: "Decking Quote",
        scope: ["Construct a 4m x 5m pine deck."],
        notes: [],
      },
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.xeroLineItemsArray.some((item) => /waste|removal/i.test(item.Description)), false)
})

test("single retaining wall exports retaining labour and materials from QuoteFacts", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Renee",
      site_address: "22 Bank Street",
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      line_items: [],
      primary_quote: {
        quote_title: "Retaining Quote",
        scope: ["Build a 10m long retaining wall, 600mm high."],
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "920", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "921", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.AccountCode, item.TaxType]),
    [
      ["Retaining labour / installation - Wall 1: 10m x 0.6m (6m2), new/build", 1, 0, "920", "OUTPUT2"],
      ["Retaining materials - Wall 1: 10m x 0.6m (6m2), new/build", 6, 0, "921", "OUTPUT2"],
    ],
  )
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes("No export mapping set")), false)
})

test("multiple retaining walls export total area and drainage when mentioned", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Renee",
      site_address: "22 Bank Street",
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      line_items: [],
      primary_quote: {
        quote_title: "Retaining Quote",
        scope: ["One wall 8m long and 800mm high, second wall 4m long and 600mm high.", "Include drainage."],
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "930", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "931", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  assert.deepEqual(
    payload.quote.lineItems.map((item) => [item.description, item.quantity, item.unitAmount]),
    [
      ["Retaining labour / installation - 8.8m2", 1, undefined],
      ["Retaining materials - 8.8m2", 8.8, undefined],
      ["Retaining drainage materials", 1, undefined],
    ],
  )
  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.AccountCode, item.TaxType]),
    [
      [
        "Retaining labour / installation - Wall 1: 8m x 0.8m (6.4m2), new/build; Wall 2: 4m x 0.6m (2.4m2), new/build",
        1,
        0,
        "930",
        "OUTPUT2",
      ],
      [
        "Retaining materials - Wall 1: 8m x 0.8m (6.4m2), new/build; Wall 2: 4m x 0.6m (2.4m2), new/build",
        8.8,
        0,
        "931",
        "OUTPUT2",
      ],
      ["Retaining drainage materials", 1, 0, "931", "OUTPUT2"],
    ],
  )
  assert.equal(payload.quote.xeroLineItemsArray.some((item) => /waste|removal/i.test(item.Description)), false)
})

test("retaining drainage and waste export lines are omitted when not mentioned", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Renee",
      site_address: "22 Bank Street",
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      line_items: [],
      primary_quote: {
        quote_title: "Retaining Quote",
        scope: ["Build a 10m long retaining wall, 600mm high."],
        notes: [],
      },
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.xeroLineItemsArray.some((item) => /drainage/i.test(item.Description)), false)
  assert.equal(payload.quote.xeroLineItemsArray.some((item) => /waste|removal/i.test(item.Description)), false)
})

test("retaining waste exports only when waste removal is mentioned", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Renee",
      site_address: "22 Bank Street",
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      line_items: [],
      primary_quote: {
        quote_title: "Retaining Quote",
        scope: ["Replace the old timber retaining wall, 6m long and 700mm high.", "Remove old wall waste."],
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "940", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "941", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "waste", account_code: "942", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  assert.deepEqual(
    payload.quote.xeroLineItemsArray.map((item) => [item.Description, item.Quantity, item.UnitAmount, item.AccountCode, item.TaxType]),
    [
      ["Retaining labour / installation - Wall 1: 6m x 0.7m (4.2m2), replacement", 1, 0, "940", "OUTPUT2"],
      ["Retaining materials - Wall 1: 6m x 0.7m (4.2m2), replacement", 4.2, 0, "941", "OUTPUT2"],
      ["Retaining waste/removal - Remove old wall waste", 1, 0, "942", "OUTPUT2"],
    ],
  )
})

test("retaining export account codes come from mappings, not hardcoded retaining logic", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Renee",
      site_address: "22 Bank Street",
      quote_title: "Retaining Quote",
      job_type: "Retaining",
      line_items: [],
      primary_quote: {
        quote_title: "Retaining Quote",
        scope: ["Build a 10m long retaining wall, 600mm high.", "Include drainage.", "Remove retaining waste."],
        notes: [],
      },
    },
    {
      now: new Date("2026-06-07T00:00:00.000Z"),
      exportMappings: [
        { category: "labour", account_code: "950", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "materials", account_code: "951", tax_type: "OUTPUT2", is_user_confirmed: true },
        { category: "waste", account_code: "952", tax_type: "OUTPUT2", is_user_confirmed: true },
      ],
    },
  )

  const labour = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Retaining labour"))
  const material = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Retaining materials"))
  const drainage = payload.quote.xeroLineItemsArray.find((item) => item.Description === "Retaining drainage materials")
  const waste = payload.quote.xeroLineItemsArray.find((item) => item.Description.startsWith("Retaining waste/removal"))

  assert.equal(labour?.AccountCode, "950")
  assert.equal(material?.AccountCode, "951")
  assert.equal(drainage?.AccountCode, "951")
  assert.equal(waste?.AccountCode, "952")
  assert.equal(payload.quote.exportWarnings.some((warning) => warning.includes("No export mapping set")), false)
})

// ---------------------------------------------------------------------------
// Task 1: Garden Tidy Xero export tests
// ---------------------------------------------------------------------------

test("garden tidy with spoken price exports as One-Off Garden Tidy not Ongoing Garden Maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Sarah",
      site_address: "44 Amy Street",
      quote_title: "One-Off Garden Tidy",
      job_type: "garden_tidy",
      line_items: [],
      customer_scope: [
        "Cut back shrubs",
        "Weed garden beds",
        "Remove self-seeded plants",
      ],
      primary_quote: {
        quote_title: "One-Off Garden Tidy",
        scope: ["Cut back shrubs", "Weed garden beds", "Remove self-seeded plants"],
        notes: ["Greenwaste removed from site"],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 1440,
          currency: "NZD",
          cadence: null,
          inclusions: ["greenwaste removal"],
          source_text: "Price $1,440 including greenwaste removal.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems.length, 1)
  assert.equal(payload.quote.lineItems[0].description, "One-Off Garden Tidy")
  assert.equal(payload.quote.lineItems[0].unitAmount, 1440)
  // xeroLineItemsArray.Description uses xeroDescription (full multiline text) when present
  assert.ok(payload.quote.xeroLineItemsArray[0].Description.startsWith("One-Off Garden Tidy"))
  assert.equal(payload.quote.xeroLineItemsArray[0].UnitAmount, 1440)
  assert.equal(payload.quote.xeroLineItemsArray[0].Quantity, 1)
  assert.equal(/ongoing\s+garden\s+maintenance/i.test(JSON.stringify(payload.quote.lineItems)), false)
})

test("garden tidy xeroDescription includes scope items", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Sarah",
      site_address: "44 Amy Street",
      quote_title: "One-Off Garden Tidy",
      job_type: "garden_tidy",
      line_items: [],
      customer_scope: ["Cut back shrubs", "Weed garden beds"],
      primary_quote: {
        quote_title: "One-Off Garden Tidy",
        scope: ["Cut back shrubs", "Weed garden beds"],
        notes: ["Greenwaste removed from site"],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 800,
          currency: "NZD",
          cadence: null,
          inclusions: ["greenwaste removal"],
          source_text: "Price $800 including greenwaste removal.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const xeroDesc = payload.quote.xeroLineItemsArray[0]?.Description ?? ""
  assert.ok(xeroDesc.startsWith("One-Off Garden Tidy"), xeroDesc)
  assert.ok(/shrubs|weed/i.test(xeroDesc), xeroDesc)
  assert.ok(/greenwaste removal/i.test(xeroDesc), xeroDesc)
  assert.ok(/removed from site/i.test(xeroDesc), xeroDesc)
})

test("garden tidy template with trade maintenance still exports as garden tidy not maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Sarah",
      site_address: "44 Amy Street",
      quote_title: "One-Off Garden Tidy",
      job_type: "garden_tidy",
      line_items: [],
      primary_quote: {
        quote_title: "One-Off Garden Tidy",
        scope: ["Weed garden beds"],
        notes: [],
      },
      selected_template: {
        name: "One-Off Garden Tidy",
        template_name: "One-Off Garden Tidy",
        category: "garden_tidy",
        job_type: "garden_tidy",
        trade: "maintenance",
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 900,
          currency: "NZD",
          cadence: null,
          inclusions: [],
          source_text: "Price $900.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "One-Off Garden Tidy")
  assert.equal(/ongoing\s+garden\s+maintenance/i.test(JSON.stringify(payload.quote.lineItems)), false)
})

test("garden tidy without spoken price falls through to generic renderer", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Sarah",
      site_address: "44 Amy Street",
      quote_title: "One-Off Garden Tidy",
      job_type: "garden_tidy",
      line_items: [
        {
          item_name: "Garden Labour",
          item_type: "labour",
          total: "1440.00",
          final_rate_used: "80",
          quantity: "18",
        },
      ],
      primary_quote: {
        quote_title: "One-Off Garden Tidy",
        scope: [],
        notes: [],
      },
      pricing_facts: [],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  // Falls through to generic — description is "Labour", not "One-Off Garden Tidy"
  assert.equal(payload.quote.lineItems[0].description, "Labour")
})

// ---------------------------------------------------------------------------
// Task 2: Paving Xero export tests
// ---------------------------------------------------------------------------

function pavingOption(
  id: string,
  areaLabel: string,
  labourHours: number,
  labourRate: number,
  materialTotal: number,
  warnings: string[] = [],
): QuoteOption {
  const labourTotal = labourHours * labourRate
  const paverTotal = materialTotal * 0.7
  const basecourseTotal = materialTotal * 0.3
  return {
    id,
    label: areaLabel,
    title: areaLabel,
    category: "material",
    source: "trade_calculator",
    areaLabel,
    lineItems: [
      {
        itemName: "Paving labour",
        quantity: labourHours,
        unit: "hours",
        unitPrice: labourRate,
        total: labourTotal,
      },
      {
        itemName: "450x450 concrete pavers",
        quantity: 115,
        unit: "each",
        unitPrice: paverTotal / 115,
        total: paverTotal,
      },
      {
        itemName: "Base course aggregate",
        quantity: 0.315,
        unit: "m3",
        unitPrice: basecourseTotal / 0.315,
        total: basecourseTotal,
      },
    ],
    subtotal: labourTotal + materialTotal,
    warnings,
  }
}

function unpricedPavingOption(id: string, areaLabel: string): QuoteOption {
  return {
    id,
    label: areaLabel,
    title: areaLabel,
    category: "material",
    source: "trade_calculator",
    areaLabel,
    lineItems: [
      { itemName: "Paving labour", quantity: 7.88, unit: "hours", unitPrice: 0, total: 0 },
      { itemName: "Base course aggregate", quantity: 0.315, unit: "m3", unitPrice: 0, total: 0 },
    ],
    subtotal: 0,
    warnings: ["Base course aggregate (m3) — not found in item library", "Paving labour (hours) — not found in item library"],
  }
}

test("paving with priced quote_options exports labour and materials lines", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Lisa",
      site_address: "5 Garden Lane",
      quote_title: "Paving Quote",
      job_type: "paving",
      line_items: [],
      primary_quote: {
        quote_title: "Paving Quote",
        scope: ["Replace old pavers in courtyard area"],
        notes: [],
      },
      quote_options: [pavingOption("paving-bill-1-paving-area-1", "Paving area 1", 7.88, 85, 650)],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const labour = payload.quote.xeroLineItemsArray.find((item) => /paving labour/i.test(item.Description))
  const materials = payload.quote.xeroLineItemsArray.find((item) => /paving materials/i.test(item.Description))

  assert.ok(labour, "Expected a paving labour line item")
  assert.ok(materials, "Expected a paving materials line item")
  assert.ok((labour?.UnitAmount ?? 0) > 0, "Labour unit amount should be priced")
  assert.ok((materials?.UnitAmount ?? 0) > 0, "Materials unit amount should be priced")
  assert.equal(/ongoing\s+garden\s+maintenance|labour^/i.test(labour?.Description ?? ""), false)
})

test("paving materials xeroDescription lists individual material names", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Lisa",
      site_address: "5 Garden Lane",
      quote_title: "Paving Quote",
      job_type: "paving",
      line_items: [],
      primary_quote: { scope: [], notes: [] },
      quote_options: [pavingOption("paving-bill-1-paving-area-1", "Paving area 1", 7.88, 85, 650)],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  const materials = payload.quote.xeroLineItemsArray.find((item) => /paving materials/i.test(item.Description))
  assert.ok(materials)
  // xeroDescription includes individual material names
  assert.ok(/pavers|aggregate|basecourse/i.test(materials?.Description ?? ""), materials?.Description)
})

test("paving with unpriced options emits review-required placeholder not empty export", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Lisa",
      site_address: "5 Garden Lane",
      quote_title: "Paving Quote",
      job_type: "paving",
      line_items: [],
      primary_quote: { scope: [], notes: [] },
      quote_options: [unpricedPavingOption("paving-bill-1-paving-area-1", "Paving area 1")],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.ok(payload.quote.lineItems.length > 0, "Export should not be empty for unpriced paving")
  // lineItems.description uses the short description; xeroLineItemsArray.Description uses xeroDescription
  const reviewLine = payload.quote.lineItems.find((item) => /review required/i.test(item.description ?? ""))
  assert.ok(reviewLine, "Expected a review-required placeholder line")
})

test("paving without quote_options falls through to generic renderer", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Lisa",
      site_address: "5 Garden Lane",
      quote_title: "Paving Quote",
      job_type: "paving",
      line_items: [
        {
          item_name: "Paving Labour",
          item_type: "labour",
          total: "670.00",
          final_rate_used: "85",
          quantity: "7.88",
        },
      ],
      primary_quote: { scope: [], notes: [] },
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "Labour")
})

test("non-paving quote_options do not trigger paving renderer", () => {
  const payload = buildXeroQuotePayload(sarahQuote, { now: new Date("2026-06-07T00:00:00.000Z") })

  // sarahQuote is a planting quote — should use planting renderer, not paving
  assert.equal(
    payload.quote.xeroLineItemsArray.some((item) => /paving/i.test(item.Description)),
    false,
  )
})

// ---------------------------------------------------------------------------
// Task 3: Maintenance cadence Xero export tests
// ---------------------------------------------------------------------------

test("monthly maintenance Xero export description remains Ongoing Garden Maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Stella",
      site_address: "6 Tarawera Terrace",
      quote_title: "Monthly Maintenance",
      job_type: "maintenance",
      line_items: [],
      primary_quote: {
        quote_title: "Monthly Maintenance",
        scope: ["Monthly maintenance visits"],
        notes: [],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 405,
          currency: "NZD",
          cadence: "per_visit",
          inclusions: ["greenwaste removal"],
          source_text: "Price per visit $405 including greenwaste removal.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "Ongoing Garden Maintenance")
  assert.ok(payload.quote.xeroLineItemsArray[0].Description.startsWith("Ongoing Garden Maintenance"))
})

test("2-monthly maintenance Xero export description uses 2-Monthly Garden Maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Sarah",
      site_address: "12 Hill Road",
      quote_title: "2-Monthly Maintenance",
      job_type: "maintenance",
      line_items: [],
      primary_quote: {
        quote_title: "2-Monthly Maintenance",
        scope: ["2-monthly maintenance visits"],
        notes: [],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 240,
          currency: "NZD",
          cadence: "per_visit",
          inclusions: ["greenwaste removal"],
          source_text: "Price per visit $240 including greenwaste removal.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "2-Monthly Garden Maintenance")
  assert.ok(payload.quote.xeroLineItemsArray[0].Description.startsWith("2-Monthly Garden Maintenance"))
  assert.equal(payload.quote.lineItems[0].unitAmount, 240)
})

test("3-monthly maintenance Xero export description uses 3-Monthly Garden Maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Jane",
      site_address: "8 Pine Street",
      quote_title: "3-Monthly Maintenance",
      job_type: "maintenance",
      line_items: [],
      primary_quote: {
        quote_title: "3-Monthly Maintenance",
        scope: ["3-monthly maintenance visits"],
        notes: [],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 360,
          currency: "NZD",
          cadence: "per_visit",
          inclusions: [],
          source_text: "Price per visit $360.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "3-Monthly Garden Maintenance")
  assert.equal(payload.quote.lineItems[0].unitAmount, 360)
})

test("6-weekly maintenance Xero export description uses 6-Weekly Garden Maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Chris",
      site_address: "7 Beach Road",
      quote_title: "6-Weekly Maintenance",
      job_type: "maintenance",
      line_items: [],
      primary_quote: {
        quote_title: "6-Weekly Maintenance",
        scope: ["6-weekly maintenance visits"],
        notes: [],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 180,
          currency: "NZD",
          cadence: "per_visit",
          inclusions: ["greenwaste removal"],
          source_text: "Price per visit $180 including greenwaste removal.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "6-Weekly Garden Maintenance")
  assert.ok(payload.quote.xeroLineItemsArray[0].Description.startsWith("6-Weekly Garden Maintenance"))
  assert.equal(payload.quote.lineItems[0].unitAmount, 180)
})

test("4-monthly maintenance Xero export description uses 4-Monthly Garden Maintenance", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Pat",
      site_address: "22 River Lane",
      quote_title: "4-Monthly Maintenance",
      job_type: "maintenance",
      line_items: [],
      primary_quote: {
        quote_title: "4-Monthly Maintenance",
        scope: ["4-monthly maintenance visits"],
        notes: [],
      },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 480,
          currency: "NZD",
          cadence: "per_visit",
          inclusions: [],
          source_text: "Price per visit $480.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  assert.equal(payload.quote.lineItems[0].description, "4-Monthly Garden Maintenance")
  assert.equal(payload.quote.lineItems[0].unitAmount, 480)
})

test("2-monthly Xero description preserves per-visit price not a monthly-equivalent calculation", () => {
  const payload = buildXeroQuotePayload(
    {
      client_name: "Sarah",
      site_address: "12 Hill Road",
      quote_title: "2-Monthly Maintenance",
      job_type: "maintenance",
      line_items: [],
      primary_quote: { quote_title: "2-Monthly Maintenance", scope: [], notes: [] },
      pricing_facts: [
        {
          id: "price-1",
          type: "fixed_price",
          amount: 240,
          currency: "NZD",
          cadence: "per_visit",
          inclusions: [],
          source_text: "Price per visit $240.",
          confidence: "high",
        },
      ],
    },
    { now: new Date("2026-06-07T00:00:00.000Z") },
  )

  // Must use 240 (spoken per-visit price). Must NOT invent 120 (half of 240 as a monthly equivalent).
  assert.equal(payload.quote.lineItems[0].unitAmount, 240)
  assert.equal(payload.quote.lineItems[0].unitAmount, 240)
  assert.notEqual(payload.quote.lineItems[0].unitAmount, 120)
})
