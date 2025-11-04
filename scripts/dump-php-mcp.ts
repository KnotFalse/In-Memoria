import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { SQLiteDatabase } from '../src/storage/sqlite-db.js';
import { SemanticVectorDB } from '../src/storage/vector-db.js';
import { SemanticEngine } from '../src/engines/semantic-engine.js';
import { PatternEngine } from '../src/engines/pattern-engine.js';
import { CoreAnalysisTools } from '../src/mcp-server/tools/core-analysis.js';
import { MonitoringTools } from '../src/mcp-server/tools/monitoring-tools.js';
import { IntelligenceTools } from '../src/mcp-server/tools/intelligence-tools.js';

async function main(): Promise<void> {
  const [inputPath, outputDirArg, searchTerm] = process.argv.slice(2);
  if (!inputPath) {
    console.error('Usage: bunx tsx scripts/dump-php-mcp.ts <project-path> [output-dir] [search-term]');
    process.exit(1);
  }

  const projectPath = resolve(process.cwd(), inputPath);
  const outputDir = resolve(process.cwd(), outputDirArg ?? 'tmp/mcp-results');
  mkdirSync(outputDir, { recursive: true });

  const dbPath = `${projectPath}/in-memoria.db`;
  const database = new SQLiteDatabase(dbPath);
  const vectorDB = new SemanticVectorDB(process.env.OPENAI_API_KEY);
  const semanticEngine = new SemanticEngine(database, vectorDB);
  const patternEngine = new PatternEngine(database);
  const coreTools = new CoreAnalysisTools(semanticEngine, patternEngine, database);
  const monitoringTools = new MonitoringTools(semanticEngine, patternEngine, database);
  const intelligenceTools = new IntelligenceTools(semanticEngine, patternEngine, database, vectorDB);

  try {
    // Ensure intelligence exists
    await semanticEngine.learnFromCodebase(projectPath);
    await patternEngine.learnFromCodebase(projectPath);

    const structure = await coreTools.getProjectStructure({ path: projectPath, includeTemplates: false });
    const structurePath = resolve(outputDir, 'project-structure.json');
    writeFileSync(structurePath, JSON.stringify(structure, null, 2), 'utf-8');

    const performance = await monitoringTools.getPerformanceStatus({ runBenchmark: false });
    const performancePath = resolve(outputDir, 'performance.json');
    writeFileSync(performancePath, JSON.stringify(performance, null, 2), 'utf-8');

    const developerProfile = await intelligenceTools.getDeveloperProfile({ includeRecentActivity: true });
    const profilePath = resolve(outputDir, 'developer-profile.json');
    writeFileSync(profilePath, JSON.stringify(developerProfile, null, 2), 'utf-8');

    const search = await coreTools.searchCodebase({ query: searchTerm ?? 'class', type: 'text', limit: 10 });
    const searchPath = resolve(outputDir, 'search.json');
    writeFileSync(searchPath, JSON.stringify(search, null, 2), 'utf-8');

    console.log(`Wrote MCP tool outputs to ${outputDir}`);
  } finally {
    semanticEngine.cleanup();
    await vectorDB.close();
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
