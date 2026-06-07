#!/usr/bin/env node
import { mkdir, readdir, stat, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const appRoot = process.cwd();
const defaultSource = path.resolve(appRoot, 'data', 'audio');
const defaultTarget = process.env.POLANEWS_AUDIO_DIR
  ? path.resolve(process.env.POLANEWS_AUDIO_DIR)
  : path.resolve(appRoot, '..', '.polanews-runtime', 'audio');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
const sourceDir = sourceArg ? path.resolve(sourceArg.slice('--source='.length)) : defaultSource;
const targetDir = targetArg ? path.resolve(targetArg.slice('--target='.length)) : defaultTarget;

function isMp3(filename) {
  return /^[\w-]+\.mp3$/.test(filename);
}

async function listMp3(dir) {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  return names.filter(isMp3).sort();
}

async function fileSize(filePath) {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch {
    return 0;
  }
}

const sourceFiles = await listMp3(sourceDir);
const targetFilesBefore = await listMp3(targetDir);
const targetSetBefore = new Set(targetFilesBefore);
const missing = sourceFiles.filter((name) => !targetSetBefore.has(name));

let copied = 0;
let copiedBytes = 0;

if (apply && missing.length > 0) {
  await mkdir(targetDir, { recursive: true });
  for (const name of missing) {
    const from = path.join(sourceDir, name);
    const to = path.join(targetDir, name);
    await copyFile(from, to);
    copied += 1;
    copiedBytes += await fileSize(to);
  }
}

const targetFilesAfter = await listMp3(targetDir);

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  sourceDir,
  targetDir,
  sourceCount: sourceFiles.length,
  targetCountBefore: targetFilesBefore.length,
  missingCount: missing.length,
  copied,
  copiedBytes,
  targetCountAfter: targetFilesAfter.length,
  ok: !apply || targetFilesAfter.length >= sourceFiles.length,
}, null, 2));
