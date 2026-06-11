'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, LogIn, Menu, LogOut, Settings } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

interface StoredUser {
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

const AUTH_CHANGE_EVENT = 'polanews-auth-change';

function subscribeAuth(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(AUTH_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
  };
}

function readAuthSnapshot() {
  return JSON.stringify({
    token: localStorage.getItem('auth_token') || '',
    user: localStorage.getItem('user') || '',
  });
}

function parseStoredUser(value: string): StoredUser | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as StoredUser;
  } catch {
    return null;
  }
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [fetchedUser, setFetchedUser] = useState<StoredUser | null>(null);
  const authSnapshot = useSyncExternalStore(
    subscribeAuth,
    readAuthSnapshot,
    () => JSON.stringify({ token: '', user: '' }),
  );
  const authState = useMemo(() => {
    try {
      return JSON.parse(authSnapshot) as { token: string; user: string };
    } catch {
      return { token: '', user: '' };
    }
  }, [authSnapshot]);
  const storedUser = useMemo(() => parseStoredUser(authState.user), [authState.user]);
  const user = storedUser || fetchedUser;
  const isLoggedIn = Boolean(authState.token);
  const displayName = user?.display_name || user?.email || '用户';

  useEffect(() => {
    if (isLoggedIn) return;
    let cancelled = false;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/api/auth/sso/aipd`, { method: 'POST', credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.success) return;
        localStorage.setItem('auth_token', data.data.token);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || storedUser) return;
    let cancelled = false;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authState.token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.success) return;
        const nextUser = data.data as StoredUser;
        setFetchedUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authState.token, isLoggedIn, storedUser]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <header
      className="fixed top-0 right-0 z-30 flex items-center justify-between px-3 sm:px-4 lg:px-6 left-0 lg:left-[260px] h-[56px] lg:h-[64px]"
      style={{
        backgroundColor: 'var(--header-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden flex items-center justify-center rounded-lg p-2 -ml-1 transition-colors active:scale-95"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="菜单"
        >
          <Menu size={22} />
        </button>

        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            onClick={handleSearch}
          />
          <input
            type="text"
            placeholder="搜索全球资讯..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-full py-2 pl-10 pr-4 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-2 shrink-0">
        {isLoggedIn ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors max-w-[220px]"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-hover)',
                  color: 'var(--accent)',
                  border: '1px solid var(--border)',
                }}
              >
                <User size={16} />
              </div>
              <span className="hidden sm:block truncate text-sm font-medium">
                {displayName}
              </span>
            </button>
            {showUserMenu && (
              <div
                className="absolute right-0 top-full mt-2 min-w-[220px] rounded-lg py-2 shadow-xl"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.32)',
                }}
              >
                <div className="border-b px-4 pb-2 mb-1" style={{ borderColor: 'var(--border)' }}>
                  <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {displayName}
                  </div>
                  {user?.email && (
                    <div className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {user.email}
                    </div>
                  )}
                </div>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => {
                    setShowUserMenu(false);
                    router.push('/settings');
                  }}
                >
                  <Settings size={14} />
                  设置
                </button>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user');
                    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
                    window.location.reload();
                  }}
                >
                  <LogOut size={14} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (
          <a
            href="/login"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              color: 'var(--bg-primary)',
              backgroundColor: 'var(--accent)',
            }}
          >
            <LogIn size={14} />
            <span>登录</span>
          </a>
        )}
      </div>
    </header>
  );
}
