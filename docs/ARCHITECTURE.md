# Quotecord Architecture

## Overview

Quotecord is a Next.js application backed by Supabase for authentication, database storage, and file storage. Server-side API routes handle AI transcription, correction, quote extraction, uploaded document analysis, and business knowledge processing.

## Frontend

## Next.js App

- Record screen
- Quote review modal
- Drafts page
- Knowledge Base
- Settings
- Testing / Debug runner

## Backend API Routes

- `app/api/transcribe/route.ts`
- `app/api/correct-transcript/route.ts`
- `app/api/process-quote/route.ts`
- `app/api/analyse-uploaded-quote/route.ts`

## Data Storage

## Supabase Tables

- `profiles`
- `quote_drafts`
- `uploaded_quote_examples`
- `quote_templates`
- `knowledge_items`

## Supabase Storage

- `quote-examples`

## Knowledge Sources

- Uploaded quote examples
- Quote templates
- JMS item libraries
- Plant price libraries
- Terms, exclusions, and business rules

## Security

- Supabase Auth identifies the user.
- RLS must remain enabled.
- Client uses anon/publishable key only.
- Service role keys are not used in the app.
- OpenAI API keys stay server-side only.

## Future Architecture Notes

- Address validation should plug into the address extraction module.
- Trade extractors should remain isolated by trade.
- Business-specific behaviour should come from user data, not hardcoded rules.
