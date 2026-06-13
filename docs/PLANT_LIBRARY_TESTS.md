# Plant Library and Planting Calculator Tests

This document is the dedicated regression suite for Plant Library matching and the deterministic Planting Calculator.

The governing rule is:

AI extracts planting requests. The Plant Library provides plant options, spacing, prices, supplier, and stock. The Planting Calculator performs calculations. Users review the result.

## Implemented Behaviour

### Plant Matching

#### Test: Exact Plant Name

Input: `Ficus Tuffi`

Expected result:

- Matches Ficus Tuffi Plant Library records.
- Match confidence is high.
- Multiple size options are returned when multiple records share the same plant name.

#### Test: Alias Match

Input: `Ficus Tuffy`

Expected result:

- Matches `Ficus Tuffi` using aliases or fuzzy spelling.
- Confidence should remain high when the alias is explicit.

#### Test: Plant Product Exclusion

Input: `Plant 24 Griselinia` with `Plant Soap` also in Knowledge Base.

Expected result:

- `Plant Soap` is not returned as a plant option.
- Plant-care products remain available as product/material/chemical items outside Plant Calculator options.

### Spacing Lookup

#### Test: Library Spacing

Input: `11m Ficus Tuffi hedge`

Plant Library: Ficus Tuffi spacing `800mm`.

Expected result:

- Spacing source: `plant_library`.
- Plant count: `ceil(11 / 0.8) + 1 = 15`.

#### Test: Spoken Spacing Override

Input: `11.5m Ficus Tuffi hedge at 600mm spacing`

Expected result:

- Spacing source: `spoken`.
- Plant Library spacing is ignored for calculation.
- Plant count: `ceil(11.5 / 0.6) + 1 = 21`.

### Quantity Overrides

#### Test: Spoken Quantity

Input: `Supply and install 24 Ficus Tuffi plants`

Expected result:

- Quantity source: `spoken_quantity`.
- Plant count: `24`.
- Spacing is optional/internal only.
- No missing spacing or missing length warning.

#### Test: Quantity And Spacing

Input: `Plant 24 Griselinia at 600mm centres`

Expected result:

- Plant count remains `24`.
- Spacing is preserved as useful operational context.
- Spacing does not drive count because quantity was supplied.

### Option Generation

#### Test: Ficus Tuffi Requested Options

Input:

```text
Install approximately 11.5 metres of Ficus Tuffi hedge.
Provide options for:
- 1.2 metre
- 14 litre
- 25 litre
```

Expected result:

- Requested sizes: `1.2m`, `14l`, `25l`.
- Plant count: `15` if spacing is `850mm`.
- Option A: Ficus Tuffi 1.2m.
- Option B: Ficus Tuffi 14L.
- Option C: Ficus Tuffi 25L.
- Each option includes unit sell price, total, supplier, and stock status if present.

#### Test: Size Matching Against Unstructured Fields

Input Plant Library records:

- `item_name = Ficus Tuffi 1.2m Hedge Plant`
- `item_name = Ficus Tuffi 14L PB`
- `item_name = Ficus Tuffi 25L Pot`

Expected result:

- Requested `1.2 metre` matches item names or aliases containing `1.2m`, `1.2 metre`, or `1200mm`.
- Requested `14 litre` matches `14L`, `14 litre`, `14 liter`, or `14 litre grade`.
- Requested `25 litre` matches `25L`, `25 litre`, `25 liter`, or `25 litre grade`.
- Structured `plant_size` and `pot_size` are not required.

### Pricing Generation

#### Test: Plant Totals

Input: plant count `15`, unit sell prices `42`, `55`, and `68`.

Expected result:

- Option A total: `630`.
- Option B total: `825`.
- Option C total: `1020`.
- No cost price is used as sell price.

#### Test: Missing Price

Input: Ficus Tuffi 45L exists but sell price is missing.

Expected result:

- Option is shown if requested/matched.
- Unit sell price is missing.
- Plant total is null.
- Warning: missing price.

### Unknown Plants

#### Test: Missing Plant

Input: `11m Imaginary Hedge`

Expected result:

- Match confidence: none.
- Warning: unresolved plant.
- If length exists but no spacing is available, warning: missing spacing.

### Missing Spacing

#### Test: Length With No Spacing

Input: `11m Ficus Tuffi hedge` with no Plant Library spacing.

Expected result:

- Plant count cannot be calculated.
- Warning: spacing required to calculate plant quantity.

### Multi-Plant Quotes

#### Test: Ficus Length And Lomandra Quantity

Input:

```text
Plant 12m of Ficus Tuffi hedge.
Also plant 20 Lomandra Lime Tuff along the driveway.
```

Expected result:

- Two Plant Calculator requests only.
- Ficus uses length and library/spoken spacing.
- Lomandra uses quantity 20.
- No duplicate Lomandra request.

## In Progress

- Improving real-world Plant Library import tolerance for inconsistent supplier spreadsheets.
- Improving debug visibility for actual authenticated Plant Library records.
- Better review wording for stock status and supplier availability.

## Planned

- Plant Library editing UI for individual records.
- Supplier price refresh workflows.
- Plant substitution suggestions where requested size is unavailable.
- Regional availability and stock freshness indicators.

