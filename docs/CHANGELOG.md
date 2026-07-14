# Talk to Quote Changelog

## Unreleased

### Added

- Landscaping Quote Builder (L0–L5): Gardening/Landscaping mode switch; transcript
  chunker (split one recording into confirmable work-area sections, never silent-merge);
  spoken-line → price-list row matcher (list price / suggest+flag, never invent);
  deterministic planting spacing + count (50cm default, Buxus 30cm, hedge >1m 80cm);
  quote assembly to customer/team/internal with GST-inclusive total and Xero parity.
- Tiered cost→sell markup on plant import (cost <$90 ×1.25, ≥$90 ×1.15), editable.
- Documentation structure.
- Supabase authentication.
- Google sign-in and sign-out.
- Quote draft saving and loading.
- Browser audio recording.
- OpenAI transcription.
- AI quote extraction.
- Editable Quote Review cards.
- Knowledge Base.
- Uploaded document analysis.
- Template Library.
- JMS Item Library import.
- Plant Library import.
- Planting Calculator.
- Testing / Debug runner.
- Trade profile setting.
- Trade-specific extraction frameworks.

### Changed

- Improved quote extraction reliability.
- Improved address extraction architecture.
- Improved line item matching and totals.
- Improved gardening, landscaping, and electrical extraction behaviour.

### Fixed

- Plant import no longer silently treats a lone "Price" column as an un-marked-up
  sell price — it is mapped as cost so the markup rule computes sell.
- Placeholder transcript replacement.
- Draft saving/editing behaviour.
- PDF extraction and uploaded quote analysis diagnostics.
- Labour hour calculations.
- Missing quantity/rate warnings.
- Greenwaste quantity handling.

## Notes

This changelog is an initial project-level scaffold and should be kept up to date as product changes are shipped.
