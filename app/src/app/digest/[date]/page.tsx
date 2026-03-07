'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  BarChart3,
  FileText,
  Hash,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api-client';
import type { DailyDigest, DigestHeadline, DigestCategorySummary } from '@/lib/types';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/components/ui/Toast';

const LANGS = [
  { key: 'zh', label: '中' },
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日' },
] as const;

export default function DigestDetailPage() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();

  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'zh' | 'en' | 'ja'>('zh');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    api.digests.latest(lang, date)
      .then(data => {
        setDigest(data ? (data as DailyDigest) : null);
      })
      .catch((e) => {
        toast(e instanceof Error ? e.message : '获取摘要详情失败', 'error');
        setDigest(null);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, lang]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  const handleExport = () => {
    if (!digest) return;
    const content = digest.full_content || `# ${digest.digest_date} Daily Digest\n\nNo content available.`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digest-${digest.digest_date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!digest) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const url = `${basePath}/api/digests/${digest.id}/export?format=pdf${token ? `&token=${token}` : ''}`;
    window.open(url, '_blank');
  };

  const importanceColors: Record<string, { bg: string; text: string }> = {
    breaking: { bg: 'rgba(255,82,82,0.15)', text: '#FF5252' },
    important: { bg: 'rgba(255,171,64,0.15)', text: '#FFAB40' },
    normal: { bg: 'rgba(0,230,118,0.12)', text: 'var(--accent)' },
    low: { bg: 'rgba(143,168,155,0.12)', text: 'var(--text-secondary)' },
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      </MainLayout>
    );
  }

  if (!digest) {
    return (
      <MainLayout>
        <div className="flex h-96 flex-col items-center justify-center gap-4">
          <p style={{ color: 'var(--text-secondary)' }}>未找到该日期的摘要</p>
          <button
            onClick={() => router.push('/digest')}
            className="rounded-lg px-4 py-2 text-sm"
            style={{ background: 'var(--bg-hover)', color: 'var(--accent)' }}
          >
            返回列表
          </button>
        </div>
      </MainLayout>
    );
  }

  const stats = digest.statistics;
  const headlines = digest.headlines || [];
  const categories = digest.category_summaries || {};

  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl">
        {/* 顶部导航栏 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/digest')}
              className="flex items-center gap-1 text-sm transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowLeft size={16} />
              返回
            </button>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {date}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* 语言切换 */}
            <div
              className="flex gap-1 rounded-lg p-1"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              {LANGS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setLang(key)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: lang === key ? 'var(--bg-hover)' : 'transparent',
                    color: lang === key ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Download size={14} />
              导出 Markdown
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <FileText size={14} />
              导出 PDF
            </button>
          </div>
        </div>

        {/* 统计数据 */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <FileText size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>总文章数</span>
              </div>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {stats.total_articles}
              </p>
            </div>
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>信息源</span>
              </div>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {stats.source_count}
              </p>
            </div>
            <div
              className="col-span-2 rounded-xl border p-4"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Hash size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>热门关键词</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(stats.top_keywords || digest.trending_keywords || []).map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full px-2.5 py-1 text-xs"
                    style={{
                      background: 'rgba(0,230,118,0.08)',
                      color: 'var(--accent-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 头条新闻 */}
        {headlines.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              头条要闻
            </h2>
            <div className="space-y-3">
              {headlines.map((h: DigestHeadline, i: number) => {
                const imp = importanceColors[h.importance] || importanceColors.normal;
                return (
                  <div
                    key={i}
                    className="glow-border cursor-pointer rounded-xl border p-5 transition-colors"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                    onClick={() => h.article_id && router.push(`/article/${h.article_id}`)}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3
                        className="text-base font-medium leading-snug"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {h.title}
                      </h3>
                      <div className="flex shrink-0 gap-2">
                        {h.category && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ background: 'rgba(0,230,118,0.12)', color: 'var(--accent)' }}
                          >
                            {h.category}
                          </span>
                        )}
                        <span
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{ background: imp.bg, color: imp.text }}
                        >
                          {h.importance}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {h.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 分类摘要（折叠面板） */}
        {Object.keys(categories).length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              分类摘要
            </h2>
            <div className="space-y-2">
              {Object.entries(categories).map(([cat, data]: [string, DigestCategorySummary]) => {
                const expanded = expandedCategories.has(cat);
                return (
                  <div
                    key={cat}
                    className="rounded-xl border overflow-hidden"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                  >
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ background: 'rgba(0,230,118,0.12)', color: 'var(--accent)' }}
                        >
                          {cat}
                        </span>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {data.count} 篇文章
                        </span>
                      </div>
                      {expanded
                        ? <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
                        : <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
                      }
                    </button>
                    {expanded && data.items && (
                      <div
                        className="border-t px-5 py-4"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="space-y-3">
                          {data.items.map((item, i) => (
                            <div
                              key={i}
                              className="cursor-pointer rounded-lg p-3 transition-colors"
                              style={{ background: 'var(--bg-primary)' }}
                              onClick={() => item.article_id && router.push(`/article/${item.article_id}`)}
                            >
                              <h4
                                className="mb-1 text-sm font-medium"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {item.title}
                              </h4>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {item.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 全文内容（如果有） */}
        {digest.full_content && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              完整内容
            </h2>
            <div
              className="rounded-xl border p-6"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <pre
                className="text-sm leading-relaxed"
                style={{
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                }}
              >
                {digest.full_content}
              </pre>
            </div>
          </section>
        )}

        {/* 底部导出 */}
        <div
          className="flex justify-center gap-3 border-t py-8"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              border: '1px solid var(--border)',
            }}
          >
            <Download size={16} />
            导出为 Markdown
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              border: '1px solid var(--border)',
            }}
          >
            <FileText size={16} />
            导出为 PDF
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
