import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SCRIPTS_DIR = join(process.cwd(), 'scripts');

function findScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return findScriptFiles(fullPath);
    }
    if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
      return [fullPath];
    }
    return [];
  });
}

describe('scripts using SemanticEngine/SemanticVectorDB', () => {
  const scriptFiles = findScriptFiles(SCRIPTS_DIR);

  const candidates = scriptFiles.filter((file) => {
    const content = readFileSync(file, 'utf-8');
    return content.includes('SemanticEngine') || content.includes('SemanticVectorDB');
  });

  it.each(candidates)('%s calls cleanup on engines and closes vector DB', (scriptPath) => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('semanticEngine.cleanup(');
    expect(content).toMatch(/await\s+vectorDB\.close\(/);
  });
});
