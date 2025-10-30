# PHP Integration Benchmarks

> **Note:** Commands use `bunx`. If Bun is not installed, replace with `npx`; the automation scripts auto-detect and fall back to `npx` when invoked directly.

## Metric Capture (2025-10-23)

| Metric | PHP (`sandbox-php-sample`) | Python baseline (`sandbox-python-sample`) | Δ |
| --- | --- | --- | --- |
| Concept query time | 2 ms | 1 ms | +1 ms (within ±10 % guard; absolute 1 ms) |
| Pattern query time | 1 ms | 2 ms | −1 ms |
| Concepts recorded | 12 | 3 | n/a (fixture-dependent) |

- Commands  
  1. `bunx tsx src/index.ts learn sandbox-php-sample --yes`  
  2. `bunx tsx scripts/capture-performance-status.ts sandbox-php-sample tmp/metrics/php-smoke.json`  
  3. `bunx tsx src/index.ts learn sandbox-python-sample --yes`  
  4. `bunx tsx scripts/capture-performance-status.ts sandbox-python-sample tmp/metrics/python-smoke.json`  
  5. `bunx tsx scripts/compare-language-metrics.ts tmp/metrics/php-smoke.json tmp/metrics/python-smoke.json 10`

- Result: PHP metrics now populate via rebuilt native module; comparison remains inside the ±10 % tolerance with the 1 ms absolute guard for low-latency counters.

Fixtures referenced: see `docs/benchmarks/fixtures.md`.

## QA Harness

- Command: `npm run test:php-integration`
- Script: `scripts/php-integration-check.ts`
- Output: per-fixture metrics in `tmp/metrics/*.json` and aggregate report `tmp/metrics/php-integration-report.json`
- Fixture coverage: sandbox PHP sample, Laravel demo, Symfony demo, WordPress demo, and Python baseline

## Real-world Fixture Smoke (2025-10-23)

| Fixture (root) | Commit | PHP concepts | Concept query time | Notes |
| --- | --- | --- | --- | --- |
| WooCommerce (`src/Admin`) | 627c9189ae6553fc4b16d1497904a0c4e0b4c018 | 1,294 | 5 ms | Focuses on WooCommerce admin classes. |
| WooCommerce (`src/Internal`) | 627c9189ae6553fc4b16d1497904a0c4e0b4c018 | 2,128 | 7 ms | Internal container/services coverage. |
| Elementor (`core`) | 5fb99ad0ba7f44dab437116b0249d63265f2ec3c | 419 | 2 ms | Core infrastructure without template opt-in. |
| Elementor (`includes`) | 5fb99ad0ba7f44dab437116b0249d63265f2ec3c | 373 | 2 ms | Module bootstrap files (templates skipped by default). |
| Koel (`app`) | 6cf7420f52060d668b1747d74b5f319e328f61c9 | 1,773 | 9 ms | Laravel application logic (controllers, jobs, listeners). |
| Symfony Demo (`.`) | b388edaa15a6b41de9ec066b3ced1c878717dd60 | 102 | 1 ms | Includes Twig templates via harness opt-in. |
| phpMyAdmin (`src`) | 57aee0f7021fe714b24196416e00e82d4d33c92f | 1,595 | 5 ms | Procedural/OO hybrid code, templates excluded by default. |
| phpMyAdmin (`app`) | 57aee0f7021fe714b24196416e00e82d4d33c92f | 14 | 1 ms | Console app bootstrap, minimal surface area. |

Run selectively with `npm run test:php-integration -- --group realworld --fixture <name>`; fixtures and roots are defined in `tests/fixtures/realworld/fixtures.json`.

## MCP Evidence (2025-10-30)

- `docs/benchmarks/php-mcp/laravel-demo/` contains `project-structure.json`, `performance.json`, `developer-profile.json`, and `search.json` captured via `bunx tsx scripts/dump-php-mcp.ts tests/fixtures/php/laravel-demo docs/benchmarks/php-mcp/laravel-demo controller`.
- Use these artifacts to verify PHP-specific metrics (composer namespaces, `% typed methods`, search coverage) when auditing MCP responses.
