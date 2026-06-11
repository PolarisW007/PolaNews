'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, UserPlus } from 'lucide-react';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function RegisterPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    const returnPath = `${BASE_PATH}/login?sso=1`;
    fetch(`${BASE_PATH}/api/auth/sso/urls?next=${encodeURIComponent(returnPath)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.success) throw new Error(payload.error || '无法获取 PolaUUH 注册地址');
        window.location.assign(payload.data.register_url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '无法跳转 PolaUUH 注册'));
  }, []);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <section
        className="w-full max-w-md rounded-2xl border p-8 text-center"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-black"
          style={{ background: 'var(--accent)' }}
        >
          <UserPlus size={26} />
        </div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          跳转 PolaUUH 注册
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          PolaNews 使用统一账号中心创建账号。完成注册后会回到一念三千。
        </p>
        {error ? (
          <p className="mt-4 text-sm" style={{ color: '#FF5252' }}>
            {error}
          </p>
        ) : (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 size={16} className="animate-spin" />
            正在打开统一注册页
          </p>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm" style={{ color: 'var(--accent)' }}>
          返回登录
        </Link>
      </section>
    </div>
  );
}
