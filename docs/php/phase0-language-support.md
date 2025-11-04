# Phase 0 – Supported Surface Audit

| Language | Tree-sitter parser (`rust-core/src/parsing/manager.rs`) | Extractor module (`rust-core/src/extractors`) | TS engines detect language? (`src/engines/*`) | Watcher detection (`src/watchers/file-watcher.ts`) | Notes |
| --- | --- | --- | --- | --- | --- |
| TypeScript | ✅ (`initialize_parsers` registers `typescript`) | ✅ `typescript.rs` | ✅ (`detectLanguageFromPath` -> `typescript`) | ✅ (`.ts/.tsx`) | Full pipeline implemented. |
| JavaScript | ✅ (`javascript`) | ⛔ (relies on TS extractor) | ✅ (`js/jsx`) | ✅ | Confirm JS concepts flow correctly via TS extractor; add explicit module? |
| Rust | ✅ | ✅ `rust.rs` | ✅ | ✅ | No issues noted. |
| Python | ✅ | ✅ `python.rs` | ✅ | ✅ | Extractor recently upgraded (see CHANGELOG 0.4.5). |
| SQL | ✅ | ✅ `sql.rs` | ✅ | ✅ | Detection uses shared registry; surfaced correctly. |
| Go | ✅ | ✅ `go.rs` | ✅ | ✅ | Complete. |
| Java | ✅ | ✅ `java.rs` | ✅ | ✅ | Complete. |
| C | ✅ | ⛔ (no `c.rs`; generic fallback) | ✅ | ✅ | Parser works; extractor remains generic. |
| C++ | ✅ | ✅ `cpp.rs` | ✅ | ✅ (`.cpp/.cc/.cxx`) | Detection now produces `cpp`; extractor intact. |
| C# | ✅ | ✅ `csharp.rs` | ✅ | ✅ (`.cs`) | Detection aligned; ensure extractor parity in Step 1 review. |
| Svelte | ✅ (`svelte`) | ✅ `svelte.rs` | ⛔ | ⛔ | Watcher ignores `.svelte`; need detection for parity. |
| Vue | ⛔ | ⛔ | ⛔ | ✅ (`.vue`) | Watcher may emit `vue` but parser stack lacks support. |
| PHP | ✅ | ✅ `php.rs` | ✅ | ✅ (`.php`, Composer-aware ignores) | Parser/extractor wired 2025-11-01 with registry + watcher parity; ensure telemetry keeps pace. |
| Others (Ruby, Swift, etc.) | ⛔ | ⛔ | ⛔ | ✅ | Watcher over-detects vs. core capabilities; expect filtering at change analyzer stage. |

## Key Observations

1. **Detection centralised** – `src/utils/language-registry.ts` now drives watchers, engines, and MCP tooling, and only enumerates languages backed by Tree-sitter/extractors plus the forthcoming PHP support.
2. **Extractor coverage still uneven** – C continues to rely on the generic extractor; PHP now has a dedicated pipeline that should be kept on par with TypeScript/Rust going forward.
3. **Tree-sitter coverage synchronized** – `ParserManager` and language registry both advertise PHP; monitor future language additions so detections remain centralised.
4. **Extractor gap for C** – Parser claims C support but lacks dedicated extractor (`rust-core/src/extractors/mod.rs`). Generic extractor likely backfills but may miss structure-specific metrics; consider whether to prioritize before or alongside other backlog items.
5. **Testing parity** – PHP fixtures/tests now exist (see `src/__tests__/php-integration.test.ts` and telemetry harness); keep them wired into CI once native binaries are regenerated.

## Immediate Follow-ups Before Step 1

- Ensure watcher patterns/text filters cover `.svelte`, `.phtml`, and other PHP templates where appropriate.
- Plan extractor improvements (C-specific, PHP forthcoming) to close remaining gaps.
- Document the language registry in contributor docs so new integrations stay aligned.
