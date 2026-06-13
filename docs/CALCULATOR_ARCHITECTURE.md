# Calculator Architecture

This document defines the calculator philosophy for Quotecord.

## Core Rule

```text
AI extracts.
Calculators calculate.
Price lists provide rates.
Users review results.
```

AI should identify intent and extract structured inputs. Deterministic calculator modules should perform quantities, formulas, totals, and warning logic.

## Why Calculators Should Be Deterministic

Trade quote calculations need consistency. AI can be useful for understanding messy spoken text, but it should not be the source of arithmetic truth.

Deterministic calculators provide:

- repeatable results
- easier regression testing
- visible formulas
- better review warnings
- safer pricing
- clear separation between extraction and calculation

Examples:

- AI extracts `11.5m Ficus Tuffi hedge`.
- Plant Library provides Ficus options and spacing.
- Planting Calculator computes plant count.
- Quote Review shows the result for user approval.

## Current Calculators

### Planting Calculator

Status: Implemented and actively refined.

Location:

- `lib/calculators/planting`
- `lib/plants`

Responsibilities:

- Accept PlantCalculatorRequest inputs.
- Match plant requests to Plant Library data.
- Use spoken quantity when supplied.
- Calculate plant count from length and spacing.
- Use spoken spacing before library spacing.
- Generate plant option groups from Plant Library records.
- Calculate plant totals from plant count and unit sell price.
- Return warnings for missing plant, missing spacing, missing price, unresolved requested size, or out-of-stock options.

Inputs:

- plant name
- spoken quantity
- hedge/row length
- spoken spacing
- spoken unit sell price override
- Plant Library match
- requested option sizes

Outputs:

- plant count
- quantity source
- spacing used
- spacing source
- formula
- Plant Library match confidence
- option groups
- warnings

Review warnings:

- unresolved plant
- missing spacing
- missing quantity or length
- missing price
- requested size not found
- out of stock

Current examples:

- `11.5m Ficus Tuffi hedge`
- `11.5m Ficus Tuffi hedge at 600mm spacing`
- `Supply and install 24 Ficus Tuffi plants`
- `Plant 12m of Ficus Tuffi hedge. Also plant 20 Lomandra Lime Tuff.`
- Ficus Tuffi option requests for `1.2m`, `14L`, and `25L`.

## Calculator Integration Pattern

Current Planting Calculator pattern:

1. AI/main extraction produces normal quote draft.
2. Deterministic post-processing detects planting calculator intent.
3. PlantCalculatorRequest is extracted from transcript.
4. Plant Library records are loaded from Knowledge Base context.
5. Planting Calculator runs.
6. Result is attached to quote data as internal review output.
7. Customer-facing wording is not automatically rewritten from calculator output yet.

## Future Calculators

Future calculators should follow the same architecture:

```text
Transcript / notes
↓
AI extracts structured request
↓
Knowledge Base / price list supplies rates/specs
↓
Calculator computes
↓
Review card shows result and warnings
↓
User approves before quote/export
```

### Garden Mix Calculator

Status: Planned

Purpose:

- Calculate garden mix/soil volume from area and depth.

Inputs:

- length
- width
- area
- depth
- density or bag/cubic metre conversion
- price list item

Outputs:

- volume
- quantity
- material total
- review warnings

### Mulch Calculator

Status: Planned

Purpose:

- Calculate mulch volume or bag count from area and depth.

Warnings:

- missing depth
- missing area
- missing material rate

### Soil Calculator

Status: Planned

Purpose:

- Calculate soil/topsoil/compost needs for beds, planters, or lawn preparation.

### Gravel Calculator

Status: Planned

Purpose:

- Calculate gravel/scoria/basecourse volume from length, width, and depth.

### Pebble Calculator

Status: Planned

Purpose:

- Calculate decorative pebble quantities and costs.

### Labour Calculator

Status: In progress as post-processing rules, planned as isolated calculator.

Current implemented rules:

- Half day, one person = 4 hours.
- Full day, one person = 8 hours.
- Labour hours = people * days * 8.
- Explicit spoken total hours win.
- Quantity and rate produce total = quantity * rate.

Future responsibilities:

- Isolate labour-hour calculations into a shared deterministic module.
- Support crew size, half days, visit duration, recurring visits, and staged labour.
- Preserve spoken overrides.

### Retaining Calculator

Status: Planned

Purpose:

- Support retaining wall material quantities and stages.

Inputs may include:

- wall length
- height
- post spacing
- timber sizes
- concrete bags
- drainage products
- excavation/backfill

### Decking Calculator

Status: Planned

Purpose:

- Support decking material quantities and labour staging.

Inputs may include:

- deck area
- board width
- joist spacing
- posts/piles
- fixings
- stairs
- balustrade

## Responsibilities

Calculators should:

- perform arithmetic
- expose formulas
- use supplied rates only
- return structured warnings
- avoid hidden assumptions
- remain testable without OpenAI

Calculators should not:

- call OpenAI
- invent rates
- invent missing dimensions
- decide customer wording
- bypass user review

## Inputs

Calculator inputs should come from:

- spoken transcript values
- pasted notes
- AI extracted structured requests
- Knowledge Base records
- JMS Item Library records
- Plant Library records
- user settings
- templates

Spoken values override defaults.

## Outputs

Calculator outputs should include:

- calculated quantities
- source of quantity
- rates used
- source of rate
- totals
- formulas
- matched library items
- confidence or match metadata
- warnings

## Review Warnings

Warnings should be explicit and actionable:

- quantity missing
- rate missing
- spacing missing
- material size missing
- product not found
- requested option unavailable
- out of stock
- needs address confirmation
- calculation not possible

Warnings should be preserved in Internal View until the user resolves or accepts them.

