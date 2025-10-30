# PHP Integration – Phase 1 Step 6 Status (Rebuild & Telemetry)

_Last verified: 2025-10-23_

## Current state
- `bun run build:rust` now executes successfully in the primary development environment and produces the PHP-aware N-API bundle (`napi build --platform --release`).
- `SemanticAnalyzer::learn_from_codebase` returns non-zero PHP concepts; `get_performance_status` surfaces populated metrics (e.g., 12 PHP concepts for `sandbox-php-sample` with 2 ms concept query time).
- Fresh smoke captures live under `tmp/metrics/php-smoke.json` and `tmp/metrics/python-smoke.json` for baseline comparison.

## Rebuild checklist (repeatable)
1. Ensure dependencies are installed (`npm install` / `bun install`) and `@napi-rs/cli` is available.
2. Run `bun run build:rust` (delegates to `npm --prefix rust-core run build`, invoking `napi build --platform --release`).
3. Re-run targeted verification:
   - `bunx tsx scripts/capture-performance-status.ts sandbox-php-sample tmp/metrics/php-smoke.json`
   - `bunx tsx scripts/capture-performance-status.ts sandbox-python-sample tmp/metrics/python-smoke.json`
   - Optionally `bunx vitest run src/__tests__/php-integration.test.ts`
   - (All commands fall back to `npx` automatically when Bun is unavailable.)
4. Commit updated native artifacts (`rust-core/index.js`, `index.d.ts`, platform binaries) when cutting a release.

## Validation expectations
- `get_performance_status` lists PHP in `conceptsByLanguage` and `performance.intelligence.php`.
- Comparative captures show PHP performance within ±10 % of Python baseline (concept query 1–2 ms, pattern query 1–2 ms).
- Session logs and Neo4j memories should note the rebuild and metric evidence for traceability.

## Cache directory policy (2025-10-30)
- Baseline metrics with Symfony demo confirm current ignore set (vendor, storage, var, bootstrap/cache) keeps parse time at 2 ms without starving first-party caches.
- Blanket `cache/` exclusion remains opt-in; framework-specific cache directories are already covered, avoiding false negatives for custom cache implementations.
- Watcher documentation updated to explain the rationale; revisit if future fixtures show pathological cache trees.

## Telemetry automation (scheduled)
- `.github/workflows/php-telemetry.yml` runs nightly at 06:00 UTC and on-demand, warming the sandbox PHP fixture before executing `scripts/run-php-telemetry.ts` with thresholds (`conceptsMs ≤ 10`, `PHP concepts ≥ 5`).
- Telemetry JSON artifacts upload under `php-telemetry/` for historical reference; failures surface in GitHub Actions with actionable error messages.
- Developers can reproduce locally via `npm run test:php-integration -- --group synthetic --fixture sandbox-php-sample` followed by `npx tsx scripts/run-php-telemetry.ts --project sandbox-php-sample --max-concepts-ms 10 --min-php-concepts 5`.
