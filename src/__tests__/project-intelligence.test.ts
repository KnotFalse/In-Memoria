import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, relative } from 'path';
import { tmpdir } from 'os';

import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { ProjectIntelligenceEngine } from '../engines/project-intelligence-engine.js';
import { ProjectIntelligenceTools } from '../mcp-server/tools/project-intelligence-tools.js';

describe('Project intelligence integration', () => {
  let tempDir: string;
  let db: SQLiteDatabase;
  let engine: ProjectIntelligenceEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'in-memoria-pi-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'public'), { recursive: true });

    writeFileSync(
      join(tempDir, 'composer.json'),
      JSON.stringify(
        {
          require: {
            'symfony/symfony': '^6.0',
            'phpunit/phpunit': '^10.0'
          },
          autoload: {
            'psr-4': {
              'App\\\\': 'src/'
            }
          }
        },
        null,
        2
      )
    );

    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'project-intelligence-demo',
          description: 'Fixture project for blueprint tests',
          scripts: {
            start: 'node index.js'
          },
          dependencies: {
            react: '^18.0.0'
          }
        },
        null,
        2
      )
    );

    writeFileSync(join(tempDir, 'public', 'index.php'), '<?php echo "hello";');

    db = new SQLiteDatabase(':memory:');
    engine = new ProjectIntelligenceEngine(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates blueprint and feature map from composer/package metadata', async () => {
    await engine.generateBlueprint({ projectPath: tempDir });

    const projectPath = resolve(tempDir);
    const blueprint = db.getProjectBlueprint(projectPath);
    expect(blueprint).toBeTruthy();
    expect(blueprint?.techStack).toContain('symfony');
    expect(blueprint?.techStack).toContain('react');
    expect(blueprint?.entryPoints).toHaveProperty('namespaceRoot', 'src/');
    expect(blueprint?.entryPoints).toHaveProperty('startScript', 'node index.js');

    const featureMap = db.listFeatureMap(projectPath);
    expect(featureMap.length).toBeGreaterThan(0);
    expect(featureMap[0].projectPath).toBe(projectPath);
    expect(featureMap[0].primaryFiles).toContain('src/');

    engine.recordFileActivity(projectPath, 'src/Controller/HomeController.php');
    const sessions = db.listActiveWorkSessions(projectPath);
    expect(sessions.length).toBe(1);
    expect(sessions[0].currentFiles).toContain('src/Controller/HomeController.php');
  });

  it('project intelligence tools expose blueprint and session data', async () => {
    const projectPath = resolve(tempDir);
    await engine.generateBlueprint({ projectPath });
    engine.recordFileActivity(projectPath, 'src/Service/Mailer.php');

    const tools = new ProjectIntelligenceTools(engine, db);

    const blueprint = await tools.getProjectBlueprint({ projectPath, refresh: false });
    expect(blueprint?.projectPath).toBe(projectPath);
    expect(Object.keys(blueprint?.entryPoints ?? {})).not.toHaveLength(0);

    const featureNames = db.listFeatureMap(projectPath).map((entry) => entry.featureName);
    expect(featureNames.length).toBeGreaterThan(0);
    const feature = await tools.findFeatureFiles({ projectPath, feature: featureNames[0] });
    expect(feature).toBeTruthy();
    expect(feature?.primaryFiles ?? []).toContain('src/');

    const resumed = await tools.resumeSession({ projectPath });
    expect(resumed?.currentFiles).toContain('src/Service/Mailer.php');

    const updated = await tools.updateWorkContext({
      projectPath,
      sessionId: 'agent:test',
      currentFiles: ['src/Service/Worker.php'],
      pendingTasks: ['Implement queue'],
      blockers: ['Awaiting API key']
    });
    expect(updated.pendingTasks).toContain('Implement queue');
    expect(updated.sessionId).toBe('agent:test');

    await tools.recordDecision({
      projectPath,
      decisionKey: 'database',
      decisionValue: 'postgres',
      reasoning: 'Team standard'
    });

    const decisions = db.listProjectDecisions(projectPath);
    expect(decisions.find((d) => d.decisionKey === 'database')?.decisionValue).toBe('postgres');
  });

  it('normalizes relative project paths when retrieving blueprints', async () => {
    const absolutePath = resolve(tempDir);
    await engine.generateBlueprint({ projectPath: absolutePath });

    const relativePath = relative(process.cwd(), absolutePath);
    const tools = new ProjectIntelligenceTools(engine, db);

    const blueprint = await tools.getProjectBlueprint({ projectPath: relativePath, refresh: false });
    expect(blueprint?.projectPath).toBe(absolutePath);
    expect(blueprint?.entryPoints).toHaveProperty('namespaceRoot', 'src/');
  });
});
