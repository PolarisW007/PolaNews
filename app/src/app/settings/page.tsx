'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, Settings, Eye, EyeOff, Lock } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface UserSettings {
  display_name: string;
  email: string;
  language: string;
  digest_language: string;
  theme: string;
  digest_times: string[];
  followed_categories: string[];
}

const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

const THEMES = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' },
];

const DIGEST_TIMES = ['08:00', '12:00', '20:00'];

const CATEGORIES = [
  { value: 'tech', label: '科技' },
  { value: 'finance', label: '财经' },
  { value: 'politics', label: '政治' },
  { value: 'ai', label: 'AI' },
  { value: 'military', label: '军事' },
  { value: 'society', label: '社会' },
];

/** 立即应用主题到 document */
function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings>({
    display_name: '',
    email: '',
    language: 'zh',
    digest_language: 'zh',
    theme: 'dark',
    digest_times: ['08:00'],
    followed_categories: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // 密码修改
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.settings.get() as UserSettings;
      setSettings(data);
    } catch (e) { toast(e instanceof Error ? e.message : '加载设置失败，请重试', 'error'); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.settings.update(settings as unknown as Record<string, unknown>);
      setSaved(true);
      toast('设置已保存', 'success');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { toast(e instanceof Error ? e.message : '保存设置失败，请重试', 'error'); }
    setSaving(false);
  };

  const toggleDigestTime = (time: string) => {
    setSettings(prev => ({
      ...prev,
      digest_times: prev.digest_times.includes(time)
        ? prev.digest_times.filter(t => t !== time)
        : [...prev.digest_times, time],
    }));
  };

  const toggleCategory = (cat: string) => {
    setSettings(prev => ({
      ...prev,
      followed_categories: prev.followed_categories.includes(cat)
        ? prev.followed_categories.filter(c => c !== cat)
        : [...prev.followed_categories, cat],
    }));
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast('请填写所有密码字段', 'error'); return;
    }
    if (newPassword !== confirmPassword) {
      toast('新密码两次输入不一致', 'error'); return;
    }
    if (newPassword.length < 6) {
      toast('新密码至少需要6位', 'error'); return;
    }
    setChangingPassword(true);
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${basePath}/api/settings/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        toast('密码修改成功', 'success');
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        toast(data.error || '密码修改失败', 'error');
      }
    } catch {
      toast('网络错误，请稍后再试', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="flex items-center gap-3 mb-8">
          <Settings size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            个人设置
          </h1>
        </div>

        <div className="space-y-6">
          {/* 基本信息 */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-medium uppercase tracking-wider mb-5" style={{ color: 'var(--accent)' }}>
              基本信息
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  显示名称
                </label>
                <input
                  type="text"
                  value={settings.display_name}
                  onChange={e => setSettings({ ...settings, display_name: e.target.value })}
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  邮箱（不可修改）
                </label>
                <input
                  type="email"
                  value={settings.email}
                  readOnly
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>
          </section>

          {/* 语言偏好 */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-medium uppercase tracking-wider mb-5" style={{ color: 'var(--accent)' }}>
              语言偏好
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  界面语言
                </label>
                <select
                  value={settings.language}
                  onChange={e => setSettings({ ...settings, language: e.target.value })}
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  摘要首选语言
                </label>
                <select
                  value={settings.digest_language}
                  onChange={e => setSettings({ ...settings, digest_language: e.target.value })}
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 主题 */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-medium uppercase tracking-wider mb-5" style={{ color: 'var(--accent)' }}>
              主题
            </h2>
            <div className="flex gap-3">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => {
                    setSettings({ ...settings, theme: t.value });
                    applyTheme(t.value);
                  }}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
                  style={{
                    backgroundColor: settings.theme === t.value ? 'var(--accent)' : 'var(--bg-primary)',
                    color: settings.theme === t.value ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: `1px solid ${settings.theme === t.value ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* Digest 推送时间 */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-medium uppercase tracking-wider mb-5" style={{ color: 'var(--accent)' }}>
              Digest 推送时间
            </h2>
            <div className="flex gap-3">
              {DIGEST_TIMES.map(time => {
                const active = settings.digest_times.includes(time);
                return (
                  <button
                    key={time}
                    onClick={() => toggleDigestTime(time)}
                    className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(0,230,118,0.1)' : 'var(--bg-primary)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {active && <Check size={14} />}
                    {time}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 关注分类 */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <h2 className="text-sm font-medium uppercase tracking-wider mb-5" style={{ color: 'var(--accent)' }}>
              关注分类
            </h2>
            <div className="flex flex-wrap gap-3">
              {CATEGORIES.map(cat => {
                const active = settings.followed_categories.includes(cat.value);
                return (
                  <button
                    key={cat.value}
                    onClick={() => toggleCategory(cat.value)}
                    className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(0,230,118,0.1)' : 'var(--bg-primary)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {active && <Check size={14} />}
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </section>
          {/* 修改密码 */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-5">
              <Lock size={16} style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                修改密码
              </h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>当前密码</label>
                <div className="relative">
                  <input
                    type={showOldPw ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    placeholder="输入当前密码"
                    className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                  <button
                    onClick={() => setShowOldPw(!showOldPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {showOldPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>新密码</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                  <button
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
                className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {changingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                确认修改密码
              </button>
            </div>
          </section>
        </div>

        {/* 保存按钮 */}
        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : '保存设置'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm animate-fade-in" style={{ color: 'var(--accent)' }}>
              <Check size={16} /> 设置已保存
            </span>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
