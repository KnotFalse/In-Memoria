import { resolve } from 'path';

import { SQLiteDatabase } from '../src/storage/sqlite-db.js';
import { config } from '../src/config/config.js';

function usage(): never {
  console.error('Usage: bunx tsx scripts/summarize-tool-usage.ts [project-path] [--limit N]');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let projectPath: string | undefined;
  let limit = 20;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--') && !projectPath) {
      projectPath = arg;
    } else if (arg === '--limit' && args[i + 1]) {
      limit = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      limit = Number(arg.split('=')[1]);
    } else {
      usage();
    }
  }

  const dbPath = config.getDatabasePath(projectPath ? resolve(process.cwd(), projectPath) : undefined);
  const database = new SQLiteDatabase(dbPath);
  try {
    const summary = database.getToolUsageSummary(limit);
    console.table(summary);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
