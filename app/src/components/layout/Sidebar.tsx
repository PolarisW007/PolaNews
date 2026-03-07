'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Zap,
  LayoutGrid,
  Settings,
  Rss,
  Star,
  Bookmark,
  Clock,
  FileText,
  Radio,
  Share2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';

interface FeedItem {
  id: string;
  title: string;
  category: string;
  favicon_url: string;
}

const mainNavItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/trending', label: '热门趋势', icon: Zap },
  { href: '/categories', label: '全部分类', icon: LayoutGrid },
  { href: '/digest', label: 'Daily Digest', icon: FileText },
  { href: '/broadcast', label: '播报', icon: Radio },
  { href: '/share', label: '分享', icon: Share2 },
];

const userNavItems = [
  { href: '/starred', label: '我的收藏', icon: Star },
  { href: '/saved', label: '稍后阅读', icon: Bookmark },
  { href: '/history', label: '阅读历史', icon: Clock },
];

const bottomItems = [
  { href: '/subscriptions', label: '订阅管理', icon: Rss },
  { href: '/settings', label: '设置', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [feedsExpanded, setFeedsExpanded] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/feeds`)
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) {
          setFeeds(json.data);
        }
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const feedsByCategory = feeds.reduce<Record<string, FeedItem[]>>((acc, f) => {
    const cat = f.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const renderNavItem = (item: { href: string; label: string; icon: React.ComponentType<{ size?: number }> }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={clsx(
            'relative flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors',
            active ? 'font-medium' : 'hover:opacity-80',
          )}
          style={{
            color: active ? 'var(--accent)' : 'var(--text-secondary)',
            backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          {active && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
              style={{ width: 2, height: 20, backgroundColor: 'var(--accent)' }}
            />
          )}
          <Icon size={18} />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col"
      style={{
        width: 260,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div className="px-6 py-8">
        <h1
          className="text-xl font-bold tracking-wide"
          style={{ color: 'var(--accent)' }}
        >
          一念三千
        </h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          全球资讯 AI 聚合
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {mainNavItems.map(renderNavItem)}
        </ul>

        {/* 用户功能 */}
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <p className="mb-2 px-4 text-xs font-medium" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
            个人
          </p>
          <ul className="space-y-1">
            {userNavItems.map(renderNavItem)}
          </ul>
        </div>

        {/* 信源分组 */}
        {feeds.length > 0 && (
          <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setFeedsExpanded(!feedsExpanded)}
              className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium"
              style={{ color: 'var(--text-secondary)', opacity: 0.6 }}
            >
              <span>信源 ({feeds.length})</span>
              {feedsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {feedsExpanded && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(feedsByCategory).map(([cat, catFeeds]) => (
                  <div key={cat}>
                    <button
                      onClick={() => toggleCat(cat)}
                      className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-xs transition-colors hover:opacity-80"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {expandedCats.has(cat) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span className="font-medium">{cat}</span>
                      <span className="ml-auto text-xs" style={{ opacity: 0.5 }}>{catFeeds.length}</span>
                    </button>
                    {expandedCats.has(cat) && (
                      <ul className="ml-4 space-y-0.5">
                        {catFeeds.map(f => {
                          const href = `/?feed_id=${f.id}`;
                          const active = pathname === '/' && typeof window !== 'undefined' && window.location.search.includes(f.id);
                          return (
                            <li key={f.id}>
                              <Link
                                href={href}
                                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:opacity-80"
                                style={{
                                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                  backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                                }}
                              >
                                {f.favicon_url && (
                                  <img src={f.favicon_url} alt="" className="h-3.5 w-3.5 rounded" />
                                )}
                                <span className="truncate">{f.title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="px-3 pb-6" style={{ borderTop: '1px solid var(--border)' }}>
        <ul className="mt-4 space-y-1">
          {bottomItems.map(renderNavItem)}
        </ul>
      </div>
    </aside>
  );
}
