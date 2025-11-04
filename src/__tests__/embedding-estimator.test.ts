/**
 * SAFEDELETE_PHP_LOCAL: Local convenience tests for the temporary embedding estimator.
 * Remove everything carrying this identifier before submitting upstream.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { estimateEmbeddingWork, formatDuration } from '../utils/embedding-estimator.js';

describe('estimateEmbeddingWork', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'embedding-estimator-'));
  const projectPath = join(tempRoot, 'project');

  beforeAll(() => {
    mkdirSync(projectPath, { recursive: true });
    mkdirSync(join(projectPath, 'src/app'), { recursive: true });
    mkdirSync(join(projectPath, 'vendor/cache'), { recursive: true });

    writeFileSync(join(projectPath, 'src', 'app', 'UserService.php'), '<?php echo "hello world"; ?>');
    writeFileSync(join(projectPath, 'src', 'app', 'handler.ts'), 'export const handler = () => null;');
    writeFileSync(join(projectPath, 'vendor', 'cache', 'ignored.php'), '<?php // should be ignored ?>');
  });

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('estimates embeddings and ignores vendor directory', async () => {
    const estimate = await estimateEmbeddingWork(projectPath);

    expect(estimate.totalFiles).toBe(2);
    expect(estimate.perLanguageFiles.php).toBe(1);
    expect(estimate.perLanguageFiles.typescript).toBe(1);
    expect(estimate.perLanguageFiles).not.toHaveProperty('javascript');
    expect(estimate.perLanguageFiles).not.toHaveProperty('vendor');

    expect(estimate.totalEmbeddings).toBeGreaterThan(0);
    expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
    expect(estimate.localMsRange.typical).toBeGreaterThan(0);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds to readable durations', () => {
    expect(formatDuration(500)).toBe('0.5s');
    expect(formatDuration(5_000)).toBe('5s');
    expect(formatDuration(65_000)).toBe('1.1m');
    expect(formatDuration(3600_000)).toBe('1h');
    expect(formatDuration(-10)).toBe('0s');
  });
});
