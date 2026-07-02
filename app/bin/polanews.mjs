#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BASE_URL = 'http://localhost:3000/polanews';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.polanews-cli.json');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function parseArgv(argv) {
  const options = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--') || arg === '-') {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf('=');
    const rawKey = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const key = rawKey.trim();
    if (!key) throw new CliError(`Invalid option: ${arg}`);

    let value;
    if (eq >= 0) {
      value = arg.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      value = argv[i + 1];
      i += 1;
    } else {
      value = true;
    }

    if (options[key] === undefined) {
      options[key] = value;
    } else if (Array.isArray(options[key])) {
      options[key].push(value);
    } else {
      options[key] = [options[key], value];
    }
  }

  return { options, positionals };
}

function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function pick(options, key, fallback = undefined) {
  const value = options[key];
  if (value === undefined || value === true || value === '') return fallback;
  return value;
}

function asNumber(value, fallback) {
  if (value === undefined || value === true || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBaseUrl(url) {
  return String(url || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function readConfig(configPath) {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    throw new CliError(`Failed to read config ${configPath}: ${err.message}`);
  }
}

async function writeConfig(configPath, config) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

async function loadRuntime(options) {
  const configPath = String(
    pick(options, 'config', process.env.POLANEWS_CONFIG || DEFAULT_CONFIG_PATH)
  );
  const config = await readConfig(configPath);
  const baseUrl = normalizeBaseUrl(
    pick(options, 'base-url', process.env.POLANEWS_BASE_URL || config.baseUrl || DEFAULT_BASE_URL)
  );
  const token = pick(options, 'token', process.env.POLANEWS_TOKEN || config.token || '');
  const timeoutMs = asNumber(pick(options, 'timeout'), DEFAULT_TIMEOUT_MS);

  return { configPath, config, baseUrl, token, timeoutMs };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonValue(value) {
  if (value === undefined || value === true) return undefined;
  const text = String(value);
  if (text === '-') return JSON.parse(await readStdin());
  if (text.startsWith('@')) return JSON.parse(await readFile(text.slice(1), 'utf8'));
  return JSON.parse(text);
}

function parsePairs(values) {
  const query = {};
  for (const value of toArray(values)) {
    const text = String(value);
    const index = text.indexOf('=');
    if (index <= 0) throw new CliError(`Expected key=value, got: ${text}`);
    query[text.slice(0, index)] = text.slice(index + 1);
  }
  return query;
}

function addDefined(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== true && value !== '') target[key] = value;
  }
  return target;
}

function pathWithQuery(apiPath, query = {}) {
  const [pathname, existingQuery = ''] = String(apiPath).split('?');
  const params = new URLSearchParams(existingQuery);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== true && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

async function request(runtime, method, apiPath, { query, body, raw = false, headers = {} } = {}) {
  const url = /^https?:\/\//i.test(apiPath)
    ? pathWithQuery(apiPath, query)
    : `${runtime.baseUrl}${pathWithQuery(apiPath.startsWith('/') ? apiPath : `/${apiPath}`, query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
  const requestHeaders = { ...headers };
  if (runtime.token) requestHeaders.Authorization = `Bearer ${runtime.token}`;
  if (body !== undefined && requestHeaders['Content-Type'] === undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  let response;
  let text;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new CliError(`Request timed out after ${runtime.timeoutMs}ms: ${method} ${url}`);
    }
    throw new CliError(`Request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  let payload = text;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null
      ? payload.error || payload.message || JSON.stringify(payload)
      : String(payload || response.statusText);
    throw new CliError(`HTTP ${response.status} ${response.statusText}: ${message}`);
  }

  if (!raw && payload && typeof payload === 'object' && 'success' in payload) {
    if (!payload.success) throw new CliError(payload.error || 'Request failed');
    return payload.data ?? {};
  }

  return payload;
}

function printHelp() {
  process.stdout.write(`PolaNews CLI

Usage:
  polanews [global options] <command> [subcommand] [options]

Global options:
  --base-url <url>      Service URL, default: ${DEFAULT_BASE_URL}
  --token <jwt>         JWT token, or set POLANEWS_TOKEN
  --config <path>       Config file, default: ~/.polanews-cli.json
  --timeout <ms>        Request timeout, default: ${DEFAULT_TIMEOUT_MS}
  --raw                 Keep API envelope instead of unwrapping { success, data }

Config:
  polanews config show
  polanews config set --base-url http://localhost:3000/polanews --token <jwt>
  polanews login --email user@example.com --password xxx --save

Common commands:
  polanews articles list --limit 10 --category tech --search AI
  polanews articles get <articleId>
  polanews articles search --query "open source" --limit 5
  polanews articles summarize <articleId> --lang zh
  polanews articles translate <articleId>
  polanews articles tts <articleId> --text "摘要文本" --voice longshu_v3

  polanews feeds list
  polanews feeds fetch
  polanews feeds add --url <rssUrl> --title <title> --category tech

  polanews digests latest --lang zh --date 2026-05-17
  polanews digests generate --lang zh
  polanews broadcasts latest --lang zh
  polanews broadcasts generate --lang zh --voice longshu_v3
  polanews shares generate --platform xiaohongshu --article-id <articleId>
  polanews source-reach doctor

Generic API bridge:
  polanews api GET /api/articles --query limit=5
  polanews api POST /api/broadcast/generate --data '{"lang":"zh"}'
  echo '{"lang":"zh"}' | polanews api POST /api/digests/generate --data -

MCP bridge:
  polanews mcp tools
  polanews mcp call search_articles --args '{"query":"AI","limit":5}'

Output is JSON on stdout so other apps can pipe or parse it directly.
`);
}

function printResult(result) {
  if (typeof result === 'string') {
    process.stdout.write(result.endsWith('\n') ? result : `${result}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function handleConfig(runtime, subcommand, options) {
  if (subcommand === 'show' || !subcommand) {
    const shown = {
      ...runtime.config,
      baseUrl: runtime.baseUrl,
      token: runtime.token ? `${String(runtime.token).slice(0, 8)}...` : '',
      configPath: runtime.configPath,
    };
    return shown;
  }

  if (subcommand === 'set') {
    const next = { ...runtime.config };
    const baseUrl = pick(options, 'base-url');
    const token = pick(options, 'token');
    if (baseUrl) next.baseUrl = normalizeBaseUrl(baseUrl);
    if (token) next.token = token;
    await writeConfig(runtime.configPath, next);
    return { saved: true, configPath: runtime.configPath, baseUrl: next.baseUrl || runtime.baseUrl };
  }

  if (subcommand === 'clear') {
    await writeConfig(runtime.configPath, {});
    return { cleared: true, configPath: runtime.configPath };
  }

  throw new CliError(`Unknown config command: ${subcommand}`);
}

async function handleApi(runtime, args, options) {
  const [method, apiPath] = args;
  if (!method || !apiPath) throw new CliError('Usage: polanews api <METHOD> <PATH> [--data JSON] [--query key=value]');
  const data = await readJsonValue(pick(options, 'data'));
  return request(runtime, method.toUpperCase(), apiPath, {
    query: parsePairs(options.query),
    body: data,
    raw: Boolean(options.raw),
  });
}

async function handleAuth(runtime, command, options) {
  const email = pick(options, 'email');
  const password = pick(options, 'password');
  if (!email || !password) throw new CliError(`Usage: polanews ${command} --email <email> --password <password>`);
  const body = { email, password };
  if (command === 'register') {
    body.display_name = pick(options, 'display-name', pick(options, 'name', email));
  }
  const result = await request(runtime, 'POST', `/api/auth/${command}`, { body });
  if (options.save && result.token) {
    await writeConfig(runtime.configPath, {
      ...runtime.config,
      baseUrl: runtime.baseUrl,
      token: result.token,
    });
    return { ...result, saved: true, configPath: runtime.configPath };
  }
  return result;
}

async function handleArticles(runtime, subcommand, args, options) {
  if (subcommand === 'list') {
    return request(runtime, 'GET', '/api/articles', {
      query: addDefined(parsePairs(options.query), {
        page: pick(options, 'page'),
        limit: pick(options, 'limit'),
        category: pick(options, 'category'),
        importance: pick(options, 'importance'),
        search: pick(options, 'search'),
        feed_id: pick(options, 'feed-id'),
        sentiment: pick(options, 'sentiment'),
        region: pick(options, 'region'),
        date_from: pick(options, 'date-from'),
        date_to: pick(options, 'date-to'),
      }),
      raw: Boolean(options.raw),
    });
  }

  if (subcommand === 'search') {
    const query = pick(options, 'query', args[0]);
    if (!query) throw new CliError('Usage: polanews articles search --query <text>');
    return request(runtime, 'GET', '/api/articles/search', {
      query: addDefined(parsePairs(options.query), { q: query, query, limit: pick(options, 'limit') }),
      raw: Boolean(options.raw),
    });
  }

  const id = args[0];
  if (!id) throw new CliError(`Usage: polanews articles ${subcommand || '<command>'} <articleId>`);

  if (subcommand === 'get') return request(runtime, 'GET', `/api/articles/${id}`, { raw: Boolean(options.raw) });
  if (subcommand === 'summarize') {
    return request(runtime, 'POST', `/api/articles/${id}/summarize`, {
      body: { lang: pick(options, 'lang', 'zh') },
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'translate') return request(runtime, 'POST', `/api/articles/${id}/translate`, { raw: Boolean(options.raw) });
  if (subcommand === 'fulltext') return request(runtime, 'POST', `/api/articles/${id}/fulltext`, { raw: Boolean(options.raw) });
  if (subcommand === 'neighbors') return request(runtime, 'GET', `/api/articles/${id}/neighbors`, { raw: Boolean(options.raw) });
  if (subcommand === 'tts') {
    const text = pick(options, 'text') || (await readJsonValue(pick(options, 'data')))?.text;
    if (!text) throw new CliError('Usage: polanews articles tts <articleId> --text <summary text>');
    return request(runtime, 'POST', '/api/tts/synthesize', {
      body: {
        articleId: id,
        text,
        lang: pick(options, 'lang', 'zh'),
        voice: pick(options, 'voice', 'longshu_v3'),
      },
      raw: Boolean(options.raw),
    });
  }

  throw new CliError(`Unknown articles command: ${subcommand}`);
}

async function handleFeeds(runtime, subcommand, args, options) {
  if (!subcommand || subcommand === 'list') return request(runtime, 'GET', '/api/feeds', { raw: Boolean(options.raw) });
  if (subcommand === 'fetch') return request(runtime, 'POST', '/api/feeds/fetch', { raw: Boolean(options.raw) });
  if (subcommand === 'add') {
    const body = {
      url: pick(options, 'url'),
      title: pick(options, 'title'),
      category: pick(options, 'category', 'general'),
    };
    if (!body.url || !body.title) throw new CliError('Usage: polanews feeds add --url <rssUrl> --title <title> [--category tech]');
    return request(runtime, 'POST', '/api/feeds', { body, raw: Boolean(options.raw) });
  }
  if (subcommand === 'delete' || subcommand === 'remove') {
    const feedId = pick(options, 'feed-id', args[0]);
    if (!feedId) throw new CliError('Usage: polanews feeds delete <feedId>');
    return request(runtime, 'DELETE', '/api/feeds', { body: { feed_id: feedId }, raw: Boolean(options.raw) });
  }
  throw new CliError(`Unknown feeds command: ${subcommand}`);
}

async function handleDigests(runtime, subcommand, args, options) {
  if (!subcommand || subcommand === 'list') {
    return request(runtime, 'GET', '/api/digests', {
      query: { page: pick(options, 'page', 1), limit: pick(options, 'limit', 10) },
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'latest') {
    return request(runtime, 'GET', '/api/digests/latest', {
      query: addDefined({}, { lang: pick(options, 'lang', 'zh'), date: pick(options, 'date') }),
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'generate') {
    return request(runtime, 'POST', '/api/digests/generate', {
      body: { lang: pick(options, 'lang', 'zh') },
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'export') {
    const id = args[0] || pick(options, 'id');
    if (!id) throw new CliError('Usage: polanews digests export <digestId> [--format markdown|pdf]');
    return request(runtime, 'GET', `/api/digests/${id}/export`, {
      query: { format: pick(options, 'format', 'markdown') },
      raw: Boolean(options.raw),
    });
  }
  throw new CliError(`Unknown digests command: ${subcommand}`);
}

async function handleBroadcasts(runtime, subcommand, args, options) {
  if (!subcommand || subcommand === 'list') {
    return request(runtime, 'GET', '/api/broadcast/list', {
      query: { page: pick(options, 'page', 1), limit: pick(options, 'limit', 20) },
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'latest') {
    return request(runtime, 'GET', '/api/broadcast/latest', {
      query: { lang: pick(options, 'lang', 'zh') },
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'generate') {
    return request(runtime, 'POST', '/api/broadcast/generate', {
      body: { lang: pick(options, 'lang', 'zh'), voice: pick(options, 'voice', 'longshu_v3') },
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'get') {
    const id = args[0] || pick(options, 'id');
    if (!id) throw new CliError('Usage: polanews broadcasts get <broadcastId>');
    return request(runtime, 'GET', `/api/broadcast/${id}`, { raw: Boolean(options.raw) });
  }
  throw new CliError(`Unknown broadcasts command: ${subcommand}`);
}

async function handleShares(runtime, subcommand, args, options) {
  if (!subcommand || subcommand === 'list') {
    return request(runtime, 'GET', '/api/share/list', {
      query: addDefined({}, {
        page: pick(options, 'page', 1),
        limit: pick(options, 'limit', 20),
        platform: pick(options, 'platform'),
      }),
      raw: Boolean(options.raw),
    });
  }
  if (subcommand === 'generate') {
    const body = addDefined({}, {
      platform: pick(options, 'platform'),
      digest_id: pick(options, 'digest-id'),
      article_id: pick(options, 'article-id'),
      lang: pick(options, 'lang', 'zh'),
    });
    if (!body.platform || (!body.digest_id && !body.article_id)) {
      throw new CliError('Usage: polanews shares generate --platform xiaohongshu --article-id <id>');
    }
    return request(runtime, 'POST', '/api/share/generate', { body, raw: Boolean(options.raw) });
  }
  if (subcommand === 'get') {
    const id = args[0] || pick(options, 'id');
    if (!id) throw new CliError('Usage: polanews shares get <shareId>');
    return request(runtime, 'GET', `/api/share/${id}`, { raw: Boolean(options.raw) });
  }
  throw new CliError(`Unknown shares command: ${subcommand}`);
}

async function handleSourceReach(runtime, subcommand, _args, options) {
  if (!subcommand || subcommand === 'doctor') {
    return request(runtime, 'GET', '/api/source-reach/doctor', {
      query: addDefined({}, { live: options.live ? 'true' : undefined }),
      raw: Boolean(options.raw),
    });
  }
  throw new CliError(`Unknown source-reach command: ${subcommand}`);
}

async function handleMcp(runtime, subcommand, args, options) {
  if (subcommand === 'tools') return request(runtime, 'POST', '/api/mcp', { body: { method: 'tools/list' }, raw: true });
  if (subcommand === 'resources') return request(runtime, 'POST', '/api/mcp', { body: { method: 'resources/list' }, raw: true });
  if (subcommand === 'call') {
    const name = args[0] || pick(options, 'name');
    if (!name) throw new CliError('Usage: polanews mcp call <toolName> --args JSON');
    return request(runtime, 'POST', '/api/mcp', {
      body: {
        method: 'tools/call',
        params: { name, arguments: await readJsonValue(pick(options, 'args')) || {} },
      },
      raw: true,
    });
  }
  if (subcommand === 'read') {
    const uri = args[0] || pick(options, 'uri');
    if (!uri) throw new CliError('Usage: polanews mcp read <resourceUri>');
    return request(runtime, 'POST', '/api/mcp', {
      body: { method: 'resources/read', params: { uri } },
      raw: true,
    });
  }
  throw new CliError(`Unknown mcp command: ${subcommand}`);
}

async function main() {
  const { options, positionals } = parseArgv(process.argv.slice(2));
  const command = positionals[0];
  const subcommand = positionals[1];
  const rest = positionals.slice(2);

  if (!command || command === 'help' || options.help || options.h) {
    printHelp();
    return;
  }

  const runtime = await loadRuntime(options);
  let result;

  switch (command) {
    case 'config':
      result = await handleConfig(runtime, subcommand, options);
      break;
    case 'login':
    case 'register':
      result = await handleAuth(runtime, command, options);
      break;
    case 'api':
      result = await handleApi(runtime, positionals.slice(1), options);
      break;
    case 'articles':
    case 'article':
      result = await handleArticles(runtime, subcommand, rest, options);
      break;
    case 'feeds':
    case 'feed':
      result = await handleFeeds(runtime, subcommand, rest, options);
      break;
    case 'digests':
    case 'digest':
      result = await handleDigests(runtime, subcommand, rest, options);
      break;
    case 'broadcasts':
    case 'broadcast':
      result = await handleBroadcasts(runtime, subcommand, rest, options);
      break;
    case 'shares':
    case 'share':
      result = await handleShares(runtime, subcommand, rest, options);
      break;
    case 'source-reach':
    case 'source':
      result = await handleSourceReach(runtime, subcommand, rest, options);
      break;
    case 'mcp':
      result = await handleMcp(runtime, subcommand, rest, options);
      break;
    default:
      throw new CliError(`Unknown command: ${command}. Run "polanews help".`);
  }

  printResult(result);
}

main().catch((err) => {
  const exitCode = err instanceof CliError ? err.exitCode : 1;
  process.stderr.write(`${err.message || String(err)}\n`);
  process.exit(exitCode);
});
