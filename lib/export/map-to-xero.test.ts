import assert from "node:assert/strict"
import test from "node:test"

import { buildCustomerQuotePreview } from "../customer-quote-preview"
import {
  exportableLineToXeroExportLine,
  exportableLinesToXeroExportLines,
  mapExportableLineToXero,
} from "./map-to-xero"
import type { ExportableQuoteLine } from "./exportable-line"
import { parseLabourAllowanceText, resolveLabourExportPrice, structuredAllowanceLabourPrice } from "./labour-line-builder"
import { buildPlantingExportableLines } from "./planting-export-lines"
import { buildPavingExportableLines } from "./paving-export-lines"
import { buildDeckingExportableLines } from "./decking-export-lines"
import { buildRetainingExportableLines } from "./retaining-export-lines"
import { buildGardenTidyExportableLines } from "./garden-tidy-export-lines"

test("parseLabourAllowanceText parses two people for a full day", () => {
  const parsed = parseLabourAllowanceText("Two people for a full day")
  assert.equal(parsed?.people, 2)
  assert.equal(parsed?.days, 1)
  assert.equal(parsed?.hours, 16)
})

test("parseLabourAllowanceText parses two people for approximately one and a quarter days", () => {
  const parsed = parseLabourAllowanceText("Two people for approximately one and a quarter days")
  assert.equal(parsed?.people, 2)
  assert.equal(parsed?.days, 1.25)
  assert.equal(parsed?.hours, 20)
})

test("parseLabourAllowanceText parses two people one and a quarter days", () => {
  const parsed = parseLabourAllowanceText("two people one and a quarter days")
  assert.equal(parsed?.people, 2)
  assert.equal(parsed?.days, 1.25)
  assert.equal(parsed?.hours, 20)
})

test("structuredAllowanceLabourPrice uses allowance hours and hourly KB rate", () => {
  const quote = {
    labour_allowance: "Two people for a full day",
    primary_quote: { scope: [], notes: [] },
    line_items: [
      {
        item_name: "Landscaping Labour",
        item_type: "labour",
        unit: "hours",
        final_rate_used: "80",
        quantity: "2",
        total: "160.00",
      },
    ],
    pricing_facts: [],
  }

  const structured = structuredAllowanceLabourPrice(quote)
  assert.equal(structured?.amount, 1280)
  assert.equal(structured?.pricingSource, "structured_allowance")
})

test("resolveLabourExportPrice prefers spoken fixed price over structured allowance", () => {
  const quote = {
    labour_allowance: "Two people for a full day",
    primary_quote: { scope: [], notes: [] },
    line_items: [
      {
        item_name: "Landscaping Labour",
        item_type: "labour",
        unit: "hours",
        final_rate_used: "80",
        quantity: "16",
        total: "1280.00",
      },
    ],
    pricing_facts: [
      {
        id: "p1",
        type: "fixed_price" as const,
        amount: 450,
        currency: "NZD" as const,
        inclusions: [],
        source_text: "Price $450",
        confidence: "high" as const,
      },
    ],
  }

  const resolved = resolveLabourExportPrice(quote)
  assert.equal(resolved.amount, 450)
  assert.equal(resolved.pricingSource, "spoken_fixed")
})

test("exportableLineToXeroExportLine preserves account and tax metadata", () => {
  const line: ExportableQuoteLine = {
    lineId: "waste-1",
    role: "waste",
    category: "waste",
    label: "Greenwaste",
    xeroDescription: "Greenwaste (tip fee, off loading time and vehicle servicing)",
    quantity: 1,
    unitAmount: 132.5,
    accountCode: "10011",
    taxType: "OUTPUT2",
    pricingSource: "line_item_total",
    unitAmountWasDefaulted: false,
  }

  const xeroLine = exportableLineToXeroExportLine(line)
  assert.equal(xeroLine.xeroAccountCode, "10011")
  assert.equal(xeroLine.xeroTaxType, "OUTPUT2")
  assert.equal(xeroLine.unitAmount, 132.5)
})

test("mapExportableLineToXero applies user export mapping when line metadata missing", () => {
  const line: ExportableQuoteLine = {
    lineId: "labour-1",
    role: "labour",
    category: "labour",
    label: "One-Off Garden Tidy",
    quantity: 1,
    unitAmount: 450,
    pricingSource: "spoken_fixed",
  }

  const mapped = mapExportableLineToXero(line, [
    {
      category: "labour",
      account_code: "4100",
      tax_type: "OUTPUT2",
      export_enabled: true,
      item_code_policy: "confirmed_inventory_only",
      is_user_confirmed: true,
      source: "user",
    },
  ])

  assert.equal(mapped.xeroExportLine.xeroAccountCode, "4100")
  assert.equal(mapped.xeroExportLine.xeroTaxType, "OUTPUT2")
  assert.equal(mapped.exportEnabled, true)
})

test("planting exportable lines preserve Sarah fixture labour, plants, and material metadata", () => {
  const quote = {
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
    ],
    quote_options: [
      {
        id: "lower-25l",
        label: "Option",
        title: "Lower planting area - Ficus Tuffi 25L",
        category: "planting" as const,
        source: "plant_calculator" as const,
        areaLabel: "Lower planting area",
        lineItems: [
          {
            itemName: "Lower planting area - Ficus Tuffi 25L",
            itemCode: "PLANT-060",
            accountCode: "4400",
            taxType: "OUTPUT2",
            quantity: 15,
            unit: "each",
            unitPrice: 118.75,
            total: 1781.25,
          },
        ],
        subtotal: 1781.25,
      },
      {
        id: "upper-25l",
        label: "Option",
        title: "Upper planting area - Ficus Tuffi 25L",
        category: "planting" as const,
        source: "plant_calculator" as const,
        areaLabel: "Upper planting area",
        lineItems: [
          {
            itemName: "Upper planting area - Ficus Tuffi 25L",
            itemCode: "PLANT-060",
            accountCode: "4400",
            taxType: "OUTPUT2",
            quantity: 18,
            unit: "each",
            unitPrice: 118.75,
            total: 2137.5,
          },
        ],
        subtotal: 2137.5,
      },
    ],
    plant_calculator_results: [],
  }

  const preview = buildCustomerQuotePreview(quote)
  const lines = buildPlantingExportableLines(quote, preview)
  const xeroLines = exportableLinesToXeroExportLines(lines)

  assert.equal(lines.length, 3)
  assert.equal(lines[0]?.lineId, "planting-labour")
  assert.equal(lines[0]?.unitAmount, 5280)
  assert.equal(lines[0]?.accountCode, "4100")
  assert.equal(lines[1]?.lineId, "planting-plants-base")
  assert.equal(lines[1]?.xeroQuantity, 33)
  assert.equal(lines[1]?.accountCode, "4400")
  assert.equal(lines[2]?.lineId, "planting-garden-mix")

  assert.equal(xeroLines[0]?.unitAmount, 5280)
  assert.equal(xeroLines[0]?.xeroAccountCode, "4100")
  assert.equal(xeroLines[1]?.xeroAccountCode, "4400")
  assert.equal(xeroLines[1]?.xeroQuantity, 33)
})

test("paving exportable lines preserve priced quote_option labour and materials", () => {
  const quoteOptions = [
    {
      id: "paving-bill-1-paving-area-1",
      label: "Paving area 1",
      title: "Paving area 1",
      category: "material" as const,
      source: "trade_calculator" as const,
      areaLabel: "Paving area 1",
      lineItems: [
        {
          itemName: "Paving labour",
          quantity: 7.88,
          unit: "hours",
          unitPrice: 85,
          total: 669.8,
          accountCode: "5100",
          taxType: "OUTPUT2",
        },
        {
          itemName: "450x450 concrete pavers",
          quantity: 115,
          unit: "each",
          unitPrice: 3.95,
          total: 454.25,
          accountCode: "5200",
          taxType: "OUTPUT2",
        },
      ],
      subtotal: 1124.05,
      warnings: [],
    },
  ]

  const lines = buildPavingExportableLines(quoteOptions)
  const xeroLines = exportableLinesToXeroExportLines(lines)

  assert.equal(lines.length, 2)
  assert.equal(lines[0]?.lineId, "paving-paving-area-1-labour")
  assert.equal(lines[0]?.quantity, 7.88)
  assert.equal(lines[0]?.accountCode, "5100")
  assert.equal(lines[1]?.lineId, "paving-paving-area-1-materials")
  assert.equal(lines[1]?.unitAmount, 454.25)
  assert.equal(lines[1]?.accountCode, "5200")
  assert.ok((xeroLines[0]?.unitAmount ?? 0) > 0)
  assert.ok((xeroLines[1]?.unitAmount ?? 0) > 0)
})

test("decking exportable lines prefer priced quote_options over QuoteFacts stubs", () => {
  const quoteOptions = [
    {
      id: "decking-bill-1-main-deck",
      label: "Main deck",
      title: "Main deck",
      category: "material" as const,
      source: "trade_calculator" as const,
      areaLabel: "Main deck",
      lineItems: [
        {
          itemName: "90x19 Kwila Decking",
          itemCode: "KWILA-DECK-M2",
          quantity: 20,
          unit: "m2",
          unitPrice: 6.8,
          total: 136,
          accountCode: "310",
          taxType: "OUTPUT2",
        },
      ],
      subtotal: 136,
      warnings: [],
    },
  ]

  const lines = buildDeckingExportableLines(quoteOptions, [])
  assert.equal(lines.length, 1)
  assert.equal(lines[0]?.lineId, "decking-main-deck-materials")
  assert.equal(lines[0]?.unitAmount, 136)
  assert.equal(lines[0]?.accountCode, "310")
})

test("retaining exportable lines preserve priced labour and materials from quote_options", () => {
  const quoteOptions = [
    {
      id: "retaining-bill-1-back-wall",
      label: "Back wall",
      title: "Back wall",
      category: "material" as const,
      source: "trade_calculator" as const,
      areaLabel: "Back wall",
      lineItems: [
        {
          itemName: "Retaining wall timber",
          itemCode: "RET-TIMBER-M2",
          quantity: 10,
          unit: "m2",
          unitPrice: 65,
          total: 650,
          accountCode: "310",
          taxType: "OUTPUT2",
        },
        {
          itemName: "Retaining wall labour",
          itemCode: "RET-LABOUR-M2",
          quantity: 10,
          unit: "m2",
          unitPrice: 95,
          total: 950,
          accountCode: "200",
          taxType: "OUTPUT2",
        },
      ],
      subtotal: 1600,
      warnings: [],
    },
  ]

  const lines = buildRetainingExportableLines(quoteOptions, [])
  const xeroLines = exportableLinesToXeroExportLines(lines)

  assert.equal(lines.length, 2)
  assert.equal(lines[0]?.lineId, "retaining-back-wall-labour")
  assert.equal(lines[0]?.unitAmount, 95)
  assert.equal(lines[0]?.accountCode, "200")
  assert.equal(lines[1]?.lineId, "retaining-back-wall-materials")
  assert.equal(lines[1]?.unitAmount, 650)
  assert.ok((xeroLines[0]?.unitAmount ?? 0) > 0)
  assert.ok((xeroLines[1]?.unitAmount ?? 0) > 0)
})

test("structuredAllowanceLabourPrice returns allowanceWorkings for two people one and a quarter days", () => {
  // 2 people × 1.25 days × 8 hrs/day = 20 hrs × $80/hr = $1,600
  const quote = {
    labour_allowance: "Two people for approximately one and a quarter days",
    primary_quote: { scope: [], notes: [] },
    line_items: [
      {
        item_name: "Landscaping Labour",
        item_type: "labour",
        unit: "hours",
        final_rate_used: "80",
        quantity: "2",
        total: "160.00",
      },
    ],
    pricing_facts: [],
  }

  const structured = structuredAllowanceLabourPrice(quote)
  assert.ok(structured !== null, "expected structured price to be resolved")
  assert.equal(structured?.pricingSource, "structured_allowance")
  assert.equal(structured?.amount, 1600)

  const w = structured?.allowanceWorkings
  assert.ok(w !== undefined, "expected allowanceWorkings to be present")
  assert.equal(w?.people, 2)
  assert.equal(w?.days, 1.25)
  assert.equal(w?.hoursPerPerson, 8)
  assert.equal(w?.totalHours, 20)
  assert.equal(w?.rate, 80)
  assert.equal(w?.rateUnit, "hours")
  assert.ok(w?.sourceText.includes("one and a quarter"), "sourceText should include allowance description")
})

test("garden tidy exportable labour line carries labourWorkings when structured allowance is used", () => {
  // 2 people × 1.25 days × 8 hrs/day = 20 hrs × $80/hr = $1,600
  const quote = {
    client_name: "Test",
    site_address: "Test Address",
    quote_title: "One-Off Garden Tidy",
    job_type: "one_off_tidy",
    customer_scope: ["Prune and shape hedges", "General tidy"],
    labour_allowance: "Two people for approximately one and a quarter days",
    primary_quote: { scope: [], notes: [] },
    line_items: [
      {
        item_name: "Landscaping Labour",
        item_type: "labour",
        unit: "hours",
        final_rate_used: "80",
        quantity: "2",
        total: "160.00",
      },
    ],
    pricing_facts: [],
    greenwaste: "",
  }

  const lines = buildGardenTidyExportableLines(quote)
  const labourLine = lines.find((l) => l.role === "labour")
  assert.ok(labourLine !== undefined, "expected a labour exportable line")
  assert.ok(labourLine?.labourWorkings !== undefined, "expected labourWorkings on labour exportable line")
  assert.equal(labourLine?.labourWorkings?.people, 2)
  assert.equal(labourLine?.labourWorkings?.days, 1.25)
  assert.equal(labourLine?.labourWorkings?.totalHours, 20)
  assert.equal(labourLine?.labourWorkings?.rate, 80)
  assert.equal(labourLine?.unitAmount, 1600)
})
