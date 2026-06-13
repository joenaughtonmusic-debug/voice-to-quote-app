# Quote Extraction Tests

This document defines the dedicated quote extraction regression suite. It covers AI extraction, deterministic pre/post-processing, trade classification, address/client extraction, JMS matching, template use, and fallback behaviour.

The suite should be implemented gradually in the Testing / Debug runner and future automated tests.

## Maintenance

### Test: Two-Monthly Maintenance

Transcript:

```text
Quote for Fiona at 4 Wairiki Road, Mount Eden. Two-monthly maintenance. Five hours per visit.
```

Expected extraction:

- Client: Fiona.
- Site address: 4 Wairiki Road, Mount Eden.
- Job type: Maintenance.
- Frequency: two-monthly.
- Visit duration: five hours.
- Missing information does not include client or address.
- If AI JSON fails, fallback quote still includes client, address, transcript, trade, and warning.

### Test: Maintenance With Greenwaste Uncertainty

Transcript:

```text
Quote for Kate at 21 Kelwyn Road, Kelston. Monthly maintenance. Usually one or two bags of greenwaste.
```

Expected extraction:

- Job type: Maintenance.
- Greenwaste quantity is uncertain.
- No forced exact quantity.
- Missing information or review warning flags greenwaste quantity uncertainty.

## Landscaping

### Test: Retaining Wall Detail Preservation

Transcript:

```text
Quote for Mike at 8 View Road, Glenfield. Build a low retaining wall. Allow 125x125 posts, 200x50 H4 rough sawn retaining timber, Super Strength concrete, drainage coil, scoria, and geotextile. Two people for five days.
```

Expected extraction:

- Job type: Landscaping or retaining.
- Materials remain separate line items.
- Labour hours: `2 * 5 * 8 = 80`.
- Unpriced materials are marked needs review.
- Quantities/rates are not invented.

### Test: Landscaping Labour Preference

Transcript:

```text
Quote for Sarah at 14 Kings Road, Panmure. Landscaping labour two people for four full days at $110 per hour.
```

Expected extraction:

- Labour hours: `2 * 4 * 8 = 64`.
- Prefer landscaping/construction labour item where available.
- Spoken rate overrides Knowledge Base rate.
- Total is `64 * 110 = 7040`.

## Arborist

### Test: Tree Removal

Transcript:

```text
Quote for Liam at 9 Milton Road, Mount Eden. Remove one small tree, chip branches, and grind the stump. Access is tight.
```

Expected extraction:

- Trade/job type: Arborist or tree removal.
- Preserves tree removal, chipping, stump grinding, and access constraints.
- Equipment and waste disposal are separate reviewable items if no rates are available.

Status: In progress. Arborist framework exists but needs a dedicated 10-test pack.

## Building

### Test: Decking Scope

Transcript:

```text
Quote for Sam at 30 Kohimarama Road, Kohimarama. Build a small deck with piles, bearers, joists, decking boards, and steps. Allow two people for three days.
```

Expected extraction:

- Trade/job type: Building, decking, or landscaping depending on configured trade and transcript.
- Preserves stages and material types.
- Labour hours: `2 * 3 * 8 = 48`.
- Missing information flags dimensions, timber specs, and rates if absent.

Status: In progress. Building/decking extraction works on simple examples but needs broader coverage.

## Electrical

### Test: Downlights And Power Points

Transcript:

```text
Electrical job for Erin at 11 Queen Street, Onehunga. Install six LED downlights, two power points, TPS cable, and provide certificate of compliance.
```

Expected extraction:

- Job type: Electrical.
- Not classified as generic installation.
- Preserves LED downlights, power points, TPS cable, and certificate of compliance.
- Address does not include `power points`.

Status: In progress. Electrical classification works on basic examples.

## Plumbing

### Test: Tap And Waste Pipe

Transcript:

```text
Plumbing quote for Ben at 7 Victoria Avenue, Remuera. Replace leaking mixer tap and repair waste pipe under vanity.
```

Expected extraction:

- Job type: Plumbing.
- Preserves mixer tap and waste pipe.
- Missing information flags parts/rates if absent.

Status: In progress. Plumbing framework exists and needs test suite coverage.

## Painting

### Test: Exterior Repaint

Transcript:

```text
Painting quote for Jess at 5 Park Road. Prep and repaint front fence, two coats, include sanding and primer where needed.
```

Expected extraction:

- Job type: Painting.
- Preserves prep, primer, coats, and surface.
- Missing information flags area/length, paint type, and access if absent.

Status: Planned. Painting extractor framework is light.

## Cleaning

### Test: Move-Out Clean

Transcript:

```text
Cleaning quote for Alex at 10 Domain Road. Full move-out clean, oven, windows inside, bathrooms, kitchen, and floors.
```

Expected extraction:

- Job type: Cleaning.
- Preserves areas and tasks.
- Missing information flags property size/bedrooms if absent.

Status: Planned. Cleaning extractor framework is light.

## Address Extraction

### Test: Stop Before Service Words

Transcript:

```text
Quote for John at 12 Kowhai Road, Greenhithe. Garden tidy and greenwaste.
```

Expected extraction:

- Address: `12 Kowhai Road, Greenhithe`.
- Address does not include `Garden tidy` or `greenwaste`.

### Test: Misheard Locality Correction

Transcript:

```text
Quote for Mia at 6 Rata Street, Newlin. Hedge tidy.
```

Expected extraction:

- Raw transcript preserves `Newlin`.
- Corrected output uses `New Lynn` when correction confidence is high.
- Internal notes record correction.

## Customer Extraction

### Test: Customer At Address

Transcript:

```text
Small planting job for Kate at 21 Kelwyn Road.
```

Expected extraction:

- Client: Kate.
- Address: 21 Kelwyn Road.

### Test: Missing Client

Transcript:

```text
Job at 53 Buxton Street. Trim hedge and remove greenwaste.
```

Expected extraction:

- Quote generation continues.
- Client is `Not captured` or null.
- Missing information includes client name.

## Multiple Scopes

### Test: One-Off Tidy Plus Ongoing Maintenance

Transcript:

```text
Quote for Sarah at 22 Valley Road. Initial garden tidy with overgrowth and two bags of greenwaste. Also offer two-monthly ongoing maintenance.
```

Expected extraction:

- Primary quote: initial tidy.
- Optional quote: two-monthly maintenance.
- Confidence warning includes multiple quote options detected.

## Optional Works and Variations

### Test: Optional Extra Not In Total

Transcript:

```text
Quote for Tim at 18 Arney Road. Main job is hedge trim. Optional extra is spraying weeds, not included in total.
```

Expected extraction:

- Optional extra is separate.
- Not included in main total unless user explicitly says it is included.
- Internal notes preserve pricing/exclusion uncertainty.

## Fallback Behaviour

### Test: Invalid JSON From AI

Transcript: any simple valid quote where OpenAI returns malformed JSON.

Expected extraction:

- JSON repair is attempted.
- One retry is attempted for JSON/schema/timeout failures.
- If retry fails, fallback quote is returned.
- Fallback includes transcript, deterministic client/address if available, detected trade, template context where available, and warning explaining extraction failed.

