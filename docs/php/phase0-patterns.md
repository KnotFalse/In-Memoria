# Phase 0 – Pattern Learner & Persistence Assessment

## Data Flow Recap

1. **TypeScript PatternEngine** – `src/engines/pattern-engine.ts` wraps the napi `PatternLearner`, using the shared language registry for detection and falling back to heuristic analysis when Rust fails (`src/engines/pattern-engine.ts:24-128`). PHP now routes through the registry even before parser support lands.
2. **napi PatternLearner** – `rust-core/src/patterns/mod.rs` exposes `PatternLearner` that orchestrates naming, structural, and implementation analyzers. `learn_from_codebase` aggregates findings into `Pattern` structs returned through napi (`rust-core/src/patterns/mod.rs:26-123`).
3. **Specialized Analyzers** – Naming rules now cover JS/TS, Rust, Python, and PHP (`rust-core/src/patterns/naming.rs:32-118`). Structural/implementation modules remain largely language-agnostic but will need PHP node mappings once a PHP extractor exists.
4. **Persistence** – Pattern results are persisted using `SQLiteDatabase.insertDeveloperPattern` (`src/storage/sqlite-db.ts:92-126`). Semantic concepts use JSON columns for relationships and line ranges (`src/storage/schema.sql:4-25`), enabling richer PHP-specific metadata without schema changes.
5. **Vector Search** – When enabled, `SemanticVectorDB.storeCodeEmbedding` records `metadata.language` (`src/storage/vector-db.ts:16-84, 128-154`). PHP support must ensure embeddings carry the correct language tag for downstream filters.

## Schema Readiness

- SQLite tables store JSON for pattern contents, contexts, and semantic relationships; no rigid enum blocks that would block PHP-specific details (`src/storage/schema.sql:4-64`).
- Migrations 1–4 already exist (`src/storage/migrations.ts:32-161`). Adding PHP-specific columns is unnecessary if we encode data in existing JSON fields. Any new metrics (e.g., attribute usage percentages) can live in JSON payloads.
- No dedicated “language” column per pattern—language association comes from context or metadata. We may want to embed language tags inside `pattern_content` JSON when implementing PHP to support mixed-language repos.

## Gaps to Address Before PHP Integration

1. **Structural Analyzers** – Confirm structural/pattern modules handle traits, enums, attributes, and promoted properties once the PHP extractor emits those semantic nodes.
2. **Docblock Considerations** – PHP projects often rely on annotations for types. Decide whether to parse docblocks within the extractor or treat them as lower-confidence hints for the learner (see Step 3 of php-integration plan).
3. **Vector Metadata** – Ensure PHP embeddings set `metadata.language = 'php'` to avoid being lumped into `unknown`.

## Recommended Pre-Step 1 Tasks

- Add regression coverage for the PHP naming rules to ensure extractor output feeds the learner as expected (tests exist; expand with real fixtures once parser lands).
- Evaluate whether existing JSON schema should include explicit language tags for developer patterns; if yes, plan migration (could be additive column with default `NULL`).

## Risks

- **Inference noise**: Without docblock parsing, PHP code with dynamic magic methods may produce weak signals; plan fallback heuristics.
- **Schema ambiguity**: Present schema does not enforce language separation. Ensure integration updates include filters to avoid cross-language contamination in dashboards.
- **Performance**: Adding docblock parsing could be expensive; measure during Step 3 with `get_performance_status`.
