import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type SourceReachStatus = 'ok' | 'warn' | 'off' | 'error';

export interface SourceReachChannel {
  status: SourceReachStatus;
  name: string;
  message: string;
  backends: string[];
  active_backend: string | null;
  risk_tier: 'P1' | 'P2' | 'P3';
  requires_config: boolean;
  requires_login: boolean;
  hint: string;
  metadata: Record<string, unknown>;
}

export interface SourceReachDoctorReport {
  project: 'PolaNews';
  checked_at: string;
  live: boolean;
  summary: Record<SourceReachStatus | 'total', number>;
  channels: Record<string, SourceReachChannel>;
  policy: {
    side_effect_free: true;
    database_writes: false;
    secret_values_returned: false;
    login_backends_enabled_by_default: false;
  };
}

export async function getSourceReachDoctor(
  options: { live?: boolean } = {}
): Promise<SourceReachDoctorReport> {
  const live = options.live === true;
  const [github, opencli] = await Promise.all([
    checkGithubChannel(),
    checkOpenCliChannel(),
  ]);

  const channels: Record<string, SourceReachChannel> = {
    rss: channel({
      status: 'ok',
      name: 'RSS ingestion',
      message: 'Built-in rss-parser ingestion is available.',
      backends: ['rss-parser'],
      active_backend: 'rss-parser',
      risk_tier: 'P2',
      requires_config: false,
      requires_login: false,
      hint: '',
      metadata: { concurrency_limit: 15, live_probe_enabled: live },
    }),
    readability: channel({
      status: 'ok',
      name: 'Local article readability',
      message: 'Readability + jsdom extraction is available as the primary fulltext backend.',
      backends: ['@mozilla/readability', 'jsdom'],
      active_backend: '@mozilla/readability',
      risk_tier: 'P2',
      requires_config: false,
      requires_login: false,
      hint: '',
      metadata: { timeout_ms: 15000 },
    }),
    jina_reader: channel({
      status: 'ok',
      name: 'Jina Reader fallback',
      message: 'Jina Reader is configured as a best-effort fallback for public article URLs.',
      backends: ['Jina Reader'],
      active_backend: 'Jina Reader',
      risk_tier: 'P2',
      requires_config: false,
      requires_login: false,
      hint: 'Fallback is only used after local Readability returns no article.',
      metadata: { timeout_ms: 12000, live_probe_enabled: live },
    }),
    v2ex_public: channel({
      status: 'ok',
      name: 'V2EX public signal',
      message: 'Public V2EX API can be used for future topic signals without login.',
      backends: ['V2EX public API'],
      active_backend: 'V2EX public API',
      risk_tier: 'P3',
      requires_config: false,
      requires_login: false,
      hint: 'Not yet wired into ingest; exposed for source planning.',
      metadata: { live_probe_enabled: live },
    }),
    github,
    exa: checkExaChannel(),
    opencli,
  };

  return {
    project: 'PolaNews',
    checked_at: new Date().toISOString(),
    live,
    summary: summarize(channels),
    channels,
    policy: {
      side_effect_free: true,
      database_writes: false,
      secret_values_returned: false,
      login_backends_enabled_by_default: false,
    },
  };
}

async function checkGithubChannel(): Promise<SourceReachChannel> {
  const gh = await probeCommand('gh', ['--version'], 5000);
  const tokenConfigured = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  if (gh.status === 'ok') {
    return channel({
      status: 'ok',
      name: 'GitHub source signal',
      message: 'gh CLI is executable.',
      backends: ['gh CLI', 'GitHub REST API token'],
      active_backend: 'gh CLI',
      risk_tier: 'P3',
      requires_config: false,
      requires_login: false,
      hint: '',
      metadata: { token_configured: tokenConfigured },
    });
  }
  if (tokenConfigured) {
    return channel({
      status: 'ok',
      name: 'GitHub source signal',
      message: 'GitHub token is configured; REST API usage can be added without gh CLI.',
      backends: ['gh CLI', 'GitHub REST API token'],
      active_backend: 'GitHub REST API token',
      risk_tier: 'P3',
      requires_config: false,
      requires_login: false,
      hint: '',
      metadata: { token_configured: true },
    });
  }
  return channel({
    status: gh.status === 'missing' ? 'off' : 'error',
    name: 'GitHub source signal',
    message: gh.message,
    backends: ['gh CLI', 'GitHub REST API token'],
    active_backend: null,
    risk_tier: 'P3',
    requires_config: true,
    requires_login: false,
    hint: 'Optional. Install gh or configure GITHUB_TOKEN when GitHub release/repo signals are needed.',
    metadata: { token_configured: false },
  });
}

function checkExaChannel(): SourceReachChannel {
  const configured = Boolean(process.env.EXA_API_KEY);
  return channel({
    status: configured ? 'ok' : 'off',
    name: 'Exa search signal',
    message: configured ? 'EXA_API_KEY is configured.' : 'EXA_API_KEY is not configured.',
    backends: ['Exa API', 'Exa MCP'],
    active_backend: configured ? 'Exa API' : null,
    risk_tier: 'P2',
    requires_config: !configured,
    requires_login: false,
    hint: configured ? '' : 'Optional. Configure EXA_API_KEY only when semantic web search is enabled.',
    metadata: { api_key_configured: configured },
  });
}

async function checkOpenCliChannel(): Promise<SourceReachChannel> {
  const result = await probeCommand('opencli', ['--version'], 5000);
  if (result.status === 'ok') {
    return channel({
      status: 'ok',
      name: 'Browser-mediated source tools',
      message: 'OpenCLI command is executable.',
      backends: ['OpenCLI'],
      active_backend: 'OpenCLI',
      risk_tier: 'P1',
      requires_config: false,
      requires_login: true,
      hint: 'Use only for explicit local desktop workflows, not background production ingest.',
      metadata: {},
    });
  }
  return channel({
    status: result.status === 'missing' ? 'off' : 'error',
    name: 'Browser-mediated source tools',
    message: result.message,
    backends: ['OpenCLI'],
    active_backend: null,
    risk_tier: 'P1',
    requires_config: true,
    requires_login: true,
    hint: 'Optional and disabled for production automation unless explicitly configured.',
    metadata: {},
  });
}

async function probeCommand(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ status: 'ok' | 'missing' | 'timeout' | 'error'; message: string }> {
  try {
    await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      env: process.env,
    });
    return { status: 'ok', message: `${command} command is executable.` };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; stderr?: string };
    if (err.code === 'ENOENT') {
      return { status: 'missing', message: `${command} is not on PATH.` };
    }
    if (err.killed || err.signal === 'SIGTERM') {
      return { status: 'timeout', message: `${command} probe timed out after ${timeoutMs}ms.` };
    }
    return { status: 'error', message: compact(err.message || `${command} probe failed.`) };
  }
}

function channel(input: Omit<SourceReachChannel, 'message' | 'hint'> & { message: string; hint: string }): SourceReachChannel {
  return {
    ...input,
    message: compact(input.message),
    hint: compact(input.hint),
  };
}

function summarize(channels: Record<string, SourceReachChannel>): Record<SourceReachStatus | 'total', number> {
  const summary: Record<SourceReachStatus | 'total', number> = {
    ok: 0,
    warn: 0,
    off: 0,
    error: 0,
    total: Object.keys(channels).length,
  };
  for (const item of Object.values(channels)) {
    summary[item.status] += 1;
  }
  return summary;
}

function compact(message: string): string {
  return String(message || '')
    .replace(/(api[_ -]?key|token|password|secret|authorization|cookie)=\S+/gi, '[redacted]')
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}
