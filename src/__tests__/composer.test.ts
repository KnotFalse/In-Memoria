import { describe, it, expect } from 'vitest';
import { extractComposerInsights, type ComposerJson } from '../utils/composer.js';
import { join } from 'path';

describe('composer insights', () => {
  it('extracts psr-4 namespaces and framework hints', () => {
    const composer: ComposerJson = {
      autoload: {
        'psr-4': {
          'App\\': 'src/',
          'Domain\\Shared\\': ['packages/shared/src']
        }
      },
      'autoload-dev': {
        'psr-4': {
          'Tests\\': 'tests/'
        }
      },
      require: {
        'laravel/framework': '^10.0'
      },
      'require-dev': {
        'phpunit/phpunit': '^10.0'
      }
    };

    const projectRoot = join(process.cwd(), 'fixtures/project');
    const insights = extractComposerInsights(composer, projectRoot);
    expect(Object.keys(insights.namespaces)).toContain('App\\');
    expect(insights.namespaces['App\\']).toEqual(['src/']);
    expect(insights.namespaces['Domain\\Shared\\']).toEqual(['packages/shared/src']);
    expect(insights.frameworkHints).toContain('laravel');
    expect(insights.namespaces['Tests\\']).toEqual(['tests/']);
    expect(insights.priorityPaths.some(p => p.namespace === 'App\\' && p.relativePath === 'src/')).toBe(true);
  });

  it('handles missing composer configuration', () => {
    const insights = extractComposerInsights(null, process.cwd());
    expect(insights.namespaces).toEqual({});
    expect(insights.frameworkHints).toEqual([]);
    expect(insights.priorityPaths).toEqual([]);
  });

  it('collects psr-0 namespaces and resolves absolute paths', () => {
    const composer: ComposerJson = {
      autoload: {
        'psr-0': {
          'Legacy_': ['lib/legacy', 'lib/shared'],
          '': 'src'
        }
      },
      'autoload-dev': {
        'psr-0': {
          'Tests_': 'tests'
        }
      }
    };

    const projectRoot = join(process.cwd(), 'sample-app');
    const insights = extractComposerInsights(composer, projectRoot);

    expect(insights.namespaces['Legacy_']).toEqual(['lib/legacy', 'lib/shared']);
    expect(insights.namespaces['']).toEqual(['src']);
    expect(insights.namespaces['Tests_']).toEqual(['tests']);

    const absolutePaths = insights.priorityPaths.map(p => p.absolutePath);
    expect(absolutePaths).toContain(join(projectRoot, 'lib/legacy'));
    expect(absolutePaths).toContain(join(projectRoot, 'lib/shared'));
    expect(absolutePaths).toContain(join(projectRoot, 'src'));
  });
});
