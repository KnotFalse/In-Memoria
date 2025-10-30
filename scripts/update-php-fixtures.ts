import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

interface FixtureDefinition {
  name: string;
  path: string;
}

interface Options {
  fixtures: string[] | null;
  withMetrics: boolean;
  skipUpdate: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    fixtures: null,
    withMetrics: false,
    skipUpdate: false
  };

  for (const arg of argv) {
    if (arg.startsWith('--fixtures=')) {
      options.fixtures = arg.replace('--fixtures=', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === '--with-metrics') {
      options.withMetrics = true;
    } else if (arg === '--skip-update') {
      options.skipUpdate = true;
    }
  }

  return options;
}

function loadFixtureDefinitions(): FixtureDefinition[] {
  const configPath = resolve('tests/fixtures/realworld/fixtures.json');
  const raw = readFileSync(configPath, 'utf-8');
  const definitions = JSON.parse(raw) as Array<Record<string, any>>;
  return definitions.map(def => ({
    name: def.name,
    path: def.path
  }));
}

function updateFixture(definition: FixtureDefinition): void {
  console.log(`\n🔁 Updating fixture "${definition.name}" via git submodule...`);
  const updateResult = spawnSync('git', ['submodule', 'update', '--remote', '--depth', '1', definition.path], {
    stdio: 'inherit'
  });

  if (updateResult.status !== 0) {
    throw new Error(`git submodule update failed for ${definition.name}`);
  }
}

function captureMetrics(definition: FixtureDefinition): void {
  console.log(`\n📈 Capturing metrics for "${definition.name}"...`);
  const metricsResult = spawnSync(
    'npm',
    ['run', 'test:php-integration', '--', '--group', 'realworld', '--fixture', definition.name],
    { stdio: 'inherit' }
  );

  if (metricsResult.status !== 0) {
    throw new Error(`Metric capture failed for ${definition.name}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const definitions = loadFixtureDefinitions();

  const selected = options.fixtures
    ? definitions.filter(def => options.fixtures!.includes(def.name))
    : definitions;

  if (selected.length === 0) {
    console.log('No fixtures selected. Use --fixtures=<name1,name2> to target specific fixtures.');
    return;
  }

  for (const fixture of selected) {
    if (!options.skipUpdate) {
      updateFixture(fixture);
    } else {
      console.log(`Skipping git submodule update for ${fixture.name}`);
    }
    if (options.withMetrics) {
      captureMetrics(fixture);
    }
  }

  console.log('\n✅ Fixture update routine completed.');
  if (!options.withMetrics) {
    console.log('ℹ️  Run with --with-metrics to capture performance after updates.');
  }
}

main().catch((error) => {
  console.error('❌ Fixture update failed:', error);
  process.exit(1);
});
