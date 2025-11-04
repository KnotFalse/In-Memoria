# MCP Tool Usage Summary (2025-10-30)

This document collects call-frequency data from the new `tool_usage` table. Generate summaries with:

```bash
npx tsx scripts/summarize-tool-usage.ts /path/to/project --limit 20
```

## Example (sandbox demo)

```
$ npx tsx -e "import { SQLiteDatabase } from './src/storage/sqlite-db.ts'; const db = new SQLiteDatabase('./tmp/tool-usage-demo.db'); db.recordToolInvocation('analyze_codebase'); db.recordToolInvocation('analyze_codebase'); db.recordToolInvocation('get_project_structure'); console.table(db.getToolUsageSummary(10)); db.close();"
┌──────────────────────┬────────────┐
│      (index)         │ invocations│
├──────────────────────┼────────────┤
│ analyze_codebase     │     2      │
│ get_project_structure│     1      │
└──────────────────────┴────────────┘
```

Populate this table with real-call data from staging/production databases to inform the consolidation RFC.
