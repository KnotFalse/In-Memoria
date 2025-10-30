/**
 * SAFEDELETE_PHP_LOCAL: Local testing helper to keep PHP integration runs manageable.
 * If you find this tag, delete the block/file before upstreaming PHP support changes.
 */

import { join, sep } from 'path';
import { readdir, stat } from 'fs/promises';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  svelte: 'svelte',
  sql: 'sql',
  php: 'php',
  phtml: 'php',
  inc: 'php'
};

const DIRECTORY_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'target',
  'vendor',
  'storage',
  'var',
  'bootstrap/cache',
  '__pycache__',
  '.pytest_cache',
  'coverage',
  '.coverage',
  'htmlcov',
  '.venv',
  'venv',
  'env',
  '.env',
  'tmp',
  'temp',
  '.tmp'
];

const OPENAI_ADA_COST_PER_1K_TOKENS = 0.0001;
const AVERAGE_TOKEN_BYTES = 4; // approximate characters per token
const AVERAGE_EMBEDDING_CHUNK_BYTES = 2800; // ≈700 tokens
const LOCAL_EMBEDDING_MS_PER_CHUNK_BASELINE = {
  best: 4,
  typical: 20,
  worst: 70
};

export interface EmbeddingEstimate {
  totalFiles: number;
  totalEmbeddings: number;
  totalTokens: number;
  estimatedCostUSD: number;
  perLanguageFiles: Record<string, number>;
  perLanguageEmbeddings: Record<string, number>;
  perLanguageTokens: Record<string, number>;
  localMsRange: { bestCase: number; typical: number; worstCase: number };
}

interface QueueItem {
  path: string;
  depth: number;
}

export async function estimateEmbeddingWork(projectPath: string): Promise<EmbeddingEstimate> {
  const queue: QueueItem[] = [{ path: projectPath, depth: 0 }];
  const perLanguageFiles: Record<string, number> = {};
  const perLanguageEmbeddings: Record<string, number> = {};
  const perLanguageTokens: Record<string, number> = {};

  let totalFiles = 0;
  let totalEmbeddings = 0;
  let totalTokens = 0;

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      break;
    }

    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of entries) {
      const fullPath = join(current.path, dirent.name);

      if (dirent.isDirectory()) {
        if (shouldIgnoreDirectory(fullPath)) {
          continue;
        }
        queue.push({ path: fullPath, depth: current.depth + 1 });
        continue;
      }

      if (!dirent.isFile()) {
        continue;
      }

      const language = detectLanguage(dirent.name);
      if (!language) {
        continue;
      }

      let fileSizeBytes: number;
      try {
        const fileStat = await stat(fullPath);
        if (!fileStat.isFile()) {
          continue;
        }
        fileSizeBytes = fileStat.size;
      } catch {
        continue;
      }

      const estimatedEmbeddings = Math.max(1, Math.ceil(fileSizeBytes / AVERAGE_EMBEDDING_CHUNK_BYTES));
      const estimatedTokens = Math.max(1, Math.ceil(fileSizeBytes / AVERAGE_TOKEN_BYTES));

      totalFiles += 1;
      totalEmbeddings += estimatedEmbeddings;
      totalTokens += estimatedTokens;

      perLanguageFiles[language] = (perLanguageFiles[language] ?? 0) + 1;
      perLanguageEmbeddings[language] = (perLanguageEmbeddings[language] ?? 0) + estimatedEmbeddings;
      perLanguageTokens[language] = (perLanguageTokens[language] ?? 0) + estimatedTokens;
    }
  }

  const estimatedCostUSD = (totalTokens / 1000) * OPENAI_ADA_COST_PER_1K_TOKENS;
  const localMsRange = {
    bestCase: totalEmbeddings * LOCAL_EMBEDDING_MS_PER_CHUNK_BASELINE.best,
    typical: totalEmbeddings * LOCAL_EMBEDDING_MS_PER_CHUNK_BASELINE.typical,
    worstCase: totalEmbeddings * LOCAL_EMBEDDING_MS_PER_CHUNK_BASELINE.worst
  };

  return {
    totalFiles,
    totalEmbeddings,
    totalTokens,
    estimatedCostUSD,
    perLanguageFiles,
    perLanguageEmbeddings,
    perLanguageTokens,
    localMsRange
  };
}

function shouldIgnoreDirectory(path: string): boolean {
  const normalised = path.split(sep).join('/');
  const segments = normalised.split('/');
  const lastSegment = segments[segments.length - 1];

  return DIRECTORY_IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('/')) {
      return normalised.includes(pattern);
    }
    return lastSegment === pattern;
  });
}

function detectLanguage(fileName: string): string | null {
  const cleanName = fileName.toLowerCase();
  const lastDot = cleanName.lastIndexOf('.');
  if (lastDot === -1) {
    return null;
  }

  const extension = cleanName.slice(lastDot + 1);
  return EXTENSION_LANGUAGE_MAP[extension] ?? null;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0s';
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${formatNumber(seconds, seconds < 10)}s`;
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${formatNumber(minutes, minutes < 10)}m`;
  }

  const hours = minutes / 60;
  return `${formatNumber(hours, hours < 10)}h`;
}

function formatNumber(value: number, allowDecimal: boolean): string {
  if (!allowDecimal || Math.abs(value - Math.round(value)) < 1e-6) {
    return Math.round(value).toString();
  }
  return value.toFixed(1);
}
