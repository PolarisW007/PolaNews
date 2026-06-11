import { NextRequest } from 'next/server';

export interface AipdPreferences {
  theme?: string;
  font_family?: string;
  font_scale?: string;
  density?: string;
}

export interface AipdProfile {
  id: number;
  username: string;
  email: string;
  nickname?: string;
  avatar_url?: string;
  preferences?: AipdPreferences;
}

export interface AipdSessionResult {
  authorized: boolean;
  user?: AipdProfile;
}

const POLAUUH_INTERNAL_BASE_URL =
  process.env.POLAUUH_INTERNAL_BASE_URL ||
  process.env.POLAUUH_BASE_URL ||
  process.env.AIPD_INTERNAL_BASE_URL ||
  'http://127.0.0.1:5017';
const POLAUUH_PUBLIC_BASE_URL =
  process.env.POLAUUH_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_POLAUUH_BASE_URL ||
  'https://aipd.me/PolaUUH';
const POLAUUH_SSO_CHECK_PATH =
  process.env.POLAUUH_SSO_CHECK_PATH ||
  process.env.AIPD_SSO_CHECK_PATH ||
  '/admin/api/sso/check';
const POLAUUH_APP_ID = process.env.POLAUUH_APP_ID || process.env.AIPD_APP_ID || 'PolaNews';
const POLAUUH_PERMISSION = process.env.POLAUUH_PERMISSION || process.env.AIPD_PERMISSION || 'polanews.use';
const POLAUUH_DEFAULT_RETURN_PATH =
  process.env.POLAUUH_DEFAULT_RETURN_PATH ||
  process.env.AIPD_DEFAULT_RETURN_PATH ||
  `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/login?sso=1`;

function safeReturnPath(path?: string | null): string {
  const candidate = path || POLAUUH_DEFAULT_RETURN_PATH;
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : POLAUUH_DEFAULT_RETURN_PATH;
}

function withNext(baseUrl: string, next?: string | null): string {
  const url = new URL(baseUrl);
  url.searchParams.set('next', safeReturnPath(next));
  return url.toString();
}

export function buildPolauuhAuthUrls(next?: string | null) {
  const publicBase = POLAUUH_PUBLIC_BASE_URL.replace(/\/$/, '');
  return {
    login_url: withNext(process.env.POLAUUH_LOGIN_URL || `${publicBase}/admin/login`, next),
    register_url: withNext(process.env.POLAUUH_REGISTER_URL || `${publicBase}/admin/register`, next),
    local_auth_enabled: process.env.POLANEWS_LOCAL_AUTH_ENABLED === 'true',
  };
}

function cookieFromRequest(req: NextRequest): string {
  return req.headers.get('cookie') || '';
}

export async function checkPolauuhSession(req: NextRequest): Promise<AipdSessionResult | null> {
  const cookie = cookieFromRequest(req);
  if (!cookie) return null;

  let resp: Response;
  try {
    const checkUrl = `${POLAUUH_INTERNAL_BASE_URL.replace(/\/$/, '')}/${POLAUUH_SSO_CHECK_PATH.replace(/^\//, '')}`;
    resp = await fetch(checkUrl, {
      method: 'POST',
      headers: { cookie, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: POLAUUH_APP_ID, permission: POLAUUH_PERMISSION }),
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (resp.status === 403) return { authorized: false };
  if (!resp.ok) return null;

  return await resp.json() as AipdSessionResult;
}

export async function checkAipdSession(req: NextRequest): Promise<AipdSessionResult | null> {
  return checkPolauuhSession(req);
}

export async function getPolauuhPreferences(req: NextRequest): Promise<AipdPreferences> {
  try {
    const session = await checkPolauuhSession(req);
    if (!session?.authorized) return {};
    return session.user?.preferences || {};
  } catch {
    return {};
  }
}

export async function getAipdPreferences(req: NextRequest): Promise<AipdPreferences> {
  return getPolauuhPreferences(req);
}

export async function updatePolauuhPreferences(
  req: NextRequest,
  values: AipdPreferences,
): Promise<AipdPreferences> {
  const cookie = cookieFromRequest(req);
  if (!cookie) return {};

  try {
    const preferencesUrl = `${POLAUUH_INTERNAL_BASE_URL.replace(/\/$/, '')}/api/preferences`;
    const resp = await fetch(preferencesUrl, {
      method: 'POST',
      headers: { cookie, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(values),
      cache: 'no-store',
    });
    if (!resp.ok) return {};
    const payload = await resp.json() as { user?: { preferences?: AipdPreferences } };
    return payload.user?.preferences || {};
  } catch {
    return {};
  }
}

export async function updateAipdPreferences(
  req: NextRequest,
  values: AipdPreferences,
): Promise<AipdPreferences> {
  return updatePolauuhPreferences(req, values);
}
