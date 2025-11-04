import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { loadComposerJson, extractComposerInsights } from '../utils/composer.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { SemanticVectorDB } from '../storage/vector-db.js';
import { SemanticEngine } from '../engines/semantic-engine.js';
import { PatternEngine } from '../engines/pattern-engine.js';
import { CoreAnalysisTools } from '../mcp-server/tools/core-analysis.js';

interface RealWorldFixture {
  name: string;
  path: string;
  repo?: string;
  commit?: string;
  includeTemplates?: boolean;
}

const realworldConfigPath = resolve(process.cwd(), 'tests/fixtures/realworld/fixtures.json');
const realworldFixtures: RealWorldFixture[] = JSON.parse(
  readFileSync(realworldConfigPath, 'utf-8')
).map((entry: any) => ({
  name: entry.name,
  path: entry.path,
  repo: entry.repo,
  commit: entry.commit,
  includeTemplates: entry.includeTemplates ?? false
}));

function resolveFixture(name: string): RealWorldFixture {
  const fixture = realworldFixtures.find((entry) => entry.name === name);
  if (!fixture) {
    throw new Error(`Unable to find real-world fixture: ${name}`);
  }
  return {
    ...fixture,
    path: resolve(process.cwd(), fixture.path)
  };
}

describe('Real-world PHP fixtures', () => {
  describe('Composer metadata', () => {
    it('symfony-demo exposes PSR-4 namespace', () => {
      const { path } = resolveFixture('symfony-demo');
      const config = loadComposerJson(path);
      const insights = extractComposerInsights(config, path);

      expect(insights.namespaces['App\\']).toBeDefined();
      expect(insights.namespaces['App\\']).toContain('src/');
      expect(insights.priorityPaths.some((entry) => entry.relativePath === 'src/')).toBe(true);
    });

    it('koel exposes Laravel namespaces', () => {
      const { path } = resolveFixture('koel');
      const config = loadComposerJson(path);
      const insights = extractComposerInsights(config, path);

      expect(insights.namespaces['App\\']).toBeDefined();
      expect(insights.namespaces['Database\\Seeders\\']).toContain('database/seeders/');
      expect(insights.frameworkHints).toContain('laravel');
    });

    it('phpMyAdmin exposes PhpMyAdmin namespace', () => {
      const { path } = resolveFixture('phpmyadmin');
      const config = loadComposerJson(path);
      const insights = extractComposerInsights(config, path);

      const phpMyAdminPaths = insights.namespaces['PhpMyAdmin\\'] ?? [];
      const normalizedPaths = phpMyAdminPaths.map((entry) =>
        entry.endsWith('/') ? entry : `${entry}/`
      );
      expect(normalizedPaths).toContain('src/');
      expect(insights.frameworkHints).toContain('symfony');
    });
  });

  describe('Template inclusion toggles', () => {
    let tempDir: string;
    let database: SQLiteDatabase;
    let vectorDB: SemanticVectorDB;
    let semanticEngine: SemanticEngine;
    let patternEngine: PatternEngine;
    let coreTools: CoreAnalysisTools;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'php-realworld-'));
      const dbPath = join(tempDir, 'in-memoria.db');
      database = new SQLiteDatabase(dbPath);
      vectorDB = new SemanticVectorDB(process.env.OPENAI_API_KEY);
      vi.spyOn(vectorDB, 'initialize').mockResolvedValue(undefined);
      vi.spyOn(vectorDB as any, 'initializeLocalEmbeddings').mockResolvedValue(undefined);
      vi.spyOn(vectorDB, 'storeCodeEmbedding').mockResolvedValue();
      vi.spyOn(vectorDB, 'storeMultipleEmbeddings').mockResolvedValue();
      semanticEngine = new SemanticEngine(database, vectorDB);
      patternEngine = new PatternEngine(database);
      coreTools = new CoreAnalysisTools(semanticEngine, patternEngine, database);
    });

    afterEach(async () => {
      rmSync(tempDir, { recursive: true, force: true });
      await vectorDB.close();
      database.close();
    });

    it('symfony-demo only surfaces templates when includeTemplates is true', async () => {
      const { path } = resolveFixture('symfony-demo');
      const withoutTemplates = await coreTools.getProjectStructure({
        path,
        includeTemplates: false
      });
      const withTemplates = await coreTools.getProjectStructure({
        path,
        includeTemplates: true
      });

      const plainFiles = flattenPaths(withoutTemplates.structure);
      const templateFiles = flattenPaths(withTemplates.structure);

      expect(templateFiles.some((file) => file.endsWith('.twig'))).toBe(true);
      expect(plainFiles.some((file) => file.endsWith('.twig'))).toBe(false);
    });
  });
});

function flattenPaths(node: any, bucket: string[] = []): string[] {
  if (!node) {
    return bucket;
  }
  if (node.type === 'file' && typeof node.path === 'string') {
    bucket.push(node.path);
  } else if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => flattenPaths(child, bucket));
  }
  return bucket;
}
