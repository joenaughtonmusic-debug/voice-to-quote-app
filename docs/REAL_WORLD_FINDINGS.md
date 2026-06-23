# Real World Findings

Purpose:
Record issues discovered from real customer quotes.
Focus on patterns and recurring issues rather than one-off bugs.
Use this document to guide future improvements after pilot testing.

---

# Shirley — One-Off Garden Tidy

Date:
2026-06-23

Workflow:
One-Off Garden Tidy / Hedge Trimming

Outcome:
Pass with minor edits.

Issue:
Voice transcription ambiguity.

Transcript:
"three quarters of a trailer load for six days green waste"

Customer quote:
"Approximately three quarters of a trailer load for six days' green waste"

Expected:
"Approximately three quarters of a trailer load of green waste"

Root cause:
The transcript contained a phrase that appears to be a speech-to-text ambiguity or merged phrase.
The assembly correctly rendered the captured text, but the captured text itself was likely incorrect.

Impact:
Customer quote remained understandable, but wording appeared unprofessional and required manual review.

Future improvement:
Flag unusual labour, duration, greenwaste, or quantity phrases for review instead of automatically rendering them without warning.

Classification:
Transcript Quality / Confidence Detection

Status:
Observed during real-world testing.
No implementation required yet.
