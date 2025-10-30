# Tool Consolidation RFC – Outline (Workstream C)

## Context
- **Objective:** Evaluate MCP tool usage to determine candidates for consolidation and simplification ahead of the next release.
- **Scope:** Core analysis, intelligence, project-intelligence, and work-memory tools exposed via the MCP server.
- **Data caveat:** Local staging database `tmp/in-memoria.db` was seeded during this session to mirror representative patterns; replace with production/staging telemetry before finalizing the RFC.

## Telemetry Snapshot (seeded sample)
| Tool | Calls | Share |
| --- | --- | --- |
| analyze_codebase | 15 | 30.6 % |
| learn_codebase_intelligence | 7 | 14.3 % |
| search_codebase | 6 | 12.2 % |
| get_semantic_insights | 5 | 10.2 % |
| get_project_structure | 4 | 8.2 % |
| project_intelligence.get_blueprint | 4 | 8.2 % |
| work_memory.update_context | 3 | 6.1 % |
| get_performance_status | 2 | 4.1 % |
| get_system_status | 2 | 4.1 % |
| auto_learn_if_needed | 1 | 2.0 % |

*Action: rerun `npx tsx scripts/summarize-tool-usage.ts <staging-db> --limit 50` with real telemetry and refresh the table above.*

## Preliminary Observations
- **Core analysis dominates:** `analyze_codebase`, `learn_codebase_intelligence`, and `search_codebase` account for ≈57 % of invocations, confirming they must remain first-class.
- **Status tooling overlap:** `get_system_status` and `get_performance_status` surface similar health metrics; consider merging into a single `monitoring.get_status` endpoint with optional detail levels.
- **Low-frequency automation:** `auto_learn_if_needed` appears rarely; validate whether the functionality is redundant now that most clients trigger `learn_codebase_intelligence` directly.
- **Project intelligence usage emerging:** `project_intelligence.get_blueprint` and `work_memory.update_context` have non-trivial hits, implying consolidation proposals must preserve their ergonomics (e.g., bundling resume/update operations).

## Candidate Consolidation Ideas
1. **Status API Merge**  
   - Merge `get_system_status` + `get_performance_status` into `monitoring.get_status` with a `detailLevel` parameter.  
   - Benefit: removes duplicate wiring and reduces decision fatigue; ensures telemetry guardrails live under one schema.  
   - TODO: confirm consumers rely on the existing response shapes before deprecating.

2. **Learning Workflow Simplification**  
   - Evaluate folding `auto_learn_if_needed` into `learn_codebase_intelligence` with a boolean flag.  
   - Benefit: a single learning entry point and fewer validation schemas.  
   - Risk: clients that expect idempotent auto-learn semantics may need migration support.

3. **Blueprint + Session Bundling**  
   - Explore combining `project_intelligence.get_blueprint` and `work_memory.resume_session` into a `project_intelligence.resume` response that includes blueprint + active session snapshot.  
   - Benefit: common “resume work” scenario becomes one call; reduces redundant round-trips.  
   - Follow-up: ensure write operations (`work_memory.update_context`, `work_memory.record_decision`) stay separate to avoid accidental writes.

## Open Questions
- Which clients (Claude Desktop, CLI, internal agents) depend on the current separation of status and performance tools?
- Do any automation scripts still invoke `auto_learn_if_needed`, or can we sunset it?
- How do PHP monitoring workflows consume status endpoints—would consolidation affect alerting?
- Should blueprint/session bundling expose partial data if either subsystem is disabled (feature flag, disable project intelligence)?

## Next Steps
1. **Obtain real telemetry:** Export the staging `in-memoria.db` (or production snapshot) and regenerate the usage summary. Replace the table and note the data timestamp.
2. **Stakeholder interviews:** Schedule 30 min review with MCP client owners to confirm consolidation appetite and identify migration blockers.
3. **Draft RFC body:** Expand this outline with detailed API proposals, deprecation timelines, and migration guides once data + feedback are in hand.
4. **Testing impact analysis:** Map affected unit/integration tests (`src/__tests__/mcp-integration.test.ts`, CLI smoke) for each consolidation candidate.
5. **Comms plan:** Prepare changelog entries and README/AGENTS updates for any tool renames or removals.
