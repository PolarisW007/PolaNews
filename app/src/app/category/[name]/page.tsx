'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api-client';

interface Article {
  id: string;
  title: string;
  summary: string;
  feed_title: string;
  cover_image: string;
  published_at: string;
  importance: string;
  category: string;
}

const CATEGORY_NAMES: Record<string, string> = {
  tech: '科技',
  finance: '财经',
  politics: '政治',
  ai: 'AI / 机器学习',
  international: '国际综合',
  military: '军事',
  society: '社会',
  general: '综合',
};

export default function CategoryPage() {
  const params = useParams();
  const name = params.name as string;
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.articles.list({ category: name, page, limit: 20 }) as { articles: Article[]; total: number };
      if (page === 1) setArticles(data.articles);
      else setArticles(prev => [...prev, ...data.articles]);
      setTotal(data.total);
    } catch {
      toast('加载文章失败，请稍后重试', 'error');
    }
    setLoading(false);
  }, [name, page]);

  useEffect(() => { setPage(1); }, [name]);
  useEffect(() => { load(); }, [load]);

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: zhCN });
    } catch {
      return dateStr;
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          {CATEGORY_NAMES[name] || name}
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          共 {total} 篇文章
        </p>

        <div className="space-y-3">
          {articles.map(article => (
            <Link key={article.id} href={`/article/${article.id}`}>
              <div
                className="flex gap-4 rounded-xl p-5 glow-border cursor-pointer"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium leading-relaxed line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                    {article.title}
                  </h3>
                  <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {(article.summary || '').slice(0, 150)}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-xs" style={{ color: 'var(--accent-secondary)' }}>{article.feed_title}</span>
                    <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{formatTime(article.published_at)}</span>
                  </div>
                </div>
                {article.cover_image && (
                  <img
                    src={article.cover_image}
                    alt=""
                    className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                    style={{ backgroundColor: 'var(--bg-hover)' }}
                  />
                )}
              </div>
            </Link>
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
              className="rounded-lg px-6 py-2.5 text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              加载更多
            </button>
          </div>
        )}

        {!loading && articles.length === 0 && (
          <div className="text-center py-16">
            <p style={{ color: 'var(--text-secondary)' }}>该分类暂无文章</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
