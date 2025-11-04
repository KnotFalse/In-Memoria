# Session Log – PHP Integration Estimator Guard
- Timestamp: 2025-10-20T21:03:24-0500
- Branch: In-Memoria: feat/php-language-support @ fc20562 (dirty)

## Scope
- Added a pre-learning estimator so long semantic runs report expected embeddings, cost, and runtime before committing.

## Implementation Notes
- Created `src/utils/embedding-estimator.ts` for fast file walk, chunk/token estimation, and duration formatting.
- Updated CLI `learn` command to parse `--estimate-only`, `--no-estimate`, and `--yes` flags, display estimates, and prompt before executing.
- Added `Learning Options` help text and Vitest coverage in `src/__tests__/embedding-estimator.test.ts`.

## Tests
- `npx vitest run src/__tests__/embedding-estimator.test.ts`

## Outstanding
- Worker-thread embedding pool and OpenAI toggle wiring still pending.
