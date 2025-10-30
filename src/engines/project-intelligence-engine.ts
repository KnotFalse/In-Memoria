import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { CodebaseAnalysisResult } from './semantic-engine.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { extractComposerInsights, loadComposerJson } from '../utils/composer.js';

interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  main?: string;
  module?: string;
  exports?: Record<string, any> | string;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface BlueprintOptions {
  projectPath: string;
  semanticSummary?: CodebaseAnalysisResult;
}

export class ProjectIntelligenceEngine {
  constructor(private readonly database: SQLiteDatabase) {}

  async generateBlueprint(options: BlueprintOptions): Promise<void> {
    const root = resolve(options.projectPath);
    const pkg = this.loadPackageJson(root);
    const composerConfig = loadComposerJson(root);
    const composerInsights = extractComposerInsights(composerConfig, root);
    const semanticSummary = options.semanticSummary;

    const name = pkg?.name ?? basename(root);
    const description = pkg?.description ?? `Project intelligence blueprint for ${name}`;
    const techStack = this.deriveTechStack(semanticSummary, composerInsights, pkg);
    const entryPoints = this.deriveEntryPoints(root, pkg, composerInsights);
    const keyDirectories = this.deriveKeyDirectories(root, composerInsights);
    const architectureStyle = this.detectArchitectureStyle(composerInsights, pkg);
    const testingFramework = this.detectTestingFramework(pkg, composerConfig);
    const buildSystem = this.detectBuildSystem(pkg);
    const lastAnalyzed = new Date();

    this.database.upsertProjectBlueprint({
      projectPath: root,
      name,
      description,
      techStack,
      entryPoints,
      keyDirectories,
      architectureStyle,
      testingFramework,
      buildSystem,
      lastAnalyzed
    });

    const featureMappings = composerInsights.priorityPaths.map((priority) => ({
      projectPath: root,
      featureName: priority.namespace || 'root',
      primaryFiles: [priority.relativePath],
      relatedFiles: [],
      dependencies: [],
      status: 'active',
      notes: 'Composer PSR namespace mapping'
    }));

    if (featureMappings.length > 0) {
      this.database.replaceFeatureMap(root, featureMappings);
    }
  }

  recordFileActivity(projectPath: string, filePath: string): void {
    const sessionId = `watcher:${projectPath}`;
    const existing = this.database.getWorkSession(sessionId);
    const currentFiles = new Set<string>(existing?.currentFiles ?? []);
    currentFiles.add(filePath);

    this.database.upsertWorkSession({
      sessionId,
      projectPath,
      lastFeature: existing?.lastFeature ?? null,
      currentFiles: Array.from(currentFiles),
      completedTasks: existing?.completedTasks ?? [],
      pendingTasks: existing?.pendingTasks ?? [],
      blockers: existing?.blockers ?? [],
      sessionNotes: existing?.sessionNotes ?? null
    });
  }

  private loadPackageJson(projectPath: string): PackageJson | null {
    const candidate = join(projectPath, 'package.json');
    if (!existsSync(candidate)) return null;
    try {
      const raw = readFileSync(candidate, 'utf-8');
      return JSON.parse(raw) as PackageJson;
    } catch (error) {
      console.warn('⚠️  Failed to parse package.json:', error);
      return null;
    }
  }

  private deriveTechStack(
    summary: CodebaseAnalysisResult | undefined,
    composerInsights: ReturnType<typeof extractComposerInsights>,
    pkg: PackageJson | null
  ): string[] {
    const stack = new Set<string>();
    summary?.languages?.forEach((lang) => stack.add(lang));
    summary?.frameworks?.forEach((fw) => stack.add(fw));
    composerInsights.frameworkHints.forEach((fw) => stack.add(fw));

    const dependencies = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {})
    };
    if ('react' in dependencies) stack.add('react');
    if ('next' in dependencies) stack.add('nextjs');
    if ('@angular/core' in dependencies) stack.add('angular');
    if ('vue' in dependencies) stack.add('vue');

    return Array.from(stack);
  }

  private deriveEntryPoints(
    projectPath: string,
    pkg: PackageJson | null,
    composerInsights: ReturnType<typeof extractComposerInsights>
  ): Record<string, string> {
    const entryPoints: Record<string, string> = {};

    if (pkg?.main) entryPoints.main = pkg.main;
    if (pkg?.module) entryPoints.module = pkg.module;
    if (pkg?.scripts?.start) entryPoints.startScript = pkg.scripts.start;

    if (composerInsights.priorityPaths.length > 0) {
      const first = composerInsights.priorityPaths[0];
      entryPoints.namespaceRoot = first.relativePath;
    } else {
      const fallback = ['src/index.ts', 'src/main.ts', 'src/server.ts', 'app/Console/Kernel.php'];
      for (const candidate of fallback) {
        if (existsSync(join(projectPath, candidate))) {
          entryPoints.main = entryPoints.main ?? candidate;
          break;
        }
      }
    }

    // Detect common web entry point
    const publicIndexCandidates = ['public/index.php', 'public/index.html', 'public/main.php'];
    for (const candidate of publicIndexCandidates) {
      if (existsSync(join(projectPath, candidate))) {
        entryPoints.web = candidate;
        break;
      }
    }

    return entryPoints;
  }

  private deriveKeyDirectories(
    projectPath: string,
    composerInsights: ReturnType<typeof extractComposerInsights>
  ): Record<string, string> {
    const keyDirs: Record<string, string> = {};
    if (composerInsights.priorityPaths.length > 0) {
      for (const priority of composerInsights.priorityPaths) {
        keyDirs[priority.namespace || 'root'] = priority.relativePath;
      }
      return keyDirs;
    }

    const commonDirs = ['src', 'app', 'lib', 'server', 'packages'];
    for (const dir of commonDirs) {
      const full = join(projectPath, dir);
      if (existsSync(full) && statSync(full).isDirectory()) {
        keyDirs[dir] = dir;
      }
    }

    if (Object.keys(keyDirs).length === 0) {
      const entries = readdirSync(projectPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .slice(0, 3);
      for (const entry of entries) {
        keyDirs[entry.name] = entry.name;
      }
    }

    return keyDirs;
  }

  private detectArchitectureStyle(
    composerInsights: ReturnType<typeof extractComposerInsights>,
    pkg: PackageJson | null
  ): string | null {
    if (composerInsights.frameworkHints.includes('laravel') || composerInsights.frameworkHints.includes('symfony')) {
      return 'mvc';
    }
    const dependencies = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {})
    };
    if ('express' in dependencies || 'fastify' in dependencies) {
      return 'modular-monolith';
    }
    return null;
  }

  private detectTestingFramework(pkg: PackageJson | null, composerJson: ReturnType<typeof loadComposerJson>): string | null {
    const dependencies = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {})
    };

    if ('jest' in dependencies) return 'jest';
    if ('mocha' in dependencies) return 'mocha';
    if ('vitest' in dependencies) return 'vitest';
    if ('ava' in dependencies) return 'ava';

    const composerDeps = {
      ...(composerJson?.require ?? {}),
      ...(composerJson?.['require-dev'] ?? {})
    };
    if ('phpunit/phpunit' in composerDeps) return 'phpunit';

    return null;
  }

  private detectBuildSystem(pkg: PackageJson | null): string | null {
    const dependencies = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {})
    };

    if ('vite' in dependencies || 'laravel-vite-plugin' in dependencies) return 'vite';
    if ('webpack' in dependencies || '@webpack-cli/serve' in dependencies) return 'webpack';
    if ('esbuild' in dependencies) return 'esbuild';
    if ('rollup' in dependencies) return 'rollup';
    if ('gulp' in dependencies) return 'gulp';

    return null;
  }
}
