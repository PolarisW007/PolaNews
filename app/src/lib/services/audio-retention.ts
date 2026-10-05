import { createHash, timingSafeEqual } from 'node:crypto';
import {
  lstat,
  realpath,
  readdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, parse, resolve, sep } from 'node:path';

export const DEFAULT_AUDIO_RETENTION_DAYS = 30;
export const MAX_AUDIO_RETENTION_BATCH = 5_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_UNATTENDED_MISSING_FILES = 100;
const MAX_UNATTENDED_MISSING_RATIO = 0.25;
const UUID_MP3_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3$/i;
const AUDIO_ROUTE_RE = /(?:^|\/)api\/tts\/audio\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3)(?:[?#].*)?$/i;

let retentionRunInProgress = false;

export type AudioLanguage = 'zh' | 'en' | 'ja';

export interface ArticleAudioReference {
  id: string;
  audio_url?: string | null;
  audio_url_en?: string | null;
  audio_url_ja?: string | null;
}

export interface StaleArticleAudioReference {
  id: string;
  language: AudioLanguage;
  url: string;
}

export interface AudioRetentionStore {
  listBroadcastSegments(): Promise<unknown[]>;
  listArticleAudioReferences(): Promise<ArticleAudioReference[]>;
  clearArticleAudioReferences(references: StaleArticleAudioReference[]): Promise<number>;
}

export interface AudioRetentionOptions {
  mode?: 'dry-run' | 'apply';
  audioDir?: string;
  retentionDays?: number;
  maxDeletes?: number;
  now?: Date;
  expectedSelectionFingerprint?: string;
}

export interface AudioRetentionResult {
  mode: 'dry-run' | 'apply';
  skipped: boolean;
  reason?: 'in_progress';
  retentionDays: number;
  managedFileCount: number;
  managedBytes: number;
  protectedBroadcastFileCount: number;
  eligibleFileCount: number;
  selectedFileCount: number;
  selectedBytes: number;
  selectionFingerprint: string;
  deletedFileCount: number;
  deletedBytes: number;
  deleteFailureCount: number;
  missingArticleReferenceCount: number;
  selectedArticleReferenceCount: number;
  clearedArticleReferenceCount: number;
}

interface ManagedAudioFile {
  filename: string;
  path: string;
  size: number;
  mtimeMs: number;
  dev: number;
  ino: number;
}

function fingerprintSelection(
  files: ManagedAudioFile[],
  references: StaleArticleAudioReference[] = [],
): string {
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(`${file.filename}\0${file.size}\0${file.mtimeMs}\0${file.dev}\0${file.ino}\n`);
  }
  for (const reference of [...references].sort((left, right) => (
    left.id.localeCompare(right.id)
      || left.language.localeCompare(right.language)
      || left.url.localeCompare(right.url)
  ))) {
    digest.update(`${reference.id}\0${reference.language}\0${reference.url}\n`);
  }
  return digest.digest('hex');
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

export function getAudioRetentionDays(
  value: string | number | undefined = process.env.POLANEWS_AUDIO_RETENTION_DAYS,
): number {
  const parsed = value === undefined || value === ''
    ? Number.NaN
    : (typeof value === 'number' ? value : Number(value));
  return boundedInteger(parsed, DEFAULT_AUDIO_RETENTION_DAYS, 1, 3_650);
}

export function getAudioRetentionCutoff(
  now = new Date(),
  value: string | number | undefined = process.env.POLANEWS_AUDIO_RETENTION_DAYS,
): Date {
  return new Date(now.getTime() - getAudioRetentionDays(value) * DAY_MS);
}

function emptyResult(
  mode: 'dry-run' | 'apply',
  retentionDays: number,
  reason?: 'in_progress',
): AudioRetentionResult {
  return {
    mode,
    skipped: Boolean(reason),
    reason,
    retentionDays,
    managedFileCount: 0,
    managedBytes: 0,
    protectedBroadcastFileCount: 0,
    eligibleFileCount: 0,
    selectedFileCount: 0,
    selectedBytes: 0,
    selectionFingerprint: fingerprintSelection([]),
    deletedFileCount: 0,
    deletedBytes: 0,
    deleteFailureCount: 0,
    missingArticleReferenceCount: 0,
    selectedArticleReferenceCount: 0,
    clearedArticleReferenceCount: 0,
  };
}

export function resolveAudioDirectory(options?: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): string {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? process.cwd();
  const configured = env.POLANEWS_AUDIO_DIR?.trim();

  if (env.NODE_ENV === 'production' && (!configured || !isAbsolute(configured))) {
    throw new Error('POLANEWS_AUDIO_DIR must be configured as an absolute path in production');
  }

  const directory = configured
    ? resolve(configured)
    : resolve(cwd, '..', '.polanews-runtime', 'audio');

  if (!isAbsolute(directory) || directory === parse(directory).root) {
    throw new Error('Refusing unsafe audio directory');
  }

  return directory;
}

export function isManagedAudioFilename(filename: string): boolean {
  return UUID_MP3_RE.test(filename);
}

export function parseAudioFilenameFromUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(AUDIO_ROUTE_RE);
  return match?.[1] ?? null;
}

export function timingSafeTokenEqual(expected: string, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const expectedDigest = createHash('sha256').update(expected).digest();
  const suppliedDigest = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

function collectAudioReferences(value: unknown, output: Set<string>): void {
  const filename = parseAudioFilenameFromUrl(value);
  if (filename) {
    output.add(filename);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAudioReferences(item, output);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectAudioReferences(item, output);
    }
  }
}

async function listManagedAudioFiles(audioDir: string): Promise<ManagedAudioFile[]> {
  const entries = await readdir(audioDir, { withFileTypes: true });

  const files: ManagedAudioFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isManagedAudioFilename(entry.name)) continue;
    const candidate = resolve(audioDir, entry.name);
    if (!candidate.startsWith(`${audioDir}${sep}`)) continue;
    let metadata;
    try {
      metadata = await stat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    files.push({
      filename: entry.name,
      path: candidate,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      dev: metadata.dev,
      ino: metadata.ino,
    });
  }
  return files;
}

function collectStaleArticleReferences(
  articles: ArticleAudioReference[],
  staleFilenames: Set<string>,
): StaleArticleAudioReference[] {
  const columns: Array<[AudioLanguage, keyof ArticleAudioReference]> = [
    ['zh', 'audio_url'],
    ['en', 'audio_url_en'],
    ['ja', 'audio_url_ja'],
  ];
  const stale: StaleArticleAudioReference[] = [];
  for (const article of articles) {
    for (const [language, column] of columns) {
      const url = article[column];
      const filename = parseAudioFilenameFromUrl(url);
      if (filename && staleFilenames.has(filename)) {
        stale.push({ id: article.id, language, url: String(url) });
      }
    }
  }
  return stale;
}

export async function runAudioRetention(
  options: AudioRetentionOptions,
  store: AudioRetentionStore,
): Promise<AudioRetentionResult> {
  const mode = options.mode ?? 'dry-run';
  const retentionDays = getAudioRetentionDays(options.retentionDays);
  if (retentionRunInProgress) return emptyResult(mode, retentionDays, 'in_progress');

  retentionRunInProgress = true;
  try {
    if (options.audioDir && !isAbsolute(options.audioDir)) {
      throw new Error('Audio retention directory must be absolute');
    }
    const configuredAudioDir = options.audioDir
      ? resolve(options.audioDir)
      : resolveAudioDirectory();
    if (!isAbsolute(configuredAudioDir) || configuredAudioDir === parse(configuredAudioDir).root) {
      throw new Error('Refusing unsafe audio directory');
    }
    let audioDir = configuredAudioDir;
    try {
      audioDir = await realpath(configuredAudioDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (audioDir === parse(audioDir).root) throw new Error('Refusing unsafe audio directory');

    const [segments, articles, managedFiles] = await Promise.all([
      store.listBroadcastSegments(),
      store.listArticleAudioReferences(),
      listManagedAudioFiles(audioDir),
    ]);
    if (managedFiles.length === 0 && articles.some((article) => (
      parseAudioFilenameFromUrl(article.audio_url)
      || parseAudioFilenameFromUrl(article.audio_url_en)
      || parseAudioFilenameFromUrl(article.audio_url_ja)
    ))) {
      throw new Error('Audio directory is empty while database references managed audio');
    }

    const protectedFilenames = new Set<string>();
    for (const value of segments) collectAudioReferences(value, protectedFilenames);

    const existingFilenames = new Set(managedFiles.map((file) => file.filename));
    const referencedFilenames = new Set<string>();
    const missingFilenames = new Set<string>();
    for (const article of articles) {
      for (const value of [article.audio_url, article.audio_url_en, article.audio_url_ja]) {
        const filename = parseAudioFilenameFromUrl(value);
        if (!filename) continue;
        referencedFilenames.add(filename);
        if (!existingFilenames.has(filename)) missingFilenames.add(filename);
      }
    }
    if (missingFilenames.size > MAX_UNATTENDED_MISSING_FILES
      && missingFilenames.size / Math.max(1, referencedFilenames.size) > MAX_UNATTENDED_MISSING_RATIO) {
      throw new Error('Too many audio files are missing; refusing unattended reference repair');
    }

    const cutoffMs = (options.now ?? new Date()).getTime() - retentionDays * DAY_MS;
    const eligible = managedFiles
      .filter((file) => file.mtimeMs < cutoffMs && !protectedFilenames.has(file.filename))
      .sort((left, right) => left.mtimeMs - right.mtimeMs || left.filename.localeCompare(right.filename));
    const maxDeletes = boundedInteger(
      options.maxDeletes,
      1_000,
      1,
      MAX_AUDIO_RETENTION_BATCH,
    );
    const selected = eligible.slice(0, maxDeletes);
    const selectedFilenames = new Set(selected.map((file) => file.filename));
    const selectedArticleReferences = collectStaleArticleReferences(articles, selectedFilenames);
    const missingArticleReferences = collectStaleArticleReferences(articles, missingFilenames);
    const plannedReferenceRepairs = [...missingArticleReferences, ...selectedArticleReferences];
    const selectionFingerprint = fingerprintSelection(selected, plannedReferenceRepairs);

    const result: AudioRetentionResult = {
      ...emptyResult(mode, retentionDays),
      managedFileCount: managedFiles.length,
      managedBytes: managedFiles.reduce((sum, file) => sum + file.size, 0),
      protectedBroadcastFileCount: protectedFilenames.size,
      eligibleFileCount: eligible.length,
      selectedFileCount: selected.length,
      selectedBytes: selected.reduce((sum, file) => sum + file.size, 0),
      selectionFingerprint,
      missingArticleReferenceCount: missingArticleReferences.length,
      selectedArticleReferenceCount: selectedArticleReferences.length,
    };

    if (mode === 'dry-run') return result;

    if (!options.expectedSelectionFingerprint
      || !timingSafeTokenEqual(selectionFingerprint, options.expectedSelectionFingerprint)) {
      throw new Error('Audio retention selection changed; run dry-run again');
    }

    for (const file of selected) {
      const metadata = await lstat(file.path);
      if (!metadata.isFile()
        || metadata.isSymbolicLink()
        || metadata.size !== file.size
        || metadata.mtimeMs !== file.mtimeMs
        || metadata.dev !== file.dev
        || metadata.ino !== file.ino) {
        throw new Error('Audio retention candidate changed; run dry-run again');
      }
    }

    if (plannedReferenceRepairs.length > 0) {
      result.clearedArticleReferenceCount = await store.clearArticleAudioReferences(plannedReferenceRepairs);
    }

    for (const file of selected) {
      try {
        const metadata = await lstat(file.path);
        if (!metadata.isFile()
          || metadata.isSymbolicLink()
          || metadata.size !== file.size
          || metadata.mtimeMs !== file.mtimeMs
          || metadata.dev !== file.dev
          || metadata.ino !== file.ino) {
          result.deleteFailureCount++;
          continue;
        }
        await unlink(file.path);
        result.deletedFileCount++;
        result.deletedBytes += file.size;
      } catch {
        result.deleteFailureCount++;
      }
    }
    return result;
  } finally {
    retentionRunInProgress = false;
  }
}
