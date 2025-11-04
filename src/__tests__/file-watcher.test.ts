import { describe, it, expect } from 'vitest';
import { FileWatcher } from '../watchers/file-watcher.js';

describe('FileWatcher defaults', () => {
  it('includes PHP-specific ignore patterns', () => {
    const watcher = new FileWatcher({ patterns: ['**/*.php'] });
    const options = (watcher as any).options as { ignored: string[] };

    expect(options.ignored).toContain('**/composer.lock');
    expect(options.ignored).toContain('**/*.min.php');
  });
});
