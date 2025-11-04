# In Memoria → PHP: Research & Integration Plan (consequential & agent-ready)

_Additions emphasize concrete touchpoints, sequencing, automation, and acceptance signals drawn from the current codebase and docs._

---

## 0) Anchors & Preconditions (✅ completed 2025-10-16)
- **Architecture**: TypeScript MCP server (`src/mcp-server/*`) ⇄ napi bindings (`rust-core/src/lib.rs`) ⇄ Rust engines (`rust-core/src/{parsing,patterns,analysis}`) ⇄ SQLite + embedded SurrealDB (see `schemas/` + `src/storage`). All flows are local-first per `README.md` and `SECURITY.md`.
- **Supported surfaces**: `ParserManager` in `rust-core/src/parsing/manager.rs` registers 11 languages; extractors live in `rust-core/src/extractors`; TypeScript detection/filtering starts in `src/watchers/file-watcher.ts` and feeds MCP tools like `analyze_codebase` in `src/mcp-server/tools/core-analysis.ts`.
- **Motivation**: PHP ecosystems (Laravel/Symfony/WordPress) provide regular naming and directory conventions—ideal signal for the Pattern Learner described in `TODO.md` and `IMPLEMENTATION_PLAN_TEMP.md`.

_Environment readiness_: Node.js ≥20, Rust ≥1.70, tree-sitter CLI for regenerating node maps, Composer (optional) for sample repos.

_Scope guard_: PHP should become a first-class citizen with the **same** capabilities other supported languages enjoy—no bespoke extras. Every addition below maps directly to parity gaps (parser wiring, extractor export, TypeScript routing, telemetry).

---

## 1) Repository Recon (align intent with code)
**Goal**: Produce a one-pager describing where PHP threads into the stack.

**Concrete reads**
1. `README.md` → confirm 17 MCP tools; list ones exposing language info (`analyze_codebase`, `learn_codebase_intelligence`, `get_performance_status`, `search_codebase`).
2. `rust-core/src/parsing/manager.rs` → locate parser registry, `ParserManager::available_languages`, query initialization.
3. `rust-core/src/extractors/mod.rs` → see how new extractors register; use existing language extractor as pattern.
4. `rust-core/src/patterns/*` → identify metrics consumers (naming frequencies, typed signatures).
5. `src/watchers/file-watcher.ts`, `src/engines/*` → observe ignored patterns, language inference, timeout enforcement.
6. `src/storage/sqlite/*` + `schemas/` → note tables storing per-language intelligence (for doc updates).

**Done when**: you can list, in ≤1 page, the exact file/function to touch for parser registration, extractor wiring, TypeScript discovery, and MCP surfacing. Share internally with agents.

---

## 2) AST Integration (✅ completed 2025-10-16)
_Status_: `tree-sitter-php` wired behind feature flag, ParserManager exposes PHP, and pure-rust tests cover parser initialization.

1. **Dependency**: add `tree-sitter-php` to `rust-core/Cargo.toml`; gate behind optional `php` feature if needed (`[features] php = ["tree-sitter-php"]`).
2. **Parser registry**: extend `initialize_parsers` and `get_tree_sitter_language` in `rust-core/src/parsing/manager.rs` with `"php"` → `LANGUAGE_PHP`; ensure `available_languages()` reflects the addition.
3. **Query setup**: decide whether PHP gets reusable queries (e.g., functions/classes). Extend `initialize_queries` if needed or mark TODO.
4. **Smoke tests**: add `#[cfg(test)]` cases to cover successful parse and error recovery (`<?php` snippet with namespace, class, attribute).

---

## 3) Extractor & Pattern Learner Extensions (✅ completed 2025-10-16)
_Status_: PHP extractor emits concepts (class/trait/method/docblocks), naming/pattern engines updated for language tagging, and unit tests cover trait detection and consolidation.

1. **New extractor**: add `php.rs` in `rust-core/src/extractors`, register in `mod.rs`. Map node kinds → `SemanticConcept` categories (class, trait, interface, enum, function, method, property, const, namespace, use). Reuse `NameExtractor`.
2. **Pattern hooks**: update naming/signature collectors in `rust-core/src/patterns/*` to record typed parameters, union/intersection, attributes, promoted properties.
3. **Docblock parsing (optional)**: capture phpDoc metadata with lower confidence if type hints missing.
4. **Unit tests**: add fixtures covering namespaces, classes, traits, enums, closures, `match`, promoted properties, attributes; use `PHP_NODE_TYPES`.

---

## 4) TypeScript Layer – Detection, Filtering, Heuristics (✅ composer insights + template toggle completed 2025-10-16)
1. **File extensions**: update `src/watchers/file-watcher.ts` (language map, text extensions) to include `.php`, `.phtml`, `.inc`; define template bucket for `.blade.php`, `.twig`, `.phtml` (size threshold).
2. **Ignored directories**: extend default ignore arrays with `vendor/`, `storage/`, `cache/`, `var/`, `bootstrap/cache/`, `composer.lock`, `*.min.php`. *(✅ 2025-10-20: watcher defaults now skip `vendor/`, `storage/`, `var/`, `bootstrap/cache/`, `composer.lock`, `*.min.php`; left blanket `cache/` unset to avoid dropping first-party caches—document decision if this remains intentional.)*
3. **Composer PSR-4 parsing**: implement helper (e.g., `src/utils/composer.ts`) to parse `composer.json`. Feed namespace→path mapping into `get_project_structure` and learning prioritization (align with `IMPLEMENTATION_PLAN_TEMP` blueprint system). *(✅ composer insights wired into utilities, core analysis, semantic engine 2025-10-16)*
4. **Framework heuristics**: add scoring module to detect Laravel, Symfony, WordPress; store hints in analysis metadata without hard requirements. *(✅ composer-derived hints surfaced 2025-10-16; additional heuristics optional)*
5. **Template handling toggles**: expose CLI/MCP option (`--include-templates`) so advanced users can opt into Blade/Twig processing later. *(✅ CLI watcher flag and MCP tool option completed 2025-10-16)*

---

## 5) Storage & Intelligence Surfaces
- Ensure SQLite schemas storing language metrics accept PHP attributes (typedness %, attribute usage); add migrations if needed.
- Validate SurrealDB embedding handles `.php` documents; ensure ingestion tags PHP (check `src/storage/vector/*`).
- Update `IMPLEMENTATION_PLAN_TEMP.md` once table adjustments are known (particularly blueprint schema).

---

## 6) Performance, Timeouts, Circuit Breakers *(⚠️ metrics plumbing done 2025-10-17; awaiting native rebuild for live timings)*
1. **Reuse guards**: confirm PHP path uses existing timeout logic (see `rust-core/src/analysis/*` and orchestrators). Add per-language instrumentation.
2. **Metrics**: extend `get_performance_status` output with PHP parse count, avg parse time, error node ratio, skipped vendor files. *(✅ TS + napi plumbing merged; runtime still shows zeroed PHP metrics until the rebuilt `rust-core` binary ships.)*
3. **Vendor mitigation**: ensure early pruning in watchers; add fallback log instructing users on `--include-vendor`. *(✅ watcher defaults cover vendor/storage; Rust `AnalysisConfig` continues tracking vendor skips for telemetry.)*

---

## 7) QA Matrix & Automation
- **Unit**: `npm run test:unit`, `cargo test`, `cargo clippy`, plus new PHP-specific modules (`cargo test php::`).
- **Integration**: create script (e.g., `npm run test:php-integration`) that runs `learn_codebase_intelligence` against `laravel/laravel`, `symfony/skeleton`, sample WordPress plugin; verify heuristics and semantic search.
- **Benchmarks**: add PHP scenario to `npm run test:perf`; record baseline metrics in `docs/benchmarks`.

---

## 8) Tooling & Developer Experience
- Update `AGENTS.md`, `CONTRIBUTING.md`, possibly add `docs/php-integration.md` detailing heuristics, toggles, limitations.
- Consider optional pre-commit hook to verify `tree-sitter-php` ABI or regenerate node-kind enums if codegen is introduced.
- Ensure CLI help (`src/cli/*`) mentions PHP options and template toggles.

---

## 9) MCP Tool Surfacing
- Extend MCP tools in `src/mcp-server/tools`:
  - `analyze_codebase` → include PHP in language breakdown.
  - `get_developer_profile` → surface `% typed methods`, `% attribute usage`, framework hints.
  - `search_codebase` → confirm `.php` files indexed; update vector search ingestion if filter needed.
- Update `learn_codebase_intelligence` pipeline to ensure PHP metrics stored and reported.

---

## 10) Release & Rollout
1. **Feature flag** (optional): gate PHP support behind config until QA complete. *(Decision 2025-11-03: not pursuing; PHP now matches other languages and would gain no additional safeguards.)*
2. **Docs**: update `README.md`, `CHANGELOG.md`, add FAQ entry about Blade/Twig and vendor handling.
3. **Version bump**: plan minor release once parity achieved.

---

## 11) Risks, Mitigations, Monitors
| Risk | Mitigation | Monitor |
| --- | --- | --- |
| Tree-sitter ABI mismatch | Pin compatible versions; add compile-time checks | `cargo test` smoke tests |
| Vendor code ingestion | Default exclude; provide override with warning | File counts in `get_performance_status` |
| Template-heavy repos lose context | Template bucket + opt-in toggle | CLI logs & metrics |
| PHP 7-only codebases | Treat modern features as optional signals | Stats showing 0% typed features |
| Build size/time increase | Feature-gate; communicate to maintainers | CI artifact diff |

---

## 12) Acceptance Criteria
1. **AST**: PHP listed in `ParserManager::available_languages()`; `cargo test` PHP suite green.
2. **Detection**: `npx in-memoria learn ./sample-php` logs vendor exclusions; `get_project_structure` shows PSR-4 mappings. *(2025-11-03: see `docs/benchmarks/php-mcp/laravel-demo/project-structure.json`)*.
3. **Pattern Learner**: `get_developer_profile` on Laravel skeleton shows naming frequencies, typed signature ratio, attribute usage. *(2025-11-03: snapshot stored at `docs/benchmarks/php-mcp/laravel-demo/developer-profile.json`)*.
4. **Performance**: `get_performance_status` PHP metrics within ±10% of Python baseline.
5. **Docs**: README, CHANGELOG, AGENTS guide updated; new helper doc (if created) published.

---

## 13) Next Actions for Agents (2025-10-20 update)
1. Rebuild `rust-core` with the new metrics exports (`npm run build:rust` + `cargo test`) so PHP parse timings populate and Step 6 can close (Agent: Rust Core). *(✅ 2025-11-01: `npm run build:rust` succeeds; `cargo test` currently requires `--no-default-features --features all-languages` until napi linkage is disentangled in Step 2.)*
2. Decide whether to add a blanket `cache/` ignore or document why it remains opt-in; update docs if we keep the narrower set (Agent: TypeScript Server).
3. Stand up the Step 7 QA harness (`npm run test:php-integration` scaffolding + sample repos) once metrics flow is verified (Agent: QA/Bench). *(✅ 2025-11-03: Added npm script wrapping `scripts/php-integration-check.ts`; docs updated and command verified with synthetic fixtures.)*
4. Prep README/CHANGELOG/AGENTS updates to announce PHP parity after metrics + QA land (Agent: Docs).

---

## 14) Implementation Plan – 2025-11-01 (pending execution)

### Step 1 – Restore Python concept emission parity _(blocker for PHP comparatives)_
- [x] Design traversal that walks the Python syntax tree depth-first so `module` nodes delegate to child extraction.
- [x] Patch `PythonExtractor::extract_concepts` to recurse and surface concepts for classes/functions/assignments, mirroring the traversal strategy used by TypeScript/Rust extractors.
- [x] Re-ran `cargo test test_python_class_extraction test_python_function_extraction --features all-languages` (plus a decorator regression) to prove parity with default features enabled.

_Why_: PHP metrics are benchmarked against Python today; without a working Python baseline the pattern learner cannot validate PHP output. TypeScript/Rust already traverse their AST roots, so this restores parity rather than adding net-new capability.

### Step 2 – Re-enable Rust unit testing for language extractors _(ensures PHP coverage stays enforceable)_
- [x] Updated `rust-core/Cargo.toml` crate type to include `rlib` alongside `cdylib` and moved N-API activation behind the npm build scripts.
- [x] Verified the linker path by running focused suites (`cargo test test_python_class_extraction --features all-languages`) without `--no-default-features`.
- [x] Documented the new workflow in `docs/php/phase1-instrumentation.md` and the release checklist.

_Why_: All non-PHP languages relied on Rust unit tests for regression gating. Restoring the rlib keeps PHP’s extractor on equal footing with TypeScript, Rust, Go, etc., without adding extra functionality.

### Step 3 – Repair pattern engine regressions _(unblocks PHP pattern telemetry)_
- [x] Audited `rust-core/src/patterns/{naming,learning,implementation,prediction}.rs` and restored scoring/aggregation logic.
- [x] Reintroduced deterministic confidence math plus multi-suffix handling; added decorated-function coverage and PHP-aware naming contexts.
- [x] Expanded unit coverage (including PHP naming fixtures and decorated Python functions) and ran `cargo test --features all-languages patterns::` until green.
- [x] Confirmed pattern-learning APIs via the Rust suite; TypeScript harness remains pending but pattern surfaces now return data for PHP parity.

_Why_: PHP depends on pattern learning to reach “first-class” status. Other languages already expose pattern recommendations; fixing regressions brings PHP up to that same level rather than extending scope.

### Step 4 – Validate PHP telemetry & watcher heuristics _(locks parity signal)_
- [x] Re-ran `npm run test:php-integration -- --group synthetic --fixture sandbox-php-sample` after expanding the fixture (now five PHP classes + trait coverage).
- [x] Evaluate the `cache/` ignore question with fresh metrics; confirmed Rust-side filters already drop `cache` directories (see `rust-core/src/types/config.rs`), so TS watcher stays narrow (no concept regression observed when toggling) and plan documents the reasoning.
- [x] Compare PHP concept/perf stats against Python baseline (<±10 %) once telemetry has the required concept volume (currently blocked by the fixture shortfall). *(2025-11-03: `npx tsx scripts/compare-language-metrics.ts tmp/metrics/php-smoke.json tmp/metrics/python-smoke.json 10` → parity at 1 ms concept/pattern queries, 5 concepts each).*
- [x] Refresh real-world fixture metrics (`npm run test:php-integration -- --group realworld`) and update docs; curated fixtures restored under `tests/fixtures/php/*` with new metrics recorded 2025-11-04.

_Why_: Other supported languages already ship with stable telemetry and watcher heuristics. Confirming PHP’s numbers keeps it consistent with those standards without inventing new tooling.

### Step 5 – Documentation & communication sweep _(no new capability, just parity messaging)_
- [x] Updated `php-integration-plan.md` and `docs/php/phase1-instrumentation.md`; release checklist now references the unified `cargo test --features all-languages` run.
- [x] Neo4j memory MCP server confirmed available (query endpoints responding); docs updated to drop the temporary outage note.
- [x] Append session evidence to `agent-logs/` and keep AGENTS.md/testing guidance aligned.
- [ ] Trigger `php-telemetry` GitHub workflow after committing fixture refresh and archive the passing artifact (local script parity verified 2025-11-03).

_Why_: Every language addition has ended with doc/log updates; extending the same hygiene to PHP guarantees first-class stewardship without overshooting other language docs.
