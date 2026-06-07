#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standaloneServer = join(root, '.next', 'standalone', 'server.js');
const staticDir = join(root, '.next', 'static');
const standaloneStaticDir = join(root, '.next', 'standalone', '.next', 'static');

function fail(message, details = []) {
  console.error(`FAIL: ${message}`);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

function fileSize(path) {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

if (!existsSync(join(root, 'next.config.ts')) && !existsSync(join(root, 'next.config.js'))) {
  fail('next config not found', ['Run this command from the PolaNews app root.']);
}

if (!existsSync(standaloneServer)) {
  fail('standalone server.js missing', [
    `Expected: ${standaloneServer}`,
    'Run npm run build before deploying a supervisor command that uses node .next/standalone/server.js.',
    'If production intentionally uses next start, supervisor must not point at .next/standalone/server.js.',
  ]);
}

if (!existsSync(staticDir)) {
  fail('Next static directory missing', [`Expected: ${staticDir}`]);
}

console.log('PASS: PolaNews deploy doctor');
console.log(JSON.stringify({
  standaloneServer,
  staticDir,
  standaloneStaticDir,
  staticDirPresent: existsSync(staticDir),
  standaloneStaticDirPresent: existsSync(standaloneStaticDir),
  standaloneServerBytes: fileSize(standaloneServer),
}, null, 2));

