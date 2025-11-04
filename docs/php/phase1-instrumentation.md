# PHP Integration – Phase 1 Step 6 Status (Rebuild & Telemetry)

_Last verified: 2025-11-03_

## Current state
- `bun run build:rust` now executes successfully in the primary development environment and produces the PHP-aware N-API bundle (`napi build --platform --release --features napi-bindings`).
- `cargo test --features all-languages` passes without requiring `--no-default-features`; the default feature set keeps N-API bindings disabled for unit builds while the npm scripts re-enable them for distribution.
- `SemanticAnalyzer::learn_from_codebase` now extracts five PHP concepts for the sandbox fixture after expanding the sample code; telemetry thresholds have been aligned to the ≥5 concept baseline.
- Language registry + watcher defaults treat PHP as parser-supported and exclude Composer/cache artifacts by default (`composer.lock`, `vendor/**`, `bootstrap/cache/**`, etc.).
- Fresh smoke captures live under `tmp/metrics/php-smoke.json` and `tmp/metrics/python-smoke.json`; rerun with `bunx tsx scripts/capture-performance-status.ts` after forcing a rebuild to refresh baselines.
- Curated real-world fixtures (symfony-demo, koel, wooCommerce, elementor, phpmyadmin) live under `tests/fixtures/php/` and produce 2–8 PHP concepts each for regression harness runs.

## Rebuild checklist (repeatable)
1. Ensure dependencies are installed (`npm install` / `bun install`) and `@napi-rs/cli` is available.
2. Run `bun run build:rust` (delegates to `npm --prefix rust-core run build`, invoking `napi build --platform --release --features napi-bindings`).
3. Re-run targeted verification:
   - `bunx tsx scripts/capture-performance-status.ts sandbox-php-sample tmp/metrics/php-smoke.json`
   - `bunx tsx scripts/capture-performance-status.ts sandbox-python-sample tmp/metrics/python-smoke.json`
   - `cargo test --features all-languages`
   - Optionally `bunx vitest run src/__tests__/php-integration.test.ts`
   - (All commands fall back to `npx` automatically when Bun is unavailable.)
4. Commit updated native artifacts (`rust-core/index.js`, `index.d.ts`, platform binaries) when cutting a release.

## Validation expectations
- `get_performance_status` lists PHP in `conceptsByLanguage` (current baseline: 5 concepts) and returns concept/pattern query timings parity with Python (1 ms each).
- Comparative captures keep PHP performance within ±10 % of the Python baseline (`npx tsx scripts/compare-language-metrics.ts tmp/metrics/php-smoke.json tmp/metrics/python-smoke.json 10`).
- Session logs and Neo4j memories should note the rebuild and metric evidence for traceability.

## Cache directory policy (2025-10-30, revisited 2025-11-03)
- Baseline metrics with Symfony demo confirm current ignore set (vendor, storage, var, bootstrap/cache) keeps parse time low without starving first-party caches.
- Rust-side filters (`rust-core/src/types/config.rs`) already skip generic `cache` paths; TypeScript watcher remains narrow so agents can opt in when projects store source under `cache/`.
- Watcher documentation updated to explain the rationale; revisit if future fixtures show pathological cache trees.

## Telemetry automation (scheduled)
- `.github/workflows/php-telemetry.yml` runs nightly at 06:00 UTC and on-demand, warming the sandbox PHP fixture before executing `scripts/run-php-telemetry.ts` with thresholds (`conceptsMs ≤ 10`, `PHP concepts ≥ 5`). The sandbox fixture now satisfies the concept-count check.
- Telemetry JSON artifacts upload under `php-telemetry/` for historical reference; failures surface in GitHub Actions with actionable error messages.
- Developers can reproduce locally via `npx tsx scripts/php-integration-check.ts --group synthetic --fixture sandbox-php-sample` followed by `npx tsx scripts/run-php-telemetry.ts --project sandbox-php-sample --max-concepts-ms 10 --min-php-concepts 5`.
