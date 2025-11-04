import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

interface FixtureConfig {
  name: string;
  group: 'synthetic' | 'realworld';
  path: string;
  repo?: string;
  commit?: string;
  roots: string[];
  includeTemplates?: boolean;
  notes?: string;
}

interface RunSummary {
  fixture: string;
  group: string;
  root: string;
  metricsPath: string;
  concepts: number;
  parseMs?: number;
  includeTemplates?: boolean;
  repo?: string;
  commit?: string;
}

const metricsDir = resolve(process.cwd(), 'tmp/metrics');
mkdirSync(metricsDir, { recursive: true });

function detectRunner(): string {
  if (process.env.IN_MEMORIA_FORCE_NPX === '1') {
    return 'npx';
  }

  const bunResult = spawnSync('bunx', ['--version'], {
    stdio: 'ignore',
    env: process.env
  });
  if (bunResult.status === 0) {
    return 'bunx';
  }

  return 'npx';
}

const runner = detectRunner();
console.log(`Using ${runner} for tsx commands.`);

function runCommand(args: string[], cwd: string): void {
  const result = spawnSync(runner, args, {
    cwd,
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function loadRealWorldFixtures(): FixtureConfig[] {
  const configPath = resolve(process.cwd(), 'tests/fixtures/realworld/fixtures.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Array<{
    name: string;
    path: string;
    repo: string;
    commit: string;
    roots?: string[];
    includeTemplates?: boolean;
    notes?: string;
  }>;

  return raw.map((entry) => ({
    name: entry.name,
    group: 'realworld',
    path: entry.path,
    repo: entry.repo,
    commit: entry.commit,
    roots: entry.roots && entry.roots.length > 0 ? entry.roots : ['.'],
    includeTemplates: entry.includeTemplates ?? false,
    notes: entry.notes
  }));
}

function loadSyntheticFixtures(): FixtureConfig[] {
  return [
    {
      name: 'Sandbox PHP Sample',
      group: 'synthetic',
      path: 'sandbox-php-sample',
      roots: ['.'],
      includeTemplates: false
    },
    {
      name: 'Laravel Demo (synthetic)',
      group: 'synthetic',
      path: 'tests/fixtures/php/laravel-demo',
      roots: ['.'],
      includeTemplates: false
    },
    {
      name: 'Symfony Demo (synthetic)',
      group: 'synthetic',
      path: 'tests/fixtures/php/symfony-demo',
      roots: ['.'],
      includeTemplates: true
    },
    {
      name: 'WordPress Demo (synthetic)',
      group: 'synthetic',
      path: 'tests/fixtures/php/wordpress-demo',
      roots: ['.'],
      includeTemplates: false
    },
    {
      name: 'Python Baseline',
      group: 'synthetic',
      path: 'sandbox-python-sample',
      roots: ['.'],
      includeTemplates: false
    }
  ];
}

function extractMetrics(metricsPath: string): { concepts: number; parseMs?: number } {
  try {
    const data = JSON.parse(readFileSync(metricsPath, 'utf-8'));
    const conceptsByLanguage = data?.performance?.intelligence?.conceptsByLanguage ?? {};
    const concepts =
      conceptsByLanguage.php ??
      conceptsByLanguage.PHP ??
      conceptsByLanguage['php '] ??
      0;
    const parseMs = data?.performance?.database?.queryPerformance?.conceptsMs;
    return { concepts, parseMs };
  } catch (error) {
    console.warn(`⚠️  Failed to parse metrics at ${metricsPath}: ${error}`);
    return { concepts: 0 };
  }
}

function parseGroups(): Set<string> {
  const args = process.argv.slice(2);
  const groups = new Set<string>();
  const groupFlagIndex = args.indexOf('--group');
  if (groupFlagIndex !== -1 && args[groupFlagIndex + 1]) {
    const requested = args[groupFlagIndex + 1]
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
    requested.forEach((g) => groups.add(g));
  }

  if (groups.size === 0) {
    groups.add('synthetic');
    groups.add('realworld');
  }

  return groups;
}

function parseFixtureFilter(): Set<string> | null {
  const args = process.argv.slice(2);
  const fixtureFlagIndex = args.indexOf('--fixture');
  if (fixtureFlagIndex === -1 || !args[fixtureFlagIndex + 1]) {
    return null;
  }

  const filters = new Set<string>();
  args[fixtureFlagIndex + 1]
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .forEach((value) => filters.add(value));

  return filters;
}

async function main(): Promise<void> {
  const groups = parseGroups();
  const fixtureFilter = parseFixtureFilter();
  const fixtures = [
    ...loadSyntheticFixtures(),
    ...loadRealWorldFixtures()
  ]
    .filter((fixture) => groups.has(fixture.group))
    .filter((fixture) => {
      if (!fixtureFilter || fixtureFilter.size === 0) {
        return true;
      }
      const normalizedName = fixture.name.toLowerCase();
      const slugged = slugify(fixture.name);
      return fixtureFilter.has(normalizedName) || fixtureFilter.has(slugged);
    });

  const summary: RunSummary[] = [];

  for (const fixture of fixtures) {
    const projectPath = resolve(process.cwd(), fixture.path);
    for (const root of fixture.roots) {
      const targetPath = root === '.' ? projectPath : resolve(projectPath, root);
      const slug = slugify(`${fixture.name}-${root}`);
      const metricsPath = resolve(metricsDir, `${slug}.json`);

      console.log(`\n=== ${fixture.name} (${fixture.group}) :: ${root} ===`);
      console.log('→ Learning intelligence');
      runCommand(['tsx', 'src/index.ts', 'learn', targetPath, '--yes'], process.cwd());

      console.log('→ Capturing performance metrics');
      runCommand(['tsx', 'scripts/capture-performance-status.ts', targetPath, metricsPath], process.cwd());

      const { concepts, parseMs } = extractMetrics(metricsPath);
      if (fixture.group === 'realworld' && concepts === 0) {
        throw new Error(
          `Real-world fixture "${fixture.name}" produced zero PHP concepts. Check include/exclude settings.`
        );
      }
      if (parseMs !== undefined && parseMs > 2000) {
        console.warn(
          `⚠️  ${fixture.name} concept query time ${parseMs}ms exceeds 2000ms threshold.`
        );
      }
      summary.push({
        fixture: fixture.name,
        group: fixture.group,
        root,
        metricsPath,
        concepts,
        parseMs,
        includeTemplates: fixture.includeTemplates,
        repo: fixture.repo,
        commit: fixture.commit
      });
    }
  }

  const aggregated = summary.map((entry) => {
    let metrics: unknown = null;
    try {
      metrics = JSON.parse(readFileSync(entry.metricsPath, 'utf-8'));
    } catch (error) {
      metrics = { error: `Failed to parse metrics: ${String(error)}` };
    }

    return {
      fixture: entry.fixture,
      group: entry.group,
      root: entry.root,
      concepts: entry.concepts,
      parseMs: entry.parseMs,
      includeTemplates: entry.includeTemplates ?? false,
      repo: entry.repo,
      commit: entry.commit,
      metrics
    };
  });

  const reportPath = resolve(metricsDir, 'php-integration-report.json');
  writeFileSync(reportPath, JSON.stringify(aggregated, null, 2), 'utf-8');
  console.log(`\nAggregated report written to ${reportPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
