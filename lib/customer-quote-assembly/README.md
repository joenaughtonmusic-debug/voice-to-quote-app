# Customer Quote Assembly

This module turns already-extracted quote data into a customer-facing quote structure.

Extraction answers: what facts were found?
Assembly answers: how should those facts be presented to the customer?

The MVP supports maintenance quotes first. It uses `ProcessedQuote` fields, pricing facts, transcript wording, and selected template wording where available. Templates can support the wording, but the assembled quote should still be sendable when template sections are weak or empty.

The assembly output is not used for Xero export and does not modify `ProcessedQuote`.
