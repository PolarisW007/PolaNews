'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Loader2,
  Tag,
  PieChart,
  Zap,
  ExternalLink,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import type { Article } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const CATEGORY_LABELS: Record<string, string> = {
  international: '国际',
  tech: '科技',
  finance: '财经',
  politics: '政治',
  ai: 'AI',
  military: '军事',
  society: '社会',
  culture: '文化',
  sports: '体育',
  health: '健康',
  general: '综合',
};

function formatTime(str: string): string {
  if (!str) return '';
  try {
    const d = new Date(str);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 60) return `${mins}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString();
  } catch {
    return str;
  }
}

export default function TrendingPage() {
  const { toast } = useToast();
  const [trendingKeywords, setTrendingKeywords] = useState<string[]>([]);
  const [keywordCounts, setKeywordCounts] = useState<Record<string, number>>({});
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [breakingNews, setBreakingNews] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [
          digestRes,
          articlesRes,
          breakingRes,
          importantRes,
          ...categoryResList
        ] = await Promise.all([
          api.digests.latest('zh') as Promise<{
            trending_keywords?: string[];
            statistics?: { top_keywords?: string[] };
          } | null>,
          api.articles.list({ limit: 200 }) as Promise<{
            articles: Article[];
            total: number;
          }>,
          api.articles.list({
            importance: 'breaking',
            limit: 15,
          }) as Promise<{ articles: Article[] }>,
          api.articles.list({
            importance: 'important',
            limit: 15,
          }) as Promise<{ articles: Article[] }>,
          ...Object.keys(CATEGORY_LABELS).map((cat) =>
            api.articles.list({
              category: cat,
              limit: 1,
            }) as Promise<{ total: number }>
          ),
        ]);

        if (cancelled) return;

        const digest = digestRes;
        let digestKeywords: string[] = [];
        if (digest?.trending_keywords) {
          const raw = digest.trending_keywords;
          digestKeywords = Array.isArray(raw)
            ? raw
            : typeof raw === 'string'
              ? (() => {
                  try {
                    return JSON.parse(raw) as string[];
                  } catch {
                    return [];
                  }
                })()
              : [];
        }
        if (digestKeywords.length === 0 && digest?.statistics) {
          const stats = digest.statistics as { top_keywords?: string[] } | undefined;
          digestKeywords = stats?.top_keywords || [];
        }

        setTrendingKeywords(digestKeywords);

        const articles = articlesRes.articles || [];
        const counts: Record<string, number> = {};
        digestKeywords.forEach((k) => {
          counts[k] = (counts[k] ?? 0) + 10;
        });
        articles.forEach((a) => {
          const kws = Array.isArray(a.keywords) ? a.keywords : [];
          kws.forEach((k) => {
            const key = String(k).trim();
            if (key) counts[key] = (counts[key] ?? 0) + 1;
          });
        });
        setKeywordCounts(counts);

        const cats: Record<string, number> = {};
        Object.keys(CATEGORY_LABELS).forEach((cat, i) => {
          const r = categoryResList[i] as { total?: number } | undefined;
          cats[cat] = r?.total ?? 0;
        });
        setCategoryCounts(cats);

        const breaking = breakingRes.articles || [];
        const important = importantRes.articles || [];
        const seen = new Set<string>();
        const combined: Article[] = [];
        const maxItems = 20;
        for (let i = 0; i < Math.max(breaking.length, important.length) && combined.length < maxItems; i++) {
          if (breaking[i] && !seen.has(breaking[i].id)) {
            seen.add(breaking[i].id);
            combined.push(breaking[i]);
          }
          if (important[i] && !seen.has(important[i].id)) {
            seen.add(important[i].id);
            combined.push(important[i]);
          }
        }
        combined.sort(
          (a, b) =>
            new Date(b.published_at || b.created_at).getTime() -
            new Date(a.published_at || a.created_at).getTime()
        );
        setBreakingNews(combined.slice(0, 15));
      } catch (e) {
        toast(e instanceof Error ? e.message : '加载趋势数据失败，请重试', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [toast]);

  const sortedKeywords = Object.entries(keywordCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);

  const maxKwCount = Math.max(...sortedKeywords.map(([, c]) => c), 1);
  const totalCat = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-3 sm:px-5 animate-fade-in">
        <div className="flex items-center gap-3 mb-5 sm:mb-8">
          <TrendingUp size={24} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            热门趋势
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : (
          <div className="space-y-8">
            {/* 热门关键词标签云 */}
            <section
              className="rounded-xl p-3 sm:p-5"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Tag size={18} style={{ color: 'var(--accent)' }} />
                <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  热门关键词
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {sortedKeywords.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    暂无关键词数据
                  </p>
                ) : (
                  sortedKeywords.map(([kw, count]) => {
                    const ratio = count / maxKwCount;
                    const size = Math.max(12, Math.min(24, 12 + ratio * 14));
                    return (
                      <span
                        key={kw}
                        className="inline-block px-3 py-1 rounded-full cursor-default"
                        style={{
                          fontSize: size,
                          backgroundColor: 'rgba(0,230,118,0.12)',
                          color: 'var(--accent)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {kw}
                      </span>
                    );
                  })
                )}
              </div>
            </section>

            {/* Top 分类分布 */}
            <section
              className="rounded-xl p-3 sm:p-5"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <PieChart size={18} style={{ color: 'var(--accent)' }} />
                <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  分类分布
                </h2>
              </div>
              <div className="space-y-3">
                {Object.entries(categoryCounts)
                  .filter(([, c]) => c > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => {
                    const pct = totalCat > 0 ? (count / totalCat) * 100 : 0;
                    return (
                      <div key={cat} className="flex items-center gap-2 sm:gap-3">
                        <span
                          className="w-16 sm:w-24 text-xs sm:text-sm shrink-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {CATEGORY_LABELS[cat] || cat}
                        </span>
                        <div
                          className="flex-1 h-6 rounded overflow-hidden"
                          style={{ backgroundColor: 'var(--bg-primary)' }}
                        >
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: 'var(--accent)',
                              minWidth: pct > 0 ? 4 : 0,
                            }}
                          />
                        </div>
                        <span
                          className="w-12 sm:w-16 text-right text-xs shrink-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                {Object.values(categoryCounts).every((c) => c === 0) && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    暂无分类数据
                  </p>
                )}
              </div>
            </section>

            {/* Breaking / Important 新闻 */}
            <section
              className="rounded-xl p-3 sm:p-5"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Zap size={18} style={{ color: 'var(--accent)' }} />
                <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  重点快讯
                </h2>
              </div>
              <div className="space-y-2">
                {breakingNews.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    暂无重点新闻
                  </p>
                ) : (
                  breakingNews.map((art) => (
                    <Link key={art.id} href={`/article/${art.id}`}>
                      <div
                        className="flex items-center gap-2 sm:gap-3 rounded-lg p-3 transition-colors hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <span
                          className="shrink-0 px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor:
                              art.importance === 'breaking'
                                ? 'rgba(255,82,82,0.2)'
                                : 'rgba(0,230,118,0.12)',
                            color:
                              art.importance === 'breaking'
                                ? '#ff5252'
                                : 'var(--accent)',
                          }}
                        >
                          {art.importance === 'breaking' ? '突发' : '重要'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3
                            className="text-sm font-medium line-clamp-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {art.title}
                          </h3>
                          <span
                            className="text-xs mt-0.5 block"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {art.feed_title} · {formatTime(art.published_at || art.created_at)}
                          </span>
                        </div>
                        <ExternalLink size={14} style={{ color: 'var(--text-secondary)' }} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
