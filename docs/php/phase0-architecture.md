# Phase 0 – Architecture Trace (MCP ⇄ napi ⇄ Rust ⇄ Storage)

## Overview

- **CLI entry point**: `src/index.ts` boots the MCP server, watchers, learning, and analysis commands. `runServer()` from `src/mcp-server/server.ts` is the production path for agents, while `learn/watch/analyze` commands instantiate the same engines and storage adapters for direct CLI use (`src/index.ts:7-119`).
- **MCP server wiring**: `CodeCartographerMCP` composes SQLite + SurrealDB-backed engines and tool collections (`src/mcp-server/server.ts:31-123`). `ListTools` and `CallTool` handlers dispatch to the tool collections via `routeToolCall`, enforcing Zod validation before execution (`src/mcp-server/server.ts:128-210`).
- **Tool layers**: Tool groups in `src/mcp-server/tools/` call the engines; e.g., `CoreAnalysisTools.analyzeCodebase` invokes `SemanticEngine.analyzeCodebase` and feeds results through persistence layers before returning metadata (`src/mcp-server/tools/core-analysis.ts:26-118`).
- **TypeScript ⇄ napi bridge**: Engines depend on napi bindings exported from `src/rust-bindings.ts`, which dynamically load platform-specific packages (`@in-memoria/<platform>`) or fall back to `rust-core/index.js`. Bound classes (`SemanticAnalyzer`, `PatternLearner`, `AstParser`) surface Rust functionality to TypeScript (`src/rust-bindings.ts:1-66`).
- **Rust core exposure**: `rust-core/src/lib.rs` re-exports analyzers and pattern learner with napi constructors, while `initCore` handles shared initialization. The analyzer delegates to modules in `rust-core/src/analysis`, `patterns`, and `parsing` (see module graph in `rust-core/src/lib.rs`).
- **Persistence path**: Engines receive a shared `SQLiteDatabase` (`src/storage/sqlite-db.ts`) and `SemanticVectorDB` (`src/storage/vector-db.ts`). Semantic results and patterns are written via DAO methods (e.g., `insertSemanticConcept`, `insertDeveloperPattern`) that apply migrations before first use (`src/storage/sqlite-db.ts:1-115`).
- **Watcher + Change analyzer**: CLI `watch` mode instantiates `ChangeAnalyzer` to combine semantic and pattern updates and persists deltas through the same database adapters (`src/index.ts:75-122`, `src/watchers/change-analyzer.ts`).

## Call Flow Snapshot

1. **Agent→MCP**: Client issues MCP tool call.
2. **MCP server**: `CodeCartographerMCP.routeToolCall` validates input and routes to the proper tool collection (`src/mcp-server/server.ts:164-210`).
3. **Tool collection**: Tool method (e.g., `CoreAnalysisTools.analyzeCodebase`) orchestrates request, invoking `SemanticEngine` and/or `PatternEngine` (`src/mcp-server/tools/core-analysis.ts:52-118`).
4. **TypeScript engine**: `SemanticEngine` lazily initializes `SemanticAnalyzer` via napi, executes Rust analysis, falls back to TS heuristics under circuit breaker, and caches results (`src/engines/semantic-engine.ts:1-170`).
5. **Rust core**: `SemanticAnalyzer` calls tree-sitter parsers and pattern modules (see `rust-core/src/analysis` and `rust-core/src/parsing/manager.rs`) then returns structured results through napi bindings (`rust-core/src/lib.rs` glue).
6. **Storage**: TypeScript engine persists or reads data through `SQLiteDatabase` (Better-SQLite3) and `SemanticVectorDB` (SurrealDB/OpenAI optional). Migrations ensure schema availability (`src/storage/sqlite-db.ts:1-172`, `src/storage/migrations.ts`).

## Findings / TODOs

- Tool groups share single engine/database instances; tracing confirmed no hidden dynamic wiring outside `CodeCartographerMCP`.
- Need follow-up verification that SurrealDB initialization covers PHP embeddings once new language tags arrive (see Phase 0 Step 3).
- Suggested diagram assets pushed here; stakeholders should review and sign off before Step 1.

