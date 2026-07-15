# Landscaping Quote Builder — Spec (v1)

Plain-language spec for the "build it fast, my judgement stays in" landscaping mode.
Companion to PRODUCTION_DIRECTION.md. Written against the current repo.

---

## The idea in one line
For landscaping, the app does NOT auto-quote. I talk, it splits the job into
chunks and suggests lines + prices from my uploaded lists, and I approve or edit
each one. It removes the friction, not the judgement.

---

## Two modes, one app
- **Gardening mode** — the existing, finished auto-quoter (tidy + maintenance).
  Reliable, rule-based, leave it exactly as is. Not touched by this work.
- **Landscaping mode** — this new builder. Talk → split → build → approve → quote.

A simple mode switch at the start of a new quote. Gardening stays the trustworthy
auto-path; Landscaping is the you-in-the-loop builder.

---

## The builder flow
1. **Talk** — I dictate the whole job or parts. One recording may mix weed mat,
   mulch, planting, edging, etc. (I won't always be disciplined about separating.)
2. **Split into chunks** — the app breaks the recording into distinct work areas /
   job types and shows them to me as separate editable sections. It does NOT
   silently merge or guess how they combine — it splits visibly and I confirm.
   (This is the paver lesson done right: surface the split, let me approve it.)
3. **Expand each chunk** — for each section I can add detail, adjust quantities,
   correct the split, or delete. The app suggests line items for the chunk.
4. **Suggest lines + prices** — for each line, the app matches what I said against
   my uploaded price lists and fills the price. No match → it SUGGESTS a price and
   flags it "confirm" — never silently invents, never leaves it blank-and-forgotten.
5. **I approve or edit** — every line and price is editable. Labour especially is
   always editable. Nothing is final until I say so.
6. **Output** — clean quote in my format, with internal / team / customer versions,
   GST-inclusive total, Xero parity — reusing the existing assembly/export.

---

## Pricing: uploaded lists first, suggest second

### My real lists (verified) — three different shapes
1. **Botanic Creations (plants):** columns `Product Label | Price | Availability`.
   NO spacing column. Pot size is embedded in the name ("Ficus tuffi 14L",
   "Lomandra lime tuff 2L"). → spacing is always SUGGESTED, never looked up;
   matching my speech to a row needs fuzzy name matching (ignore/normalise pot size).
2. **Bunnings (materials):** `Material | Price`, grouped under headings
   (Posts, Rails, Retaining, Decking). Per-item timber/hardware.
3. **Auckland Landscape Supplies (bulk):** `Material | Their price | Mark up |
   Quantity | Total`. Has cost + markup already. Soil, mulch, metals, sand — per m³.
   This is the weed-mat/bark/mulch/stone pricing for driveway-type jobs.

### Mapping note (important)
These do NOT match the importer's expected column names
(`sell price / cost price / spacing / account code`). Each list needs a small
column-mapping step on import (e.g. Botanic "Price"→sell_price;
Landscape "Their price"→cost_price + "Mark up"→sell). Build a per-list mapping
UI or config rather than assuming one fixed schema. Confirm mappings with me.


- I upload Excel/CSV price lists: my nursery/plant list, JMS/material list, my own
  list. The app already has an importer (`lib/plant-library-import.ts`) that maps
  columns (plant name, spacing, cost price, markup, sell price, account code, etc.).
- Spoken items are matched to list rows by the existing matcher
  (`lib/core/material-price-association.ts`), which returns a confidence level
  (high/medium/low/none).
  - **High/medium match** → use the list price, show which row it matched.
  - **Low/none** → SUGGEST a price (from a sensible default or similar item) and
    flag "confirm price" — I set it.
- **Labour** reuses the gardening rules (per-person day rate etc.) but is ALWAYS
  editable in landscaping — I override by feel per job.
- All the "flag, don't guess" behaviour already exists in the planting calculator
  (`missing_price`, `unresolved_plant`, `out_of_stock` warnings) — reuse it.

---

## Plant spacing / counts
- The planting calculator (`lib/calculators/planting/index.ts`) already computes
  counts from length + spacing and flags missing spacing.
- v1 rule: use the spacing from the price list if present; otherwise the app
  SUGGESTS a spacing (a lookup/AI suggestion is fine here) which I check and edit.
  I approve the count — never a silent guess. Editable everywhere.

---

## What already exists (reuse — do NOT rebuild)
- Plant/material list import + column mapping — `lib/plant-library-import.ts`
- Spoken-item → price matching with confidence — `lib/core/material-price-association.ts`
- Planting spacing/count calculator with flags — `lib/calculators/planting/index.ts`
- JMS + plant library UI — `components/jms-item-library.tsx`, `components/plant-library.tsx`
- Material bill / planting export — `lib/trades/planting/*`, `lib/export/planting-export-lines.ts`
- GST/total assembly, internal/customer split, Xero parity — from the gardening build

## What's new to build
1. **Mode switch** (gardening vs landscaping) at quote start.
2. **The chunker** — split one recording into distinct editable work-area sections
   I confirm. (Biggest new piece. Split-visibly, approve, never silent-merge.)
3. **The build/approve screen** — per-chunk line list, each line editable, price
   from list-or-suggested-and-flagged, labour editable, add/delete lines.
4. **Wire the existing importer + matcher + calculator into that screen** so
   suggestions are populated and approvable, rather than auto-final.

---

## Guardrails (same spirit as gardening)
- Never silently invent a price or a count — suggest + flag, I confirm.
- Never silently merge mixed work — split visibly, I approve.
- Internal/team notes never leak to the customer version (reuse existing gate).
- Landscaping numbers are DRAFTS I adjust — grade the builder on "correct,
  editable, nothing hidden," not on matching a sent figure.
- Don't touch the gardening auto-quoter or the paused paver batches.

---

## Build order (suggested)
- **L1** — mode switch + landscaping shell (empty builder screen, one manual chunk).
- **L2** — the chunker: talk → split into confirmable sections.
- **L3** — wire price-list matching into lines (list price / suggest+flag).
- **L4** — wire spacing/counts (suggest + approve).
- **L5** — assemble to internal/team/customer quote + GST + Xero parity.
Each narrow, separately committable, graded on a real dictated landscaping job.

## Definition of done (v1)
I dictate a real mixed landscaping job (e.g. weed mat + bark + carex planting +
edging along a driveway). The app splits it into chunks I confirm, suggests lines
and prices from my uploaded lists (flagging what it can't match), lets me edit
everything including labour, and outputs a clean customer/team/internal quote with
a correct GST-inclusive total — faster than my current notepad→email→ChatGPT flow.
