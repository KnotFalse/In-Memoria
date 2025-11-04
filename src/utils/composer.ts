import { readFileSync, lstatSync } from 'fs';
import { join, dirname, normalize } from 'path';

export interface ComposerJson {
  autoload?: {
    ['psr-4']?: Record<string, string | string[]>;
    ['psr-0']?: Record<string, string | string[]>;
    classmap?: string[];
  };
  ['autoload-dev']?: ComposerJson['autoload'];
  require?: Record<string, string>;
  ['require-dev']?: Record<string, string>;
}

export interface ComposerInsights {
  namespaces: Record<string, string[]>;
  frameworkHints: string[];
  priorityPaths: Array<{
    namespace: string;
    relativePath: string;
    absolutePath: string;
  }>;
}

export function loadComposerJson(projectPath: string): ComposerJson | null {
  try {
    const root = resolveProjectRoot(projectPath);
    const composerPath = join(root, 'composer.json');
    const raw = readFileSync(composerPath, 'utf-8');
    return JSON.parse(raw) as ComposerJson;
  } catch (error) {
    return null;
  }
}

export function extractComposerInsights(config: ComposerJson | null, projectPath: string): ComposerInsights {
  const root = resolveProjectRoot(projectPath);

  if (!config) {
    return { namespaces: {}, frameworkHints: [], priorityPaths: [] };
  }

  const namespaces: Record<string, string[]> = {};
  const psr4 = normalizeAutoload(config.autoload?.['psr-4']);
  const psr4Dev = normalizeAutoload(config['autoload-dev']?.['psr-4']);
  const psr0 = normalizeAutoload(config.autoload?.['psr-0']);
  const psr0Dev = normalizeAutoload(config['autoload-dev']?.['psr-0']);

  const priorityMap = new Map<string, { namespace: string; relativePath: string; absolutePath: string }>();

  const collectNamespacePaths = (entries: Record<string, string | string[]>) => {
    for (const [namespace, paths] of Object.entries(entries)) {
      const existing = namespaces[namespace] || [];
      const pathList = Array.isArray(paths) ? paths : [paths];

      const normalizedPaths = pathList.map((p) => normalizePathFragment(p));
      namespaces[namespace] = Array.from(new Set([...existing, ...normalizedPaths]));

      normalizedPaths.forEach((relativePath) => {
        if (!relativePath) return;

        const absolutePath = normalize(join(root, relativePath));
        const key = `${namespace}:${absolutePath}`;
        if (!priorityMap.has(key)) {
          priorityMap.set(key, { namespace, relativePath, absolutePath });
        }
      });
    }
  };

  collectNamespacePaths({ ...psr4, ...psr4Dev });
  collectNamespacePaths({ ...psr0, ...psr0Dev });

  const priorityPaths = Array.from(priorityMap.values()).sort((a, b) => {
    if (a.namespace === b.namespace) {
      return a.relativePath.localeCompare(b.relativePath);
    }
    return a.namespace.localeCompare(b.namespace);
  });

  return {
    namespaces,
    frameworkHints: detectFrameworks(config),
    priorityPaths
  };
}

function normalizePathFragment(pathFragment: string): string {
  if (!pathFragment) return '';
  // Composer allows empty string to map namespace to project root
  if (pathFragment === '') return '.';
  return pathFragment.replace(/^[.][/\\]/, '').replace(/\\/g, '/');
}

function normalizeAutoload(autoload?: Record<string, string | string[]>): Record<string, string | string[]> {
  return autoload ? { ...autoload } : {};
}

function detectFrameworks(config: ComposerJson): string[] {
  const frameworks = new Set<string>();
  const packages = {
    ...(config.require || {}),
    ...(config['require-dev'] || {})
  };

  const map: Record<string, string> = {
    'laravel/framework': 'laravel',
    'laravel/lumen-framework': 'lumen',
    'symfony/symfony': 'symfony',
    'symfony/http-kernel': 'symfony',
    'symfony/console': 'symfony',
    'cakephp/cakephp': 'cakephp',
    'codeigniter4/framework': 'codeigniter',
    'yiisoft/yii2': 'yii',
    'drupal/core': 'drupal',
    'wordpress/wordpress': 'wordpress',
    'johnpbloch/wordpress-core': 'wordpress',
    'woocommerce/woocommerce': 'woocommerce'
  };

  for (const pkg of Object.keys(packages)) {
    if (map[pkg]) {
      frameworks.add(map[pkg]);
      continue;
    }
    if (pkg.startsWith('symfony/')) frameworks.add('symfony');
    if (pkg.startsWith('laravel/')) frameworks.add('laravel');
    if (pkg.startsWith('drupal/')) frameworks.add('drupal');
  }

  return Array.from(frameworks);
}

function resolveProjectRoot(path: string): string {
  try {
    const stats = lstatSync(path);
    return stats.isDirectory() ? path : dirname(path);
  } catch (error) {
    return path;
  }
}
