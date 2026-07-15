# Current Session Handoff

Re-orientation for a fresh session. Branch: **`feat/simple-mode`** (merged to **`main`** for
Vercel deployment — main is now the live line).
North star: **`docs/SIMPLE_MODE_SPEC.md`** (the current product direction) +
`docs/PRODUCT_VISION.md`. Answer keys: **`docs/reference_quotes/ANSWER_KEYS.md`**.

---

## 1. THE PIVOT (15 Jul 2026) — Simple Mode is the product

A full audit (three parallel explorations + live pipeline runs) found ~75–80% of the ~49k-LOC
codebase served multi-trade generality Joe never uses; the old pipeline live-failed the real
"Dan 54 Marua Road" job twice (routed "Maintenance" to hedge_trimming/tidy; spoken $300
silently lost to $280 default). Joe approved a strip-back: **maintenance + one-off tidies are
the product.** Details and key decisions: `docs/SIMPLE_MODE_SPEC.md` (status header) and the
memory file `simple-mode-pivot`.

## 2. DONE — Simple Mode (default record-tab mode)

`lib/simple/` + `components/simple-quote-screen.tsx` + `app/api/simple-extract/route.ts`.
Zero imports from the multi-trade pipeline. Flow: pick Maintenance/Tidy (no AI classification)
→ record/paste → ONE structured extraction call (gpt-4o, `OPENAI_SIMPLE_MODEL` overridable;
nulls over guesses) → confirm screen (every field editable, pricing source badged, defaulted
$80/hr loud red) → fixed templates (real maintenance body / tidy scope; internal notes never
customer-facing) → GST-inclusive totals (per-line ×3/23) → Xero export via prebuilt validated
payload (`lib/simple/xero.ts`; AccountCodes labour 10010 / waste+extras 10011, TaxType OUTPUT2)
or copy-text. Drafts persist to `quote_drafts` (state in `quote_options.simple_quote_v1`,
routed back into Simple Mode on open — `lib/simple/draft-row.ts`).

**19 tests green (`npm run test:simple`, in `test:node`)** — graded against real sent quotes:
Nadia $333.50/GST $43.50 · Brett $474.50/$61.89 · Dave $479.75/$62.57 (Friday note stays
internal) · Xavier $798.88/$104.20 · Dan $300 spoken beats $280 default · draft round-trip.
Live smoke (2× real extraction runs on Dan): identical, correct. Joe verified in the UI —
"Quote finally looks correct."

## 3. OPEN

- **Xero export didn't come through on Joe's first try.** Likely cause fixed (missing
  AccountCode per line — legacy always sends it). Joe is uploading the **Make.com blueprint**
  — verify the scenario's field mapping against `SimpleXeroPayload`, check Make execution
  history, and confirm Vercel has `XERO_EXPORT_WEBHOOK_URL` + `OPENAI_API_KEY` set.
- **Trial period:** all real maintenance/tidy quotes through Simple Mode (~2 weeks). Gaps
  found in the field drive the next work.
- **Strip-back decision AFTER the trial, not on a timer.** Plan: delete the multi-trade
  auto-quoter machinery (pipeline/trades/calculators/quote-plan/auditor/overseer/assembly
  regexes) but KEEP the landscaping Builder + import/markup modules (`lib/landscaping/`,
  `lib/pricing/cost-markup.ts`, plant import) — that's the supplier-priced part with real
  value. Tag the tree before deleting; git keeps everything recoverable.
- **Direction idea (Joe's, banked):** conversational voice back-and-forth — read the quote
  back, adjust by voice, recompute deterministically. Interaction layer on top of the same
  engine; do NOT let an LLM price anything. Revisit after the trial.
- Pre-existing repo issues: `npm run lint` broken (eslint not installed); 5 tsc errors in
  `lib/quote-plan/ai-planner.test.ts`; a red garden-tidy `workflow-presentation` test.

## 4. PAUSED / pointers

- Old gardening auto-quoter + landscaping Builder modes still work, untouched, behind the
  mode switch. **Do not restart paver / mixed-trade batch work.**
- Old-pipeline history: `docs/QUOTE_ENGINE_BATCH_PLAN.md`. Landscaping spec:
  `docs/LANDSCAPING_BUILDER_SPEC.md`.
