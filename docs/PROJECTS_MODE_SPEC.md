# Projects Mode — Multi-Area One-Off Jobs (Spec)

> Status: BUILT (15 Jul 2026) — third job type in Simple Mode (`lib/simple/project.ts`
> + `materials-prices.ts`; price table transcribed from Joe's MASTER Material_Pricing
> PDFs). Joe's confirmed rules: labour **$80/hr incl. GST**, **15% contingency** by
> default on project labour (customer price = hours × 1.15 × rate; team view keeps
> base hours). Live-verified end-to-end on the weedmat job: $4,495.50 incl. GST
> $586.38 — matches the golden targets below.

## The job shape this serves

One-off landscaping-adjacent projects dictated area by area: each area has
dimensions, a task list with hours, and materials derived from those dimensions
(weedmat, pins, pebbles/mulch, plants). Joe wants: labour compiled per area and
combined, material quantities calculated deterministically, prices from HIS
imported supplier lists only, and customer/internal/team views per area plus a
combined-delivery option. Reference target: the ChatGPT output Joe rated highly
for this job — same structure, but enforced instead of hoped-for.

## Flow

1. Third job type in Simple Mode: **Project** (alongside Maintenance / Tidy).
2. One extraction call splits the dictation into **areas** (Joe's headers make
   this near-deterministic): per area — name, dimensions (length/width/extra m²,
   width flagged when assumed), tasks with hours, plant counts, materials
   mentioned. Nulls over guesses, as ever.
3. **Confirm screen per area**: dimensions editable (assumed widths highlighted
   red), task/hours rows editable, contingency toggle (default 15%), rate
   editable (default $80).
4. **Deterministic materials engine** (`lib/simple/materials.ts`):
   - area m² = L × W (+ extra m²); flag when width assumed
   - pebbles/mulch m³ = area × depth (default 50mm, editable) × 1.10 waste,
     ordered in 0.5 m³ steps
   - weedmat: roll fits if roll area ≥ bed area × 1.10 (cut-strip coverage);
     choose 0.9m vs 1.8m roll by bed width
   - pins: 1 pack per area, pooled when combined
   - plants: count × price ONLY when a matched list price exists, else flagged
5. **Price resolution**: imported Bunnings/Landscape Supplies lists only
   (match or flag "price to confirm" — never invent). Reuses the L3 matcher
   approach + the existing import pipeline (`import-samples/bunnings.csv`,
   `landscape.csv` — NOT yet supplied).
6. **Outputs**: per-area customer/internal/team sections + a combined quote
   (one delivery, pooled pebbles/pins) with the saving shown; missing-info
   checklist (widths, disposal, plant selection, edging, spray lead-time) as
   review notices; Xero export = one line per priced item, same payload
   contract as Simple Mode.

## Golden acceptance test

This exact job. Engine-computed targets (at $80/hr, 15% contingency; material
sell prices as cited from Joe's lists — re-verify on CSV import):
- Driveway 5.7m²: 13.5h → 15.52h → $1,241.60; total $1,679.19 (GST $219.04)
- Beside house 9m² (width assumed): 18h → 20.7h → $1,656.00; total $2,105.55
- Under hedge 5.5m² (width assumed): 8h → 9.2h → $736.00; total $1,185.55
- Combined (one delivery, 1.5m³ pebbles, 2 pin packs): **$4,495.50**
  (GST $586.38), vs $4,970.29 independent — saving $474.79
- Must-flag list: assumed widths, plant supply unpriced, disposal unpriced,
  scoria/"scoring" confirmation

## Prerequisites (blockers before build)

1. **`bunnings.csv` + `landscape.csv` into `import-samples/`** (gitignored) —
   without them the materials engine has nothing real to price from.
2. Joe approves this spec.

## Non-goals

Decking/retaining/paving calculators, plant-spacing logic (Builder mode keeps
those), AI-priced anything.
