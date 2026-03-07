'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName || !email || !password || !confirmPwd) {
      setError('请填写所有字段');
      return;
    }
    if (password !== confirmPwd) {
      setError('两次密码输入不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }

    setLoading(true);
    try {
      const data = await api.auth.register(email, password, displayName);
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-black"
            style={{ background: 'var(--accent)' }}
          >
            念
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            创建账号
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            加入一念三千，掌握全球资讯
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
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

          <div className="mb-4">
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>
              用户名
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="你的昵称"
              className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>
              密码
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 个字符"
                className="w-full rounded-lg px-4 py-3 pr-11 text-sm outline-none transition-colors"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-1.5 block text-sm" style={{ color: 'var(--text-secondary)' }}>
              确认密码
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="再次输入密码"
              className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-black transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            注册
          </button>

          <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            已有账号？{' '}
            <Link href="/login" style={{ color: 'var(--accent)' }} className="font-medium hover:underline">
              登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
