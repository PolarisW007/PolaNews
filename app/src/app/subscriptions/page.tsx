'use client';

import { useState, useEffect, useCallback } from 'react';
import { Rss, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api-client';

interface Feed {
  id: string;
  title: string;
  url: string;
  site_url: string;
  category: string;
  language: string;
  status: string;
  is_preset: number;
}

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newFeed, setNewFeed] = useState({ url: '', title: '', category: 'general' });
  const [adding, setAdding] = useState(false);

  const loadFeeds = useCallback(async () => {
    try {
      const data = await api.feeds.list() as Feed[];
      setFeeds(data);
    } catch {
      toast('加载订阅源失败', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  const handleAdd = async () => {
    if (!newFeed.url.trim()) return;
    setAdding(true);
    try {
      await api.feeds.add(newFeed.url, newFeed.title || newFeed.url, newFeed.category);
      setNewFeed({ url: '', title: '', category: 'general' });
      setShowAdd(false);
      toast('订阅源添加成功', 'success');
      loadFeeds();
    } catch {
      toast('添加订阅源失败', 'error');
    }
    setAdding(false);
  };

  const categories = [...new Set(feeds.map(f => f.category))];

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              订阅源管理
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              管理你的 RSS 订阅源，共 {feeds.length} 个
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            <Plus size={16} /> 添加源
          </button>
        </div>

        {showAdd && (
          <div
            className="mb-6 rounded-xl p-6"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
              添加自定义 RSS 源
            </h3>
            <div className="space-y-3">
              <input
                type="url"
                placeholder="RSS Feed URL"
                value={newFeed.url}
                onChange={e => setNewFeed({ ...newFeed, url: e.target.value })}
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="名称（可选）"
                  value={newFeed.title}
                  onChange={e => setNewFeed({ ...newFeed, title: e.target.value })}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
                <select
                  value={newFeed.category}
                  onChange={e => setNewFeed({ ...newFeed, category: e.target.value })}
                  className="rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  <option value="general">综合</option>
                  <option value="tech">科技</option>
                  <option value="international">国际</option>
                  <option value="finance">财经</option>
                  <option value="ai">AI</option>
                </select>
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="rounded-lg px-6 py-2.5 text-sm font-medium"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                >
                  {adding ? <Loader2 size={16} className="animate-spin" /> : '添加'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton rounded-xl h-20" />
            ))}
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat} className="mb-8">
              <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--accent)' }}>
                {cat}
              </h2>
              <div className="space-y-2">
                {feeds.filter(f => f.category === cat).map(feed => (
                  <div
                    key={feed.id}
                    className="flex items-center justify-between rounded-xl px-5 py-4 glow-border"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <Rss size={18} style={{ color: 'var(--accent-secondary)' }} />
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {feed.title}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {feed.url.length > 60 ? feed.url.slice(0, 60) + '...' : feed.url}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: feed.status === 'active' ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)',
                          color: feed.status === 'active' ? 'var(--accent)' : 'var(--danger)',
                        }}
                      >
                        {feed.status}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                        {feed.language}
                      </span>
                      {feed.site_url && (
                        <a href={feed.site_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={14} style={{ color: 'var(--text-secondary)' }} />
                        </a>
                      )}
                      {!feed.is_preset && (
                        <button
                          className="p-1 rounded hover:opacity-80"
                          onClick={async () => {
                            if (!confirm(`确认删除订阅源「${feed.title}」？相关文章也会被删除。`)) return;
                            try {
                              await api.feeds.delete(feed.id);
                              toast('订阅源已删除', 'success');
                              loadFeeds();
                            } catch {
                              toast('删除订阅源失败', 'error');
                            }
                          }}
                        >
                          <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </MainLayout>
  );
}
