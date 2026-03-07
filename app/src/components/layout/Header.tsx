'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, LogIn } from 'lucide-react';

export default function Header() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsLoggedIn(!!localStorage.getItem('auth_token'));
  }, []);

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
      className="fixed top-0 right-0 z-30 flex items-center justify-between px-6"
      style={{
        left: 260,
        height: 64,
        backgroundColor: 'rgba(10, 15, 13, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="relative w-full max-w-md">
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

      <div className="flex items-center gap-3">
        {mounted && isLoggedIn ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
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
            </button>
            {showUserMenu && (
              <div
                className="absolute right-0 top-full mt-1 min-w-[140px] rounded-lg py-1"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <button
                  className="block w-full px-4 py-2 text-left text-sm transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={() => {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user');
                    window.location.reload();
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : mounted ? (
          <a
            href="/login"
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: 'var(--bg-primary)',
              backgroundColor: 'var(--accent)',
            }}
          >
            <LogIn size={16} />
            登录
          </a>
        ) : null}
      </div>
    </header>
  );
}
