import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { SemanticVectorDB } from '../storage/vector-db.js';
import { SemanticEngine } from '../engines/semantic-engine.js';
import { PatternEngine } from '../engines/pattern-engine.js';
import { CoreAnalysisTools } from '../mcp-server/tools/core-analysis.js';
import { MonitoringTools } from '../mcp-server/tools/monitoring-tools.js';
import { IntelligenceTools } from '../mcp-server/tools/intelligence-tools.js';

function flattenPaths(node: any, results: string[] = []): string[] {
  if (!node) return results;
  if (node.type === 'file') {
    results.push(node.path);
  } else if (node.children) {
    node.children.forEach((child: any) => flattenPaths(child, results));
  }
  return results;
}

describe('PHP integration', () => {
  let tempDir: string;
  let projectDir: string;
  let database: SQLiteDatabase;
  let vectorDB: SemanticVectorDB;
  let semanticEngine: SemanticEngine;
  let patternEngine: PatternEngine;
  let coreTools: CoreAnalysisTools;
  let monitoringTools: MonitoringTools;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'php-integration-'));
    projectDir = join(tempDir, 'php-project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, 'src'), { recursive: true });
    mkdirSync(join(projectDir, 'resources/views'), { recursive: true });
    mkdirSync(join(projectDir, 'vendor/compiled'), { recursive: true });

    writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({
      name: 'acme/demo',
      description: 'Demo PHP project for tests',
      require: {
        'laravel/framework': '^10.0'
      },
      autoload: {
        'psr-4': {
          'App\\\\': 'src/'
        }
      }
    }, null, 2));
    writeFileSync(join(projectDir, 'composer.lock'), JSON.stringify({ packages: [] }, null, 2));
    writeFileSync(join(projectDir, 'src', 'compiled.min.php'), '<?php // minified helper ?>');

    writeFileSync(join(projectDir, 'src', 'UserService.php'), `<?php
namespace App\\Service;

trait Loggable {}

/**
 * Find a user by id.
 *
 * @param int $id
 * @return ?User
 * @throws NotFoundException
 */
class UserService {
    use Loggable;

    public function findUser(int $id): ?User {
        return null;
    }
}
`);

    writeFileSync(join(projectDir, 'resources/views/example.blade.php'), `<div>{{ $user->name }}</div>`);
    writeFileSync(join(projectDir, 'vendor/compiled/cache.php'), '<?php return [];');

    database = new SQLiteDatabase(join(projectDir, 'in-memoria.db'));
    vectorDB = new SemanticVectorDB(process.env.OPENAI_API_KEY);
    semanticEngine = new SemanticEngine(database, vectorDB);
    patternEngine = new PatternEngine(database);
    coreTools = new CoreAnalysisTools(semanticEngine, patternEngine, database);
    monitoringTools = new MonitoringTools(semanticEngine, patternEngine, database);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts PHP composer insights and metadata', async () => {
    await semanticEngine.analyzeCodebase(projectDir);

    const phpFilePath = join(projectDir, 'src', 'UserService.php');
    const phpContent = readFileSync(phpFilePath, 'utf-8');
    const concepts = await semanticEngine.analyzeFileContent(phpFilePath, phpContent);
    expect(concepts.some(c => c.type === 'class' && c.name === 'UserService')).toBe(true);
    concepts.forEach(concept => {
      const conceptAny = concept as any;
      database.insertSemanticConcept({
        id: `${concept.filePath}:${concept.name}`,
        conceptName: concept.name,
        conceptType: concept.type,
        confidenceScore: concept.confidence,
        relationships: conceptAny.relationships || {},
        evolutionHistory: {},
        filePath: concept.filePath,
        lineRange: concept.lineRange
      });
    });

    const storedConcepts = database.getSemanticConcepts().filter(c =>
      c.filePath.endsWith('UserService.php')
    );
    expect(storedConcepts.length).toBeGreaterThan(0);
    const structure = await coreTools.getProjectStructure({ path: projectDir });
    expect(structure.summary.languages.php).toBeGreaterThan(0);
    expect(structure.summary.php?.composerNamespaces?.['App\\\\']).toEqual(['src/']);
    expect(structure.summary.php?.frameworkHints).toContain('laravel');
    const phpSummary: any = structure.summary.php;
    const priorityEntry = phpSummary?.priorityDirectories?.[0];
    expect(priorityEntry).toBeDefined();
    const normalizedPriorityPath = priorityEntry?.absolutePath.replace(/[\\/]+$/, '');
    expect(normalizedPriorityPath).toBe(join(projectDir, 'src'));

    const structureWithTemplates = await coreTools.getProjectStructure({ path: projectDir, includeTemplates: true });
    const filesWithoutTemplates = flattenPaths(structure.structure);
    const filesWithTemplates = flattenPaths(structureWithTemplates.structure);
    expect(filesWithoutTemplates.some(f => f.endsWith('example.blade.php'))).toBe(false);
    expect(filesWithTemplates.some(f => f.endsWith('example.blade.php'))).toBe(true);
    expect(filesWithoutTemplates.some(f => f.endsWith('composer.lock'))).toBe(false);
    expect(filesWithoutTemplates.some(f => f.endsWith('compiled.min.php'))).toBe(false);

    // Insert a representative developer pattern to exercise developer profile surfacing
    database.insertDeveloperPattern({
      patternId: 'php:naming:controller',
      patternType: 'naming',
      patternContent: { description: 'Controllers use PascalCase' },
      frequency: 4,
      contexts: ['App\\Service'],
      examples: [{ file: 'src/UserService.php', code: 'class UserService {}' }],
      confidence: 0.9
    });

    const intelligenceTools = new IntelligenceTools(semanticEngine, patternEngine, database, vectorDB);
    const developerProfile = await intelligenceTools.getDeveloperProfile({ includeRecentActivity: true });
    expect(developerProfile.preferredPatterns[0]?.pattern).toBe('php:naming:controller');
    expect(developerProfile.codingStyle.namingConventions.classes).toBe('PascalCase');

    const documentation = await coreTools.generateDocumentation({ path: projectDir, format: 'markdown' });
    expect(documentation.documentation).toContain('Composer PSR-4 Namespaces');

    const performance = await monitoringTools.getPerformanceStatus({ runBenchmark: false });
    expect(performance.success).toBe(true);
    expect(performance.performance.intelligence.conceptsByLanguage?.php).toBeDefined();
    expect(performance.performance.intelligence.php?.total).toBeGreaterThan(0);

    const storedEmbeddings: Array<{ language?: string; filePath?: string; className?: string }> = [];
    vi.spyOn(vectorDB, 'storeCodeEmbedding').mockImplementation(async (_code, metadata) => {
      storedEmbeddings.push(metadata);
      return Promise.resolve();
    });

    const persistConcept = (semanticEngine as any).persistConcept?.bind?.(semanticEngine);
    const classConceptSource = concepts.find(c => c.type === 'class' && c.name === 'UserService') || null;
    const canPersistConcept = Boolean(persistConcept && classConceptSource);

    if (persistConcept && classConceptSource) {
      await persistConcept({
        id: 'php-class-test',
        name: classConceptSource.name,
        type: classConceptSource.type,
        confidence: Math.max(classConceptSource.confidence, 0.9),
        filePath: classConceptSource.filePath,
        lineRange: classConceptSource.lineRange,
        relationships: (classConceptSource as any).relationships || {}
      }, { updateMetrics: true });

      const languageMetrics = semanticEngine.getLastLanguageMetrics();
      expect(languageMetrics?.conceptsByLanguage.php ?? 0).toBeGreaterThan(0);
      expect(languageMetrics?.filesByLanguage.php ?? 0).toBeGreaterThan(0);
      expect(languageMetrics?.analysisType).toBe('learning');

      expect(storedEmbeddings.length).toBeGreaterThan(0);
      expect(storedEmbeddings.some(meta => meta.language === 'php')).toBe(true);
      expect(storedEmbeddings.some(meta => meta.filePath?.endsWith('UserService.php'))).toBe(true);
      expect(storedEmbeddings.some(meta => meta.className === 'UserService')).toBe(true);
      const storedClassConcept = database.getSemanticConcepts().find(c => c.id === 'php-class-test');
      expect(storedClassConcept?.conceptName).toBe('UserService');
    }

    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);
      const searchResults = await coreTools.searchCodebase({ query: 'UserService', type: 'text', limit: 20 });
      expect(searchResults.results.some((result: any) => result.file.endsWith('UserService.php'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }

    const perfAfterLearning = await monitoringTools.getPerformanceStatus({ runBenchmark: false });
    const lastAnalysis = perfAfterLearning.performance.intelligence.lastAnalysis;
    expect(lastAnalysis.analysisType).toBe('learning');
    if (canPersistConcept && lastAnalysis.conceptsByLanguage?.php !== undefined) {
      expect(lastAnalysis.conceptsByLanguage.php).toBeGreaterThan(0);
    }
    if (Array.isArray(perfAfterLearning.performance.intelligence.perLanguage) && canPersistConcept) {
      expect(
        perfAfterLearning.performance.intelligence.perLanguage.some(
          (detail: any) => detail.language === 'php' && detail.filesAnalyzed > 0
        )
      ).toBe(true);
    }
  });
});
