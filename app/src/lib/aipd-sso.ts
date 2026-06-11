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

const AIPD_INTERNAL_BASE_URL = process.env.AIPD_INTERNAL_BASE_URL || 'http://127.0.0.1:5000';
const AIPD_APP_ID = process.env.AIPD_APP_ID || 'PolaNews';
const AIPD_PERMISSION = process.env.AIPD_PERMISSION || 'polanews.use';

function cookieFromRequest(req: NextRequest): string {
  return req.headers.get('cookie') || '';
}

export async function checkAipdSession(req: NextRequest): Promise<AipdSessionResult | null> {
  const cookie = cookieFromRequest(req);
  if (!cookie) return null;

  let resp: Response;
  try {
    resp = await fetch(`${AIPD_INTERNAL_BASE_URL}/admin/api/sso/check`, {
      method: 'POST',
      headers: { cookie, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: AIPD_APP_ID, permission: AIPD_PERMISSION }),
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (resp.status === 403) return { authorized: false };
  if (!resp.ok) return null;

  return await resp.json() as AipdSessionResult;
}

export async function getAipdPreferences(req: NextRequest): Promise<AipdPreferences> {
  try {
    const session = await checkAipdSession(req);
    if (!session?.authorized) return {};
    return session.user?.preferences || {};
  } catch {
    return {};
  }
}

export async function updateAipdPreferences(
  req: NextRequest,
  values: AipdPreferences,
): Promise<AipdPreferences> {
  const cookie = cookieFromRequest(req);
  if (!cookie) return {};

  try {
    const resp = await fetch(`${AIPD_INTERNAL_BASE_URL}/admin/api/preferences`, {
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
