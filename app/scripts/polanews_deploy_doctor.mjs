#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standaloneServer = join(root, '.next', 'standalone', 'server.js');
const staticDir = join(root, '.next', 'static');
const standaloneStaticDir = join(root, '.next', 'standalone', '.next', 'static');
const buildManifest = join(root, '.next', 'required-server-files.json');
const releaseMode = process.argv.includes('--release');

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

if (!existsSync(buildManifest)) fail('Next build configuration manifest missing');
const { config } = JSON.parse(readFileSync(buildManifest, 'utf8'));
const basePath = config?.basePath;
if (basePath !== '/polanews' || config?.env?.NEXT_PUBLIC_BASE_PATH !== basePath) {
  fail('Client API/asset prefix was not bound to the Next basePath at build time', [
    'Set env.NEXT_PUBLIC_BASE_PATH from the same basePath in next.config.ts and rebuild.',
    'Runtime Supervisor environment variables cannot repair already-built client bundles.',
  ]);
}

const unresolvedChunks = readdirSync(staticDir, { recursive: true })
  .filter((name) => name.endsWith('.js'))
  .filter((name) => readFileSync(join(staticDir, name), 'utf8').includes('NEXT_PUBLIC_BASE_PATH'));
if (unresolvedChunks.length) {
  fail('Client chunks still contain an unresolved public base-path variable', unresolvedChunks);
}
if (releaseMode && (!existsSync(standaloneStaticDir)
  || !existsSync(join(root, '.next', 'standalone', 'public', 'logo.png')))) {
  fail('Standalone release is missing static assets or the public logo', [
    'Copy .next/static to .next/standalone/.next/static and public to .next/standalone/public.',
  ]);
}

console.log('PASS: PolaNews deploy doctor');
console.log(JSON.stringify({
  standaloneServer,
  staticDir,
  standaloneStaticDir,
  staticDirPresent: existsSync(staticDir),
  standaloneStaticDirPresent: existsSync(standaloneStaticDir),
  standaloneServerBytes: fileSize(standaloneServer),
  basePath,
  clientBasePath: config.env.NEXT_PUBLIC_BASE_PATH,
  unresolvedClientChunks: unresolvedChunks.length,
  releaseMode,
}, null, 2));
