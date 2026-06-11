'use client';

import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn, UserPlus } from 'lucide-react';

interface SsoLinks {
  login_url: string;
  register_url: string;
  local_auth_enabled: boolean;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPanel />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginPanel({ children }: { children?: ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-md animate-fade-in">
        {children ?? (
          <section
            className="rounded-2xl border p-8 text-center text-sm"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            正在加载登录入口
          </section>
        )}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => {
    const candidate = searchParams.get('next') || '/';
    return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
  }, [searchParams]);
  const [links, setLinks] = useState<SsoLinks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const returnPath = useMemo(() => {
    const query = new URLSearchParams({ sso: '1', next: nextPath }).toString();
    return `${BASE_PATH}/login?${query}`;
  }, [nextPath]);

  const loadLinks = useCallback(async () => {
    const response = await fetch(`${BASE_PATH}/api/auth/sso/urls?next=${encodeURIComponent(returnPath)}`, {
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error || '无法获取 PolaUUH 登录地址');
    setLinks(payload.data);
    return payload.data as SsoLinks;
  }, [returnPath]);

  const completeSso = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${BASE_PATH}/api/auth/sso/polauuh`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error || 'PolaUUH 登录态无效');
      localStorage.setItem('auth_token', payload.data.token);
      localStorage.setItem('user', JSON.stringify(payload.data.user));
      window.dispatchEvent(new Event('polanews-auth-change'));
      router.replace(nextPath.startsWith('/') ? nextPath : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '统一账号登录失败');
    } finally {
      setLoading(false);
    }
  }, [nextPath, router]);

  useEffect(() => {
    loadLinks().catch((err) => setError(err instanceof Error ? err.message : '无法连接 PolaUUH'));
  }, [loadLinks]);

  useEffect(() => {
    if (searchParams.get('sso') === '1') {
      completeSso();
    }
  }, [completeSso, searchParams]);

  async function goLogin() {
    setLoading(true);
    setError('');
    try {
      const currentLinks = links || await loadLinks();
      window.location.assign(currentLinks.login_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法跳转 PolaUUH');
      setLoading(false);
    }
  }

  async function goRegister() {
    setLoading(true);
    setError('');
    try {
      const currentLinks = links || await loadLinks();
      window.location.assign(currentLinks.register_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法跳转 PolaUUH 注册');
      setLoading(false);
    }
  }

  return (
    <LoginPanel>
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-black"
            style={{ background: 'var(--accent)' }}
          >
            念
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            一念三千
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            使用 PolaUUH 统一账号进入全球资讯工作台
          </p>
        </div>

        <section
          className="rounded-2xl border p-8"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          {error && (
            <div
              className="mb-4 rounded-lg px-4 py-3 text-sm"
              style={{ background: 'rgba(255,82,82,0.1)', color: '#FF5252' }}
            >
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={goLogin}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-black transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            使用 PolaUUH 登录
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={goRegister}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border py-3 text-sm font-semibold transition-all disabled:opacity-60"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <UserPlus size={16} />
            注册统一账号
          </button>

          <p className="mt-5 text-center text-xs leading-6" style={{ color: 'var(--text-secondary)' }}>
            账号、注册和应用权限统一由 PolaUUH 管理，登录后会自动回到当前资讯页面。
          </p>
        </section>
    </LoginPanel>
  );
}
