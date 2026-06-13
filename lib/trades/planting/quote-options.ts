import type { PlantCalculatorResult, PlantingOptionGroup } from "../../calculators/planting"
import type { QuoteOption } from "../../quote-options"

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function plantOptionWarnings(option: PlantingOptionGroup) {
  return option.warnings.map((warning) => warning.message)
}

function cleanOptionTitle(value: string) {
  return value
    .replace(/\b(?:hedge|screen)\s+plants?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function titleWithArea(areaLabel: string | undefined, title: string) {
  return areaLabel ? `${areaLabel} - ${title}` : title
}

export function quoteOptionsFromPlantCalculatorResults(results: PlantCalculatorResult[] | undefined): QuoteOption[] {
  if (!Array.isArray(results) || results.length === 0) return []

  return results.flatMap((result, resultIndex) =>
    result.option_groups.map((option, optionIndex): QuoteOption => {
      const sourceOption = result.options[optionIndex]
      const quantity = option.plant_count
      const unitPrice = option.unit_sell_price
      const total = option.plant_total
      const hasPricedLine =
        typeof quantity === "number" &&
        Number.isFinite(quantity) &&
        typeof unitPrice === "number" &&
        Number.isFinite(unitPrice) &&
        typeof total === "number" &&
        Number.isFinite(total)
      const title = cleanOptionTitle(
        sourceOption?.item_name ||
          option.option_name ||
          [option.plant_name, option.plant_size || option.pot_size].filter(Boolean).join(" "),
      )
      const titleWithAreaLabel = titleWithArea(result.area_label ?? option.area_label, title)
      const warnings = plantOptionWarnings(option)

      return {
        id: `plant-calculator-${resultIndex + 1}-${slug(option.option_label || String(optionIndex + 1))}`,
        label: option.option_label,
        title: titleWithAreaLabel,
        description:
          hasPricedLine && quantity !== null
            ? `${quantity} plants x $${unitPrice.toFixed(2)} = $${total.toFixed(2)}`
            : undefined,
        category: "planting",
        source: "plant_calculator",
        areaLabel: result.area_label ?? option.area_label,
        lineItems: hasPricedLine
          ? [
              {
                itemName: titleWithAreaLabel,
                itemCode: sourceOption?.item_code,
                sourceSystem: sourceOption?.source_system,
                accountCode: sourceOption?.account_code,
                salesAccountCode: sourceOption?.sales_account_code,
                taxCode: sourceOption?.tax_code,
                taxType: sourceOption?.tax_type,
                gstRate: sourceOption?.gst_rate,
                quantity,
                unit: "each",
                unitPrice,
                total,
                supplier: option.supplier,
                stockStatus: option.stock_status,
                sourceItemId: sourceOption?.id || sourceOption?.item_code,
              },
            ]
          : [],
        subtotal: hasPricedLine ? total : 0,
        notes: [
          result.area_label ? `Area: ${result.area_label}` : "",
          result.plant_name ? `Plant: ${result.plant_name}` : "",
          result.spacing_mm ? `Spacing: ${result.spacing_mm}mm` : "",
          result.spacing_source ? `Spacing source: ${result.spacing_source}` : "",
          result.formula ? `Plant count formula: ${result.formula}` : "",
        ].filter(Boolean),
        warnings,
      }
    }),
  )
}
