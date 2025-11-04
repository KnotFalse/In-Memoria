# Project Intelligence MVP – Scope & Requirements (Workstream A1)

## Context
- **Current state:** In Memoria persistently captures semantic/pattern intelligence and now ships PHP support (0.4.7). Conversation memory, project blueprints, and work session tracking remain unimplemented (see `IMPLEMENTATION_PLAN_TEMP.md`).
- **Goal:** Provide AI agents with pre-computed project blueprints and resumable work context to eliminate token-heavy rediscovery and enable “just go” resumes.
- **Assumptions:** Data remains local (per `SECURITY.md`), MCP clients consume structured tool responses, and existing SQLite/SurrealDB infrastructure is reused.

## Stakeholders & Consumers
- **MCP clients** (Claude Desktop, Claude Code CLI, future agents) need low-latency blueprint/session APIs.
- **Repository maintainers** require observable migrations and predictable opt-in/rollout controls.
- **Developers/teams** expect privacy guarantees and the ability to export/import `.in-memoria.db` assets.

## Success Metrics
- Resume workflow restores active work context in ≤100 tokens for stored sessions.
- Cold start blueprint request returns tech stack + entry points within ≤200 tokens.
- Blueprint generation completes under 5 seconds on reference fixtures (sandbox samples, Laravel demo).
- All new MCP tool calls adhere to existing error-handling conventions (structured failures, Zod validation).
- Backwards compatibility: existing 17 tools remain functional with feature flag disabled.

## Data Boundaries
- **Project blueprint data:** project name, tech stack, primary entry points, key directories, feature-to-file mappings.
- **Work session data:** active files, pending/completed tasks (agent-provided), blockers, timestamped notes.
- **Decision history:** key/value pairs plus rationale (optional text up to 512 chars).
- **Exclusions:** raw source text, sensitive credentials, user prompts/responses beyond structured summaries.
- **Retention:** Local SQLite tables; optional SurrealDB vector metadata flagged `category: "blueprint"` for search, no remote sync.

## Dependencies & Interfaces
- **SQLite migrations:** additive schema for `project_blueprints`, `feature_map`, `work_sessions`, `project_decisions`.
- **SurrealDB metadata:** ensure embeddings store `language`, `feature`, `project_path`.
- **TypeScript engines:** new orchestration layer for blueprint extraction (leveraging filesystem analysis + Composer parsing) and session capture hooks in watcher/change analyzer.
- **MCP tools/CLI:** `project_intelligence.*`, `work_memory.*`, and CLI shortcuts for manual inspection.

## Risks & Mitigations
- **Scope creep:** Limit MVP to read/write of structured metadata; deeper semantic inference handled later.
- **Staleness:** schedule incremental refresh triggered by watcher change events; provide manual `--refresh-blueprint` CLI.
- **Performance regression:** reuse existing ignore heuristics; apply rate limiting on blueprint recompute.
- **Privacy concerns:** document stored fields in README/SECURITY; gate behind `enableProjectMemory` config flag for phased rollout.

## Open Questions
1. Should feature detection seed from existing semantic concepts (class/function stats) to avoid duplicate parsing?
2. How to merge manual agent-provided task lists with automatic change detection (source of truth)?
3. What retention/expiry policy should apply to dormant work sessions? (e.g., auto-archival after 30 days)
4. Do we expose blueprint diffs between runs, or just overwrite baseline?

## Next Actions
1. Finalise data model diagrams (ERD) and confirm with maintainers (Workstream A2 input). ✅ (see `docs/diagrams/project-intelligence-erd.mmd`)
2. Draft acceptance test scenarios (integration harness) for blueprint + session resume flows. ✅ (`src/__tests__/project-intelligence.test.ts`)
3. Align feature flag configuration name and default rollout (docs + config schema). ✅ (`IN_MEMORIA_DISABLE_PROJECT_INTEL`)
4. Integrate ERD and release steps into `docs/release-checklist.md` (ensure future releases follow blueprint QA). ⏳

## Status (2025-10-30)
- ✅ Migration v5 adds `project_blueprints`, `feature_map`, `work_sessions`, `project_decisions`.
- ✅ `ProjectIntelligenceEngine` populates blueprints via `learn` flow and watcher activity tracks edited files in a default session.
- ✅ MCP tools (`project_intelligence.*`, `work_memory.*`) and CLI (`in-memoria blueprint`) surface the data for agents and humans.
- ✅ Integration tests cover blueprint + MCP flows (`src/__tests__/project-intelligence.test.ts`).
- ✅ Feature toggle `IN_MEMORIA_DISABLE_PROJECT_INTEL` documented and respected across CLI/MCP entry points.
- ✅ Release checklist updated (`docs/release-checklist.md`).
- ⏳ Perform final QA sign-off (run blueprint tests, capture release checklist evidence) before closing Workstream A.
