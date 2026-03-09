'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Bookmark, Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface SavedArticle {
  id: string;
  article_id: string;
  title: string;
  summary: string;
  feed_title: string;
  published_at: string;
  category: string;
  cover_image?: string;
}

interface SavedResult {
  articles: SavedArticle[];
  total: number;
}

export default function SavedPage() {
  const { toast } = useToast();
  const [articles, setArticles] = useState<SavedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.saved.list({ page, limit }) as SavedResult;
      if (page === 1) setArticles(data.articles);
      else setArticles(prev => [...prev, ...data.articles]);
      setTotal(data.total);
    } catch (e) { toast(e instanceof Error ? e.message : '加载失败，请重试', 'error'); }
    setLoading(false);
  }, [page, toast]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (articleId: string) => {
    try {
      await api.saved.remove(articleId);
      setArticles(prev => prev.filter(a => (a.article_id || a.id) !== articleId));
      setTotal(prev => prev - 1);
    } catch (e) { toast(e instanceof Error ? e.message : '移除失败，请重试', 'error'); }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: zhCN });
    } catch {
      return dateStr;
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-3 sm:px-5 animate-fade-in">
        <div className="mb-5 sm:mb-8">
          <div className="flex items-center gap-3 mb-1">
            <Bookmark size={24} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              稍后阅读
            </h1>
          </div>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
            共 {total} 篇待读
          </p>
        </div>

        <div className="space-y-3">
          {articles.map(article => (
            <div
              key={article.id}
              className="flex flex-wrap items-start gap-3 sm:gap-4 rounded-xl p-3 sm:p-5 glow-border"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <Link href={`/article/${article.article_id || article.id}`} className="flex-1 min-w-0 cursor-pointer">
                <h3 className="text-sm font-medium leading-relaxed line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                  {article.title}
                </h3>
                <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                  {(article.summary || '').slice(0, 150)}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
                  <span className="text-xs" style={{ color: 'var(--accent-secondary)' }}>{article.feed_title}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatTime(article.published_at)}</span>
                </div>
              </Link>
              <button
                onClick={() => handleRemove(article.article_id || article.id)}
                className="shrink-0 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-xs transition-all"
                style={{ backgroundColor: 'rgba(255,82,82,0.1)', color: 'var(--danger)', border: '1px solid rgba(255,82,82,0.2)' }}
              >
                移除
              </button>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        )}

        {!loading && articles.length < total && (
          <div className="flex justify-center py-6">
            <button
              onClick={() => setPage(p => p + 1)}
              className="rounded-lg px-3 sm:px-6 py-2 sm:py-2.5 text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              加载更多
            </button>
          </div>
        )}

        {!loading && articles.length === 0 && (
          <div className="text-center py-16">
            <Bookmark size={48} style={{ color: 'var(--border)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>暂无收藏内容</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
