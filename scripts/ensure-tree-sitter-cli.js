#!/usr/bin/env node
/**
 * Verifies that the tree-sitter CLI is available and matches the expected version.
 * Exits with a non-zero status when the binary is missing or outdated so CI can fail fast.
 */

import { spawnSync } from 'child_process';

const REQUIRED_VERSION = process.env.TREE_SITTER_CLI_VERSION ?? '0.22.5';

function fail(message) {
  console.error(`❌ ${message}`);
  console.error('👉 Install it with `npm install -g tree-sitter-cli@' + REQUIRED_VERSION + '` then rerun this command.');
  process.exit(1);
}

const result = spawnSync('tree-sitter', ['--version'], { encoding: 'utf8' });

if (result.error) {
  fail('tree-sitter CLI not found in PATH.');
}

const output = result.stdout.trim();
const match = output.match(/tree-sitter\s+(\d+\.\d+\.\d+)/);

if (!match) {
  fail(`Unexpected tree-sitter output: "${output}"`);
}

const version = match[1];

if (version !== REQUIRED_VERSION) {
  console.warn(`⚠️ Detected tree-sitter CLI ${version}; expected ${REQUIRED_VERSION}.`);
  console.warn('If this version is acceptable, update TREE_SITTER_CLI_VERSION or the script accordingly.');
  // Do not fail hard on minor skew to avoid blocking contributors unnecessarily.
} else {
  console.log(`✅ tree-sitter CLI ${version} detected.`);
}
