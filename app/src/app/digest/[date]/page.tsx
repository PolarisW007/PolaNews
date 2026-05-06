'use client';

import { useEffect, useState, useMemo } from 'react';
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
  Radio,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import type { DailyDigest, DigestHeadline, DigestCategorySummary } from '@/lib/types';
import MainLayout from '@/components/layout/MainLayout';
import BroadcastPlayer from '@/components/ui/BroadcastPlayer';
import { useToast } from '@/components/ui/Toast';

/** 简易 Markdown 转 HTML（支持标题/粗体/列表/水平线/段落） */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 水平线
    if (/^---+$/.test(line.trim())) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push('<hr style="border-color:var(--border);margin:1rem 0" />');
      continue;
    }

    // 标题 h1-h3
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      if (inList) { result.push('</ul>'); inList = false; }
      const level = hMatch[1].length;
      const text = hMatch[2];
      const size = level === 1 ? '1.25rem' : level === 2 ? '1.1rem' : '1rem';
      const mt = level === 1 ? '2rem' : '1.5rem';
      result.push(`<h${level} style="color:var(--text-primary);font-weight:600;font-size:${size};margin-top:${mt};margin-bottom:0.5rem">${escapeHtml(text)}</h${level}>`);
      continue;
    }

    // 列表项
    const liMatch = line.match(/^[-*]\s+(.+)/);
    if (liMatch) {
      if (!inList) { result.push('<ul style="list-style:disc;padding-left:1.5rem;margin:0.5rem 0">'); inList = true; }
      result.push(`<li style="color:var(--text-primary);margin-bottom:0.25rem;font-size:0.875rem;line-height:1.6">${inlineFormat(liMatch[1])}</li>`);
      continue;
    }

    // 空行
    if (line.trim() === '') {
      if (inList) { result.push('</ul>'); inList = false; }
      continue;
    }

    // 普通段落
    if (inList) { result.push('</ul>'); inList = false; }
    result.push(`<p style="color:var(--text-primary);font-size:0.875rem;line-height:1.8;margin-bottom:0.75rem">${inlineFormat(line)}</p>`);
  }

  if (inList) result.push('</ul>');
  return result.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function inlineFormat(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--bg-secondary);padding:0.1rem 0.3rem;border-radius:3px;font-size:0.85em">$1</code>');
}

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
  const [showPlayer, setShowPlayer] = useState(false);
  /** 预加载的 TTS 音频 URL：key=segment index */
  const [preloadedAudio, setPreloadedAudio] = useState<Record<number, string>>({});
  const [audioPreloading, setAudioPreloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setPreloadedAudio({});
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

  const handleGenerateBroadcast = () => {
    if (!digest) return;
    setShowPlayer((v) => !v);
  };

  /** 构造播放器的段落：优先 headlines（短句更适合播报），没有时退回 full_content 段落 */
  const broadcastSegments = useMemo(() => {
    if (!digest) return [] as Array<{ index: number; text: string }>;
    const heads = (digest.headlines || []) as DigestHeadline[];
    if (heads.length > 0) {
      return heads.map((h, i) => ({
        index: i,
        text: `${h.title}${h.summary ? '。' + h.summary : ''}`.trim(),
      }));
    }
    const content = digest.full_content || '';
    const paras = content
      .split(/\n+/)
      .map((s) => s.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
      .filter((s) => s.length > 10)
      .slice(0, 8);
    return paras.map((text, index) => ({ index, text }));
  }, [digest]);

  /** 预加载第一段语音：digest 加载完后立即在后台合成，点"播放"时 0 等待 */
  useEffect(() => {
    if (!digest || broadcastSegments.length === 0) return;
    if (preloadedAudio[0]) return;
    const first = broadcastSegments[0];
    if (!first?.text) return;

    setAudioPreloading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${basePath}/api/tts/synthesize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: first.text.slice(0, 5000), voice: 'longshu_v3' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.data?.url) {
          setPreloadedAudio((prev) => ({ ...prev, 0: d.data.url }));
        }
      })
      .catch(() => {})
      .finally(() => setAudioPreloading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest, broadcastSegments.length]);

  /** 把已预加载的 audio_url 注入到 segments，BroadcastPlayer 看到后会直接播放，跳过 on-demand 合成 */
  const segmentsWithAudio = useMemo(() => {
    return broadcastSegments.map((s, i) => ({
      ...s,
      audio_url: preloadedAudio[i] || null,
    }));
  }, [broadcastSegments, preloadedAudio]);

  const importanceColors: Record<string, { bg: string; text: string }> = {
    breaking: { bg: 'rgba(255,82,82,0.15)', text: '#FF5252' },
    important: { bg: 'rgba(255,171,64,0.15)', text: '#FFAB40' },
    normal: { bg: 'rgba(0,255,157,0.12)', text: 'var(--accent)' },
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
      <div className="mx-auto max-w-4xl px-3 sm:px-5">
        {/* 顶部导航栏 */}
        <div className="mb-5 sm:mb-8 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => router.push('/digest')}
              className="flex items-center gap-1 text-sm transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">返回</span>
            </button>
            <h1 className="text-lg sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {date}
            </h1>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-3">
            {/* 语言切换 */}
            <div
              className="flex gap-1 rounded-lg p-1"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              {LANGS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setLang(key)}
                  className="rounded-md px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-medium transition-colors"
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
              className="flex shrink-0 items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
              title="导出 Markdown"
            >
              <Download size={14} />
              <span className="hidden sm:inline">导出 Markdown</span>
              <span className="sm:hidden">MD</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="flex shrink-0 items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2.5 text-xs sm:text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
              title="导出 PDF"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">导出 PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
          </div>
        </div>

        {/* 统计数据 */}
        {stats && (
          <div className="mb-5 sm:mb-6 grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4">
            <div
              className="rounded-xl border p-3 sm:p-5 min-w-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <FileText size={14} style={{ color: 'var(--accent)' }} />
                <span className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-secondary)' }}>总文章数</span>
              </div>
              <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {stats.total_articles}
              </p>
            </div>
            <div
              className="rounded-xl border p-3 sm:p-5 min-w-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <BarChart3 size={14} style={{ color: 'var(--accent)' }} />
                <span className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-secondary)' }}>信息源</span>
              </div>
              <p className="mt-1.5 sm:mt-2 text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {stats.source_count}
              </p>
            </div>
            <div
              className="col-span-2 rounded-xl border p-3 sm:p-5 min-w-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 flex items-center gap-1.5 sm:gap-2">
                <Hash size={14} style={{ color: 'var(--accent)' }} />
                <span className="text-[11px] sm:text-xs" style={{ color: 'var(--text-secondary)' }}>热门关键词</span>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {(stats.top_keywords || digest.trending_keywords || []).map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs"
                    style={{
                      background: 'rgba(0,255,157,0.08)',
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
          <section className="mb-6 sm:mb-8">
            <h2 className="mb-3 sm:mb-4 text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              头条要闻
            </h2>
            <div className="space-y-3">
              {headlines.map((h: DigestHeadline, i: number) => {
                const imp = importanceColors[h.importance] || importanceColors.normal;
                return (
                  <div
                    key={i}
                    className="glow-border cursor-pointer rounded-xl border p-3 sm:p-5 transition-colors"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                    onClick={() => h.article_id && router.push(`/article/${h.article_id}`)}
                  >
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <h3
                        className="text-sm sm:text-base font-medium leading-snug min-w-0 flex-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {h.title}
                      </h3>
                      <div className="flex shrink-0 flex-wrap gap-1.5 sm:gap-2">
                        {h.category && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] sm:text-xs"
                            style={{ background: 'rgba(0,255,157,0.12)', color: 'var(--accent)' }}
                          >
                            {h.category}
                          </span>
                        )}
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] sm:text-xs"
                          style={{ background: imp.bg, color: imp.text }}
                        >
                          {h.importance}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
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
          <section className="mb-6 sm:mb-8">
            <h2 className="mb-3 sm:mb-4 text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
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
                      className="flex w-full items-center justify-between px-3 sm:px-5 py-3 sm:py-4 text-left transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ background: 'rgba(0,255,157,0.12)', color: 'var(--accent)' }}
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
                        className="border-t px-3 sm:px-5 py-3 sm:py-4"
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

        {/* 全文内容（Markdown 渲染） */}
        {digest.full_content && (
          <section className="mb-6 sm:mb-8">
            <h2 className="mb-3 sm:mb-4 text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              完整内容
            </h2>
            <div
              className="rounded-xl border p-3 sm:p-6"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(digest.full_content) }}
            />
          </section>
        )}

        {/* 底部操作区 */}
        <div
          className="flex flex-wrap justify-center gap-2 sm:gap-3 border-t py-6 sm:py-8"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={handleGenerateBroadcast}
            className="flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-sm font-medium text-black transition-all hover:brightness-110"
            style={{ background: 'var(--accent)' }}
            title={
              showPlayer
                ? '关闭语音播报'
                : preloadedAudio[0]
                  ? '音频已就绪，点击立即播放'
                  : audioPreloading
                    ? '音频准备中…'
                    : '播放语音播报'
            }
          >
            <Radio size={16} />
            {showPlayer ? '关闭语音播报' : '播放语音播报'}
            {!showPlayer && preloadedAudio[0] && (
              <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-black/70" title="音频已就绪" />
            )}
            {!showPlayer && !preloadedAudio[0] && audioPreloading && (
              <Loader2 size={12} className="ml-1 animate-spin" />
            )}
          </button>
          <button
            onClick={handleExport}
            className="flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              border: '1px solid var(--border)',
            }}
          >
            <Download size={16} />
            导出 Markdown
          </button>
          <button
            onClick={handleExportPDF}
            className="flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--accent)',
              border: '1px solid var(--border)',
            }}
          >
            <FileText size={16} />
            导出 PDF
          </button>
        </div>
      </div>

      {/* 内嵌语音播报播放器 —— 优先用预加载的音频，避免点击后等待 */}
      {showPlayer && segmentsWithAudio.length > 0 && (
        <BroadcastPlayer
          script={digest.full_content || ''}
          segments={segmentsWithAudio}
          title={`${digest.digest_date} 每日要闻播报`}
          onClose={() => setShowPlayer(false)}
        />
      )}
    </MainLayout>
  );
}
