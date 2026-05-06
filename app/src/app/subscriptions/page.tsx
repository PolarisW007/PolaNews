'use client';

import { useState, useEffect, useCallback } from 'react';
import { Rss, Plus, Trash2, Loader2, ExternalLink, Upload, Download, RefreshCw } from 'lucide-react';
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

  const [importing, setImporting] = useState(false);
  const [fetching, setFetching] = useState(false);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  /** 立即抓取：触发完整管道（fetch → translate → classify → TTS），后台异步跑 */
  const handleFetchAll = async () => {
    if (fetching) return;
    setFetching(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${basePath}/api/feeds/fetch`, { method: 'POST', headers });
      const json = await res.json();
      if (json.success) {
        const counters = json.data || {};
        toast(
          `抓取完成：新增 ${counters.articles_count ?? 0} 篇，翻译 ${counters.newly_translated ?? 0}，合成语音 ${counters.newly_voiced ?? 0}`,
          'success'
        );
        loadFeeds();
      } else {
        toast(json.error || '抓取失败', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '抓取失败', 'error');
    } finally {
      setFetching(false);
    }
  };

  const handleImportOPML = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.opml,.xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const opmlText = await file.text();
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${basePath}/api/subscriptions/import`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ opml: opmlText }),
        });
        const json = await res.json();
        if (json.success) {
          toast(`OPML 导入成功，共导入 ${json.data?.imported ?? json.data?.imported_count ?? ''} 个订阅源`, 'success');
          loadFeeds();
        } else {
          toast(`导入失败：${json.error || '未知错误'}`, 'error');
        }
      } catch {
        toast('导入 OPML 文件失败', 'error');
      }
      setImporting(false);
    };
    input.click();
  };

  const handleExportOPML = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${basePath}/api/subscriptions/export`, { headers });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'subscriptions.opml';
      a.click();
      URL.revokeObjectURL(url);
      toast('OPML 文件已下载', 'success');
    } catch {
      toast('导出 OPML 失败', 'error');
    }
  };

  const categories = [...new Set(feeds.map(f => f.category))];

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start sm:items-center justify-between gap-3 mb-3 sm:mb-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                订阅源管理
              </h1>
              <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                管理你的 RSS 订阅源，共 {feeds.length} 个
              </p>
            </div>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium shrink-0"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              <Plus size={16} /> <span className="hidden sm:inline">添加源</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetchAll}
              disabled={fetching}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-black transition-colors hover:brightness-110 disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)' }}
              title="立即触发完整抓取管道：fetch → translate → classify → TTS（约需 2-3 分钟）"
            >
              {fetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="hidden sm:inline">立即</span>抓取
            </button>
            <button
              onClick={handleImportOPML}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span className="hidden sm:inline">导入</span> OPML
            </button>
            <button
              onClick={handleExportOPML}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Download size={14} />
              <span className="hidden sm:inline">导出</span> OPML
            </button>
          </div>
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
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="名称（可选）"
                  value={newFeed.title}
                  onChange={e => setNewFeed({ ...newFeed, title: e.target.value })}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
                <div className="flex gap-3">
                  <select
                    value={newFeed.category}
                    onChange={e => setNewFeed({ ...newFeed, category: e.target.value })}
                    className="flex-1 sm:flex-none rounded-lg px-4 py-2.5 text-sm outline-none"
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
                    className="rounded-lg px-6 py-2.5 text-sm font-medium shrink-0"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                  >
                    {adding ? <Loader2 size={16} className="animate-spin" /> : '添加'}
                  </button>
                </div>
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
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 rounded-xl px-3 sm:px-5 py-3 sm:py-4 glow-border"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <Rss size={16} className="shrink-0" style={{ color: 'var(--accent-secondary)' }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {feed.title}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {feed.url}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 ml-6 sm:ml-0 shrink-0">
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: feed.status === 'active' ? 'rgba(0,255,157,0.1)' : 'rgba(255,82,82,0.1)',
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
                          className="p-1.5 rounded hover:opacity-80"
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
