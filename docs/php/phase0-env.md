# Phase 0 – Environment Readiness Report

| Tool | Detected Version | Meets Requirements? | Notes |
| --- | --- | --- | --- |
| Node.js | v20.11.1 (`node -v`) | ✅ (requires ≥18, plan suggests 20+) | On target. |
| npm | 10.2.4 (`npm -v`) | ✅ | Matches Node 20 tooling. |
| Rust | rustc 1.90.0 (`rustc -V`) | ✅ (requires ≥1.70) | Cargo 1.90.0 (`cargo -V`) in sync. |
| tree-sitter CLI | Managed via `tree-sitter-cli@0.22.5` | ✅ | `npm run verify:tree-sitter` checks for the CLI; CI installs it globally (`npm install -g tree-sitter-cli@0.22.5`). Devs should run the same command locally before parser work. |
| Composer | 2.7.7 (`composer --version`) | ⚠️ | Emits PHP 8.4 deprecation notices for `E_STRICT`; acceptable but noisy. Ensure PHP 8.4 compatibility or pin prior minor release if needed for tests. |
| PHP | 8.4.13 (reported via Composer) | ✅ | Modern enough for attributes, enums, promoted properties. |

## Actions

1. **tree-sitter CLI** – Use `npm install -g tree-sitter-cli@0.22.5` (also run automatically in CI) and verify via `npm run verify:tree-sitter`.
2. **Composer warning** – Investigate `E_STRICT` deprecation notice; may need to update Composer phar or adjust PHP configuration to suppress during automated runs.
3. **CI parity** – Confirm CI images provide the same versions; add verification script to pipeline to prevent drift.
