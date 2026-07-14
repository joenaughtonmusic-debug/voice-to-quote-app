# Current Session Handoff

Re-orientation for a fresh session. Branch: `wip/export-mapping-refactor-from-cursor`
(pushed to origin, **do not merge to main**).
North star: **`docs/PRODUCT_VISION.md`** + landscaping spec **`docs/LANDSCAPING_BUILDER_SPEC.md`**.
Answer keys: **`docs/reference_quotes/ANSWER_KEYS.md`** (real sent quotes as PDFs alongside).

---

## 1. DONE & send-ready — GARDENING auto-quoter (leave as-is)

- **One-off tidy (T1–T7)** and **ongoing maintenance (M-series)**. Deterministic,
  spoken overrides win, GST-inclusive totals, no internal/team leaks to the customer
  copy, **Xero total == customer total**. Graded on Xavier/Dave (tidy) and
  Nadia/Brett/Finn (maintenance).
- Key files — assemblers `lib/customer-quote-assembly/{garden-tidy,maintenance}.ts`;
  pricing facts `lib/export/{tidy,maintenance}-*`; Xero renderers `lib/export/xero/*`.

---

## 2. DONE — Landscaping Quote Builder (L0–L5), Landscaping mode

New "build it fast, my judgement stays in" mode. Gardening/Landscaping switch on the
record tab (`components/voice-quote-app.tsx`); gardening path untouched. All landscaping
code is under `lib/landscaping/` + `components/landscaping-builder-screen.tsx`.
**41 tests, wired into `test:node`.** Everything deterministic, flag-don't-guess,
never silent-merge/invent.

- **L0 — pricing + hardening.** `lib/pricing/cost-markup.ts`: tiered cost→sell markup
  (cost <$90 ×1.25, ≥$90 ×1.15), integer-cent rounding, overridable. Wired into the
  **plant import** (`lib/plant-library-import.ts` + `components/plant-library.tsx`):
  sell computes from cost automatically. **Fixed a real bug** — a lone "Price" column
  was silently becoming an un-marked-up sell; now treated as cost. Sanity rows exact:
  19.90→24.88, 65→81.25, 95→109.25. Plus a planting-engine determinism proof.
- **L1 — mode switch + builder shell.**
- **L2 — chunker** (`chunker.ts`): split one recording into confirmable work-area
  sections (weed mat / bark / planting / edging / excavation / irrigation…). No text
  loss, no merge of different work, location guard ("down the fence line" ≠ fencing).
- **L3 — price matching** (`list-matcher.ts`): match a spoken line to an imported
  price-list ROW. High→list price; medium/low→list/suggested + confirm flag;
  no match→unpriced + flag. Never fabricates a number.
- **L4 — spacing + count** (`planting-spacing.ts`): default 50cm; Buxus 30cm (name
  override); "hedge above 1m" or height >1m → 80cm; 1m exactly stays 50cm.
  Count = ceil(length ÷ gap); spoken/manual count wins. Shown + editable per line.
- **L5 — assembly** (`assemble-quote.ts`): confirmed chunks → customer/team/internal
  views + GST-inclusive total + Xero lines. GST = per-line ×3/23 (mirrors gardening;
  answer keys re-asserted). **Xero total == customer total** by construction.

**End-to-end mixed driveway job PASSES** (weed mat + bark + carex planting + edging):
customer subtotal $1,080.34 + GST $162.06 = **$1,242.40**; Xero parity ✓; suggested
prices flagged for confirm. (This is a synthetic fixture, not a real sent quote.)

---

## 3. OPEN — next steps / decisions

- **Import the real material lists.** Botanic (plants) import mapping is **ready**
  but no real CSVs have been imported yet. **Bunnings + Landscape Supplies** go through
  the material/JMS path and still need: their CSVs dropped in `import-samples/`
  (gitignored), material-path markup wiring, and a real-data spot-check. Until then
  landscaping matches only what's imported.
- **Team-instructions output** is built but basic (per-area work type + notes +
  quantities, no prices) — worth iterating after real use.
- **Parked decisions:** (a) a **pre-existing** failing garden-tidy test
  (`workflow-presentation`, labour-line assertion) on this branch — investigate or
  leave; (b) **L0d** "no silent plant drop" fix touches shared extraction
  (`extractPlantCalculatorRequestsFromText`) — not shipped, needs go-ahead;
  (c) **L2b** optional AI-assisted chunker layer over the deterministic spine.
- **Live UI** for the builder is build/typecheck-verified but not click-tested
  (Google-auth gated). Core logic is fully unit-proven.

---

## 4. PAUSED / pointers

- **PAUSED — paver / mixed-trade batches (AI-0c, AI-1).** Do not restart under this work.
- Full batch history: `docs/QUOTE_ENGINE_BATCH_PLAN.md`.
