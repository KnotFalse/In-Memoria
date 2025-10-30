# Real-world Fixture Management

We keep several production-grade PHP repositories as Git submodules under `tests/fixtures/realworld/` for smoke testing the PHP integration harness.

## Current Snapshot

| Fixture | Repo | Commit | Last refreshed | Refresh if after |
| --- | --- | --- | --- | --- |
| WooCommerce | https://github.com/woocommerce/woocommerce | 627c9189ae6553fc4b16d1497904a0c4e0b4c018 | 2025-10-23 | 2026-01-23 |
| Elementor | https://github.com/elementor/elementor | 5fb99ad0ba7f44dab437116b0249d63265f2ec3c | 2025-10-23 | 2026-01-23 |
| Koel | https://github.com/koel/koel | 6cf7420f52060d668b1747d74b5f319e328f61c9 | 2025-10-23 | 2026-01-23 |
| Symfony Demo | https://github.com/symfony/demo | b388edaa15a6b41de9ec066b3ced1c878717dd60 | 2025-10-23 | 2026-01-23 |
| phpMyAdmin | https://github.com/phpmyadmin/phpmyadmin | 57aee0f7021fe714b24196416e00e82d4d33c92f | 2025-10-23 | 2026-01-23 |

> **Note:** “Refresh if after” is a quarterly cadence (Last refreshed + 3 months). Adjust the date if the ecosystem requires faster updates.

## Refresh Procedure

1. Pull the latest default branch of each submodule:
   ```bash
   git submodule update --remote --depth 1 tests/fixtures/realworld/<name>
   ```
2. Update `tests/fixtures/realworld/fixtures.json` with new commit hashes or root adjustments if the project layout changed.
3. Re-run the harness to collect metrics:
   ```bash
   npm run test:php-integration -- --group realworld --fixture <comma-separated fixtures>
   ```
   Save the resulting `tmp/metrics/php-integration-report.json` snapshot (use it to update `docs/benchmarks/php.md`).
4. Update the table above with the new commit, “Last refreshed” date (YYYY-MM-DD), and “Refresh if after” (last date + 3 months).
5. Commit the submodule pointer changes, manifest updates, and refreshed documentation.
