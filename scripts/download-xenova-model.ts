#!/usr/bin/env bun
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const MODEL_ID = process.argv[2] ?? 'Xenova/all-MiniLM-L6-v2';
const BASE_DIR = process.argv[3] ?? path.resolve(process.cwd(), 'vendor/models');

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'in-memoria/transformers-cache'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function downloadFile(url: string, filePath: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'in-memoria/transformers-cache'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const arrayBuffer = await res.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));
}

async function main() {
  const metadata = await fetchJson(`https://huggingface.co/api/models/${MODEL_ID}`);
  const revision: string = metadata.sha ?? metadata.lastModified ?? 'main';
  const files: Array<{ rfilename: string }> = metadata.siblings ?? [];

  if (!files.length) {
    throw new Error(`Model ${MODEL_ID} has no files listed in metadata.`);
  }

  const modelRoot = path.join(BASE_DIR, MODEL_ID);
  await mkdir(modelRoot, { recursive: true });

  const total = files.length;
  let completed = 0;

  for (const file of files) {
    const relativePath = file.rfilename;
    const destination = path.join(modelRoot, relativePath);
    if (existsSync(destination)) {
      completed += 1;
      console.log(`✓ cached ${relativePath} (${completed}/${total})`);
      continue;
    }

    const url = `https://huggingface.co/${MODEL_ID}/resolve/${revision}/${relativePath}`;
    console.log(`↓ downloading ${relativePath} (${completed + 1}/${total})`);
    await downloadFile(url, destination);
    completed += 1;
  }

  console.log(`✅ Downloaded ${MODEL_ID} to ${modelRoot}`);
}

main().catch((error) => {
  console.error('❌ Failed to download model:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
