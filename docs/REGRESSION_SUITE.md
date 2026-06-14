# Quotecord Regression Suite

This document is the master acceptance test suite for Quotecord. It is intended for future AI agents, developers, contractors, and contributors who need to verify that core behaviour still works after changes.

Tests in this document are product-level expectations. Some are already represented in code tests, while others should be added to the Testing / Debug runner or future automated suites.

Trade module baselines should follow the [Trade Module Contract](./TRADE_MODULE_CONTRACT.md), which defines how future modules plug into QuoteFacts, preview, export, and internal review without adding trade-specific fields to the universal quote schema.

All future workflow and module work should also follow the [Voice-to-Quote Build Constitution](./VOICE_TO_QUOTE_BUILD_CONSTITUTION.md). It defines the app pipeline, activation rules, live QuoteDraft test-path requirements, manual override rules, and the definition of done for customer-ready quote workflows.

## Current Stable Baseline

- Plant Library MVP complete.
- Amy Hedge Quote test passing.
- Multi-size plant option generation passing.
- Sarah multi-area planting baseline passing.
- Simon material price association baseline passing.
- Decking template section classification baseline passing.
- Template recommendation and template preview baseline passing.
- Decking module MVP baseline passing.
- Decking end-to-end baseline passing.
- Retaining module MVP baseline passing.
- Retaining end-to-end baseline passing.
- Site Visit Transcript Fixture Suite passing.

Current stable baseline quote tests:

- Amy Hedge Quote
- Sarah Multi-Area Planting
- Simon Material Price Association
- Decking Template Section Classification
- Template Recommendation + Template Preview
- Decking End-to-End Baseline
- Retaining Module MVP Baseline
- Retaining End-to-End Baseline
- Site Visit Transcript Fixture Suite

## Status Legend

- Implemented: behaviour exists and should be protected.
- In progress: behaviour exists partially or is being refined.
- Planned: documented expectation for future work.

## Recommended Full Local Validation

Run this sequence before treating a regression-sensitive change as complete:

```bash
npm run test:core
npm run test:trades
npm run test:site-fixtures
npx tsc --noEmit
npm run build
```

## Site Visit Transcript Fixture Suite

Status: PASS

Command:

```bash
npm run test:site-fixtures
```

Covers realistic estimator-style transcripts without external AI calls. The suite validates deterministic quote-processing layers against reusable site visit notes, including decking, retaining, planting, gardening maintenance, ambiguous scopes, approximate measurements, exclusions, product specifications, and customer/address extraction.

Detailed fixture guidance lives in [Site Visit Fixture Suite](./SITE_VISIT_FIXTURE_SUITE.md).

## Plant Library MVP Baseline

### Test: Amy Hedge Quote - Multi Size Plant Options

Status: PASS

Input:

```text
Quote for Amy at 44 Amy Street.

Install approximately 11.5 metres of Ficus Tuffi hedge along the front boundary.

Provide options for:
- 1.2 metre
- 14 litre
- 25 litre

Supply garden mix and mulch.

Allow labour for installation.

Customer would like the hedge to eventually screen the property from the road.

Access is straightforward.

No irrigation required.
```

Expected result:

Customer:

- Amy

Address:

- 44 Amy Street

Job Type:

- Hedge Planting

Plant:

- Ficus Tuffi

Plant Count:

- 15

Spacing:

- 850mm

Spacing Source:

- plant_library

Plant Options:

- Option A: Ficus Tuffi 1.2m
- Option B: Ficus Tuffi 14L
- Option C: Ficus Tuffi 25L

Warnings:

- none

Known Review Items:

- Garden Mix quantity missing
- Mulch quantity missing
- Please confirm site address

Notes:

This test confirms:

- requested size extraction
- Plant Library matching
- size option generation
- deterministic pricing
- spacing lookup
- hedge quantity calculation
- landscaping extraction compatibility
- JSON extraction stability

## Sarah Multi-Area Planting Baseline

Status: PASS

Transcript:

```text
Quote for Sarah at 44a Amy Street, Ellerslie.

11.5m lower planting area.
Need to add 1 hour for access.
Need pricing for approximately 1m size Ficus Tuffi, 25L and 45L.

Labour for lower planting:
1.25 days, 2 people.

Lower paver area:
1.5m x 3.5m.

Upper planting area:
13.7m hedge row to be planted.

Need to determine the number of plants relative to size using a calculator.
Pricing options same as lower hedge:
1m, 25L and 45L.

Labour for upper planting:
1.75 days, 2 people.

Include hardfill / removal of old soil.

Include 6 bags garden mix.
```

Expected Customer View:

Customer:

- Sarah

Address:

- 44a Amy Street, Ellerslie

Scope:

- Plant multiple Ficus Tuffi along lower planting area.
- Plant multiple Ficus Tuffi along upper planting area.
- Supply garden mix required for planting works.
- Remove spoil generated during planting.
- Tidy the work area on completion.

Quote Options:

Lower planting area:

- Ficus Tuffi 25L
- Ficus Tuffi 45L

Upper planting area:

- Ficus Tuffi 25L
- Ficus Tuffi 45L

Expected Preview:

Title:

- Planting Quote

Labour:

- $5,280.00

Plants:

Included option:

- Ficus Tuffi 25L
- 33 plants
- $3,918.75

Upgrade option:

- Ficus Tuffi 45L
- 33 plants
- $5,775.00

Expected Internal Results:

Lower planting area:

- 15 plants

Upper planting area:

- 18 plants

Labour:

- 48 hours

Garden mix:

- 6 bags

Hardfill:

- captured

Acceptance:

- Customer View uses rendered scope.
- Preview matches rendered scope.
- Multi-area Plant Calculator passes.
- Quote Options generated.
- Labour calculated.
- No JSON fallback.
- Xero payload generation passes.

## Simon Material Price Association Baseline

Status: PASS

Transcript:

```text
Quote for Simon at 4A Amy Street, Ellerslie.

11.5m lower planting area.

Need pricing for approximately 1m size Ficus Tuffi, 25L and 45L.

Labour for lower planting:
1.25 days, 2 people.

Lower paver area:
1.5m x 3.5m.

Upper planting area:
13.7m hedge row to be planted.

Need to determine the number of plants relative to size using a calculator.

Pricing options same as lower hedge:
1m, 25L and 45L.

Labour for upper planting:
1.75 days, 2 people.

Include hardfill / removal of old soil at a cost of $154.

Include 6 bags garden mix at $18 each.
```

Expected Customer Scope:

- Plant multiple Ficus Tuffi along lower planting area.
- Plant multiple Ficus Tuffi along upper planting area.
- Supply garden mix required for planting works.
- Remove spoil generated during planting.
- Tidy the work area on completion.

Expected Quote Options:

Lower planting area:

- Ficus Tuffi 25L
- Ficus Tuffi 45L

Upper planting area:

- Ficus Tuffi 25L
- Ficus Tuffi 45L

Expected Xero Output:

Labour:

- AccountCode 10010
- TaxType OUTPUT2

Plants:

- Quantity 33
- UnitAmount 118.75
- AccountCode 10115
- TaxType OUTPUT2

Garden Mix:

- Quantity 6
- UnitAmount 18
- AccountCode 10011
- TaxType OUTPUT2

Hardfill / Spoil Removal:

- Quantity 1
- UnitAmount 154
- AccountCode 10011
- TaxType OUTPUT2

Acceptance:

- Planting scope rendered.
- Quote options generated.
- Material price association works.
- Garden mix receives 18 per bag.
- Hardfill receives 154 total.
- Account mappings preserved.
- Xero export succeeds.
- No JSON fallback.

## Decking Template Section Classification Baseline

Status: PASS

Source Template:

```text
Decking Quote Template

Scope

Construct new timber deck to the nominated area.

Set out deck area and confirm finished height on site.

Install timber subframe including posts, bearers, joists, fixings, and required structural framing.

Install decking boards to completed subframe.

Trim edges and finish visible board ends neatly.

Labour

Allow labour to construct deck structure and install decking boards.

Materials

Timber subframe materials.
Decking boards.
Concrete / post mix.
Fixings and hardware.

Waste / Removal

Remove offcuts and general construction waste from work area.

Optional Works

Stain or oil decking boards.
Install steps.
Install balustrade or handrail.
Install planter boxes or seating.
Additional ground preparation if required.

Exclusions

Council consent, engineering, or design fees unless specifically stated.
Drainage works unless specifically stated.
Electrical work unless specifically stated.
Painting, staining, or oiling unless included as optional work.
Unexpected ground conditions or hidden obstructions.

Terms

Quote is valid for 30 days.
Final price may change if site conditions differ from the information provided.
```

Expected Extraction:

Template Title:

- category: template title

Job Scope:

- category: job scope

Labour:

- category: labour

Materials:

- category: materials

Waste / Removal:

- category: waste

Optional Works:

- category: optional works

Exclusions:

- category: exclusions

Terms:

- category: terms

Acceptance:

- Template title is not classified as scope.
- Job scope is not classified as labour.
- Materials and Waste / Removal remain separate sections.
- Exclusions are not classified as optional works.
- Terms are detected correctly.
- Trade remains unset unless explicitly assigned.
- No quote rendering changes occur.
- No Xero export changes occur.

## Template Recommendation + Template Preview Baseline

Status: PASS

Purpose:

Validate template recommendation, template selection, and template preview rendering using QuoteFacts.

### Subtest 1: Planting Template Recommendation

Input Quote:

```text
Quote for Simon at 4A Amy Street, Ellerslie.

11.5m lower planting area.

Need pricing for approximately 1m size Ficus Tuffi, 25L and 45L.

Labour for lower planting: assume 1.25 days, 2 people.

Upper planting area: 13.7m hedge row to be planted.

Labour for upper planting: assume 1.75 days, 2 people.

Include hardfill / removal of old soil at a cost of $154.

Include 6 bags garden mix at $18 each.
```

Available Template:

- Planting Template

Expected Recommendation:

Suggested Template:

- Planting Template

Confidence:

- High

Expected Reasons Include:

- job scope facts match the template structure
- labour facts match the template structure
- plants facts match the template structure
- materials facts match the template structure
- waste/removal facts match the template structure

Expected Template Preview:

Job Scope:

- Planting of Ficus Tuffi in lower planting area
- Planting of Ficus Tuffi in upper planting area

Labour:

- Planting labour allowance
- $5,280.00

Plants:

- Ficus Tuffi 25L
- Ficus Tuffi 45L

Materials:

- Garden mix

Waste / Removal:

- Hardfill / soil removal

Acceptance:

- Planting template recommended.
- Confidence high.
- Template Preview populated from QuoteFacts.
- No missing-data messages for labour/plants/materials/waste.

### Subtest 2: Decking Template Recommendation

Input Quote:

```text
Quote for Steve at 12 Oak Road.

Construct a 4m x 5m pine deck.

Install timber subframe.

Install decking boards.

Supply decking materials.

Allow labour for construction.

Remove construction waste on completion.
```

Available Template:

- Decking Template

Expected Recommendation:

Suggested Template:

- Decking Template

Confidence:

- High

Expected Reasons Include:

- job scope facts match the template structure
- labour facts match the template structure
- materials facts match the template structure
- waste/removal facts match the template structure
- template name/metadata matches deck

Expected Template Preview:

Job Scope:

- Construct a 4m x 5m pine deck
- Install timber subframe
- Install decking boards

Labour:

- Allow labour for construction

Materials:

- Supply decking materials

Waste / Removal:

- Remove construction waste on completion

Acceptance:

- Decking template recommended.
- Confidence high.
- Template Preview populated from QuoteFacts.
- No planting wording appears.

## Decking Module MVP Baseline

Status: PASS

Purpose:

Validate the isolated Decking Trade Module MVP before it is wired into live quote behaviour.

### Test: Single Deck Area

Transcript:

```text
Quote for Steve at 12 Oak Road. Construct a 4m x 5m pine deck.
```

Expected:

- Decking detected.
- One deck area.
- Length: `4m`.
- Width: `5m`.
- Area: `20m2`.
- Total area: `20m2`.
- Board type: `pine`.

### Test: Multiple Deck Areas With Existing Posts

Transcript:

```text
Build a 4m x 5m pine deck. Also replace decking boards on a 3m x 4m section where posts already exist. Remove old decking waste.
```

Expected:

- Decking detected.
- Area 1: `4m x 5m`, `20m2`, `full_build`.
- Area 2: `3m x 4m`, `12m2`, `decking_boards_only`, existing posts.
- Total area: `32m2`.
- Waste/removal note captured.
- Warning shown where subframe status is unclear if applicable.

### Test: No Decking Detection

Transcript:

```text
Install six downlights and two power points.
```

Expected:

- No decking request.
- Empty decking calculator result.
- No live quote behaviour changes.

Acceptance:

- `detectDeckingFromText()` is deterministic.
- `calculateDecking()` handles one or multiple deck areas.
- Calculator output remains editable-friendly.
- Decking module is not wired into `process-quote`.
- Planting regressions remain unchanged.

## Retaining Module MVP Baseline

Status: PASS

Purpose:

Validate the isolated Retaining Trade Module MVP before it is wired into QuoteFacts or live quote behaviour.

### Test: Single Retaining Wall

Transcript:

```text
Build a 10m long retaining wall, 600mm high.
```

Expected:

- Retaining detected.
- One wall section.
- Length: `10m`.
- Height: `0.6m`.
- Face area: `6m2`.
- Total face area: `6m2`.

### Test: Multiple Retaining Walls

Transcript:

```text
One wall 8m long and 800mm high, second wall 4m long and 600mm high.
```

Expected:

- Retaining detected.
- Wall 1: `8m x 0.8m`, `6.4m2`.
- Wall 2: `4m x 0.6m`, `2.4m2`.
- Total face area: `8.8m2`.

### Test: Replacement Wall With Drainage And Waste

Transcript:

```text
Replace the old timber retaining wall, 6m long and 700mm high. Include drainage and posts. Remove old wall waste.
```

Expected:

- Replacement wall detected.
- Timber retaining flag detected.
- Drainage detected.
- Posts/post holes detected.
- Waste/removal note captured.

### Test: No Retaining Detection

Transcript:

```text
Install six downlights and two power points.
```

Expected:

- No retaining request.
- Empty retaining calculator result.
- No live quote behaviour changes.

Acceptance:

- `detectRetainingFromText()` is deterministic.
- `calculateRetaining()` handles one or multiple wall sections.
- Calculator output remains editable-friendly.
- Retaining module is not wired into `process-quote` or QuoteFacts.
- Planting and decking regressions remain unchanged.

## Decking End-to-End Baseline

Status: PASS

Purpose:

Prove decking works across the completed architecture path without breaking planting:

```text
Transcript / ProcessedQuote
↓
QuoteFacts
↓
Customer Preview
↓
Xero Export
```

Transcript:

```text
Quote for Steve at 12 Oak Road.

Build a 4m x 5m pine deck.

Add a second deck area, decking boards only, on a 3m x 4m section where existing posts and subframe are retained.

Remove old decking waste.
```

Expected QuoteFacts:

- Decking facts exist.
- Area 1: `20m2`.
- Area 2: `12m2`.
- Total decking area: `32m2`.
- Existing posts metadata is preserved.
- Existing subframe metadata is preserved.
- Waste/removal fact exists.

Expected Customer Preview:

- Includes first deck area.
- Includes second deck area.
- Includes total `32m2`.
- Includes existing posts/subframe wording.
- Includes waste/removal wording.

Expected Xero Export:

- Includes decking labour line.
- Includes decking materials line with total quantity `32` or total `32m2` in description.
- Includes waste/removal line because waste/removal was mentioned.
- Account codes come from export mappings, not hardcoded decking logic.

Guard Regressions:

- Simon Material Price Association still passes:
  - Labour -> `10010`
  - Plants -> `10115`
  - Garden Mix quantity `6`, unit amount `18`, account `10011`
  - Hardfill quantity `1`, unit amount `154`, account `10011`
- Sarah/Amy planting preview regressions still pass.
- Non-decking quotes do not produce decking facts, preview lines, or export lines.

Acceptance:

- No `ProcessedQuote` schema changes.
- Decking integration uses QuoteFacts.
- Decking-specific logic remains in `lib/trades/decking`.
- Xero account and tax codes remain controlled by export mappings.

## Retaining End-to-End Baseline

Status: PASS

Purpose:

Prove retaining works across the completed architecture path without breaking planting or decking:

```text
ProcessedQuote
↓
QuoteFacts
↓
Customer Preview
↓
Xero Export
```

Transcript:

```text
Quote for Renee at 22 Bank Street.

Replace existing timber retaining wall.

One wall 8m long and 800mm high, second wall 4m long and 600mm high.

Include drainage behind wall.

Remove old wall waste.

Access is difficult.
```

Expected QuoteFacts:

- Retaining facts exist.
- Wall 1: `6.4m2`.
- Wall 2: `2.4m2`.
- Total retaining wall face area: `8.8m2`.
- Replacement metadata is preserved.
- Timber metadata is preserved.
- Drainage metadata is preserved.
- Waste/removal metadata is preserved.
- Access difficulty metadata is preserved.

Expected Customer Preview:

- Includes both retaining wall sections.
- Includes total `8.8m2`.
- Includes replacement/timber wording.
- Includes drainage wording.
- Includes access constraint wording.
- Includes waste/removal wording.

Expected Xero Export:

- Includes retaining labour line.
- Includes retaining materials line.
- Includes drainage line because drainage was mentioned.
- Includes waste/removal line because waste/removal was mentioned.
- Account codes come from export mappings, not hardcoded retaining logic.

Guard Regressions:

- Simon Material Price Association still passes.
- Planting preview/export regressions still pass.
- Decking preview/export regressions still pass.
- Non-retaining quotes do not produce retaining facts, preview lines, or export lines.

Acceptance:

- No `ProcessedQuote` schema changes.
- Retaining integration uses QuoteFacts.
- Retaining-specific logic remains in `lib/trades/retaining`.
- Xero account and tax codes remain controlled by export mappings.

## Plant Library

### Test: Ficus Tuffi Alias Match

Status: Implemented

Input: `Ficus Tuffy`

Expected result:

- Matches Plant Library record for `Ficus Tuffi`.
- Match confidence is high.
- Plant care products such as `Plant Soap` are not returned as plant options.

### Test: Plant Care Product Exclusion

Status: Implemented

Input: Plant Library contains `Plant Soap`, sprays, fertiliser, wetting agents, or chemical products.

Expected result:

- These records are not classified as true plant options.
- They remain available elsewhere as material, chemical, spray, fertiliser, plant_care, or product items.

### Test: Unstructured Plant Size Fields

Status: Implemented

Input: Ficus Tuffi plant records where size appears only in `item_name` or `aliases`, for example:

- `Ficus Tuffi 1.2m Hedge Plant`
- `Ficus Tuffi 14L PB`
- `Ficus Tuffi 25L Pot`

Expected result:

- Requested sizes match against `item_name`, aliases, raw import size fields, plant size fields, and pot size fields.
- Structured size fields are not required for matching.

## Planting Calculator

### Test: 11.5m Ficus Tuffi Hedge

Status: Implemented

Input: `11.5m Ficus Tuffi hedge`

Expected result:

- Creates a PlantCalculatorRequest.
- Plant name: `Ficus Tuffi`.
- Length: `11.5m`.
- Uses Plant Library spacing if available.
- If spacing is `800mm`, plant count is `ceil(11.5 / 0.8) + 1 = 16`.
- If spacing is `850mm`, plant count is `ceil(11.5 / 0.85) + 1 = 15`.

### Test: 11.5m Ficus Tuffi Hedge At 600mm Spacing

Status: Implemented

Input: `11.5m Ficus Tuffi hedge at 600mm spacing`

Expected result:

- Spoken spacing overrides Plant Library spacing.
- Plant count is `ceil(11.5 / 0.6) + 1 = 21`.
- Spacing source is `spoken`.

### Test: Supply And Install 24 Ficus Tuffi Plants

Status: Implemented

Input: `Supply and install 24 Ficus Tuffi plants`

Expected result:

- Spoken quantity is captured as `24`.
- Plant count is `24`.
- Quantity source is `spoken_quantity`.
- No missing length or spacing warning.
- Plant options use 24 as the count for totals.

### Test: Multi-Plant Quote

Status: Implemented

Input:

```text
Plant 12m of Ficus Tuffi hedge.
Also plant 20 Lomandra Lime Tuff.
```

Expected result:

- Exactly two Plant Calculator requests.
- Ficus request uses length `12m`.
- Lomandra request uses quantity `20`.
- If Ficus spacing is `850mm`, Ficus count is `ceil(12 / 0.85) + 1 = 16`.
- Lomandra plant count is `20`.
- No duplicate Lomandra request.
- `12m` is not treated as quantity 12.

### Test: Amy Hedge Quote With Requested Options

Status: Implemented / passing baseline

Input:

```text
Quote for Amy. Install approximately 11.5 metres of Ficus Tuffi hedge.
Provide options for:
- 1.2 metre
- 14 litre
- 25 litre
```

Expected result:

- PlantCalculatorRequest contains requested sizes similar to `["1.2m", "14l", "25l"]`.
- Ficus Tuffi is matched from Plant Library.
- Plant count is 15 when library spacing is `850mm`.
- Option A: Ficus Tuffi 1.2m.
- Option B: Ficus Tuffi 14L.
- Option C: Ficus Tuffi 25L.
- Each option has unit sell price, total, supplier, and stock status when present in Plant Library.
- No false missing-size warning for those sizes.

## Quote Extraction

### Test: Simple Maintenance Quote

Status: Implemented / needs continued regression

Input:

```text
Quote for Fiona at 4 Wairiki Road, Mount Eden. Two-monthly maintenance. Five hours per visit.
```

Expected result:

- Customer: `Fiona`.
- Address: `4 Wairiki Road, Mount Eden`.
- Job type: maintenance.
- Frequency: two-monthly.
- Visit duration: five hours.
- Quote generation should not fail if OpenAI returns invalid JSON; fallback quote should be returned if retry fails.

### Test: Electrical Classification

Status: Implemented / needs more tests

Input:

```text
Electrical job. Add two LED downlights, a new power point, TPS cable, and certificate of compliance.
```

Expected result:

- Trade/job type: Electrical.
- Does not classify as generic installation.
- Electrical technical terms are preserved.

## Address Extraction

### Test: Address Stops Before Job Words

Status: Implemented / needs continued regression

Input: `Quote for John at 12 Kowhai Road, Greenhithe. One-off tidy.`

Expected result:

- Address: `12 Kowhai Road, Greenhithe`.
- Address does not include `one-off tidy`.

### Test: Corrected Locality Applied

Status: Implemented

Input: transcript mishears `New Lynn` as `Newlin`, and correction layer resolves it.

Expected result:

- Raw transcript remains unchanged.
- Displayed site address uses `New Lynn`.
- Internal notes may mention the correction.

## Customer Extraction

### Test: Missing Customer Does Not Block Quote

Status: Implemented

Input: `Job at 53 Buxton Street. Trim hedge and remove greenwaste.`

Expected result:

- Quote generation continues.
- Customer is `Not captured` or null.
- Missing information includes `Client name not captured`.

## JMS Matching

### Test: Labour Hours

Status: Implemented

Input: `4 hours labour at $90 per hour`

Expected result:

- Matches best hourly labour pricing item.
- Quantity: `4`.
- Override rate: `90`.
- Total: `360`.
- Does not use cost price as sell price.

### Test: Greenwaste Bags

Status: Implemented

Input: `4 bags greenwaste at $26.50 per bag`

Expected result:

- Matches greenwaste/waste item if present.
- Quantity: `4`.
- Rate: `26.50`.
- Total: `106.00`.

### Test: Plant Request Does Not Match Plant Soap

Status: Implemented

Input: `Plant 24 Griselinia`

Expected result:

- Does not match `Plant Soap`.
- If no Griselinia plant exists, creates unresolved plant warning rather than matching a chemical/product.

## Landscaping

### Test: Retaining Materials Remain Separate

Status: Implemented / needs continued regression

Input mentions posts, retaining timber, concrete, drainage coil, scoria, pebbles, and weedmat.

Expected result:

- Each material appears as a separate review line when unpriced.
- If quantity missing, warning is `Quantity missing`.
- If quantity exists but rate missing, warning is `Rate missing`.

### Test: Landscaping Labour Preference

Status: Implemented / needs continued regression

Input: `Two people for five days landscaping labour at $110 per hour`

Expected result:

- Labour hours: `2 * 5 * 8 = 80`.
- Prefer landscaping/construction labour items where available.
- Spoken rate overrides Knowledge Base rate.

## Maintenance

### Test: Recurring Maintenance Template Selection

Status: Implemented / needs continued regression

Input mentions monthly, two-monthly, recurring, ongoing, or regular maintenance visits.

Expected result:

- Maintenance extractor is used.
- Ongoing maintenance template may be selected if relevant.
- Visit duration, frequency, greenwaste, sprays, and fertiliser are preserved.

### Test: One-Off Hedge Trimming Does Not Select Maintenance Template

Status: Implemented

Input: `Trim the hedge once and remove greenwaste.`

Expected result:

- Hedge trimming/general extractor is used.
- Ongoing maintenance template is not selected unless transcript mentions ongoing or recurring maintenance.

## Multi-Plant Quotes

### Test: Quantity And Length Mixed

Status: Implemented

Input:

```text
Plant 12m of Ficus Tuffi hedge.
Also plant 20 Lomandra Lime Tuff along the driveway.
```

Expected result:

- Two planting calculator results.
- Ficus count calculated from length and spacing.
- Lomandra count uses spoken quantity.
- Location phrase `along the driveway` is not part of the plant name.

## Import Workflows

### Test: Plant Price List Sell Price Header

Status: Implemented

Input spreadsheet headers:

- `Nursery Price (GST Inc)`
- `Markup %`
- `Sell Price (+25%)`

Expected result:

- Nursery price maps to cost/nursery price, not sell price.
- `Sell Price (+25%)` maps to sell price.
- Missing sell price warning is not shown when sell price exists.

### Test: Tradify Standard Markup

Status: Implemented

Input Tradify/Xero-style export:

- `Buy Price = 38.00`
- `Standard Markup = 90`

Expected result:

- Buy Price maps to cost_price.
- Standard Markup maps to sell_price when values look like customer rates.
- LabourHrs imports as cost 38 and sell 90.

### Test: Import Preview Review

Status: Implemented / in progress

Input: CSV/XLSX import with ambiguous columns.

Expected result:

- Preview shows detected headers.
- Preview shows sample rows.
- Preview shows mapping confidence and warnings.
- User can review or manually map columns where needed.
