'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Clock, Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface Article {
  id: string;
  title: string;
  summary: string;
  feed_title: string;
  feed_favicon?: string;
  published_at: string;
  cover_image: string;
}

export default function HistoryPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const fetchHistory = useCallback(async (p: number, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const data = await api.history.list(p, 20) as { articles: Article[] };
      const list = data.articles || [];
      if (append) setArticles(prev => [...prev, ...list]);
      else setArticles(list);
      setHasMore(list.length >= 20);
    } catch (e) {
      toast(e instanceof Error ? e.message : '获取阅读历史失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => { fetchHistory(1); }, [fetchHistory]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchHistory(next, true);
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="mb-8 flex items-center gap-3">
          <Clock size={24} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>阅读历史</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>你读过的所有文章</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <Clock size={48} style={{ color: 'var(--text-disabled)' }} />
            <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              暂无阅读历史，请先登录并阅读文章
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {articles.map(article => (
                <Link key={article.id} href={`/article/${article.id}`}>
                  <div
                    className="glow-border cursor-pointer rounded-xl p-5 transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {article.title}
                        </h3>
                        <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {article.feed_favicon && <img src={article.feed_favicon} alt="" className="h-4 w-4 rounded" />}
                          <span>{article.feed_title}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(article.published_at), { addSuffix: true, locale: zhCN })}</span>
                        </div>
                        {article.summary && (
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {article.summary.length > 120 ? article.summary.slice(0, 120) + '...' : article.summary}
                          </p>
                        )}
                      </div>
                      {article.cover_image && (
                        <img src={article.cover_image} alt="" className="rounded-lg object-cover" style={{ width: 100, height: 70 }} />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {loadingMore && <Loader2 size={16} className="animate-spin" />}
                  {loadingMore ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
