'use client';

import { useEffect, useState, useMemo, useRef, type RefObject } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toPng } from 'html-to-image';
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
  Image as ImageIcon,
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
    const line = lines[i];

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

function plainDigestLine(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim();
}

function digestPosterSections(digest: DailyDigest) {
  const content = digest.full_content || '';
  const sections: Array<{ title: string; items: string[] }> = [];
  let current: { title: string; items: string[] } | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^---+$/.test(line)) continue;

    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      if (current && current.items.length > 0) sections.push(current);
      current = { title: plainDigestLine(heading[1]), items: [] };
      continue;
    }

    const listItem = line.match(/^(?:[-*]|\d+[.)、])\s+(.+)/);
    const text = plainDigestLine(line);
    if (!text || /^Daily Digest/i.test(text)) continue;
    if (!current) current = { title: '今日速览', items: [] };
    if (listItem || current.items.length === 0) {
      current.items.push(plainDigestLine(listItem?.[1] || line));
    } else {
      const lastIndex = current.items.length - 1;
      current.items[lastIndex] = `${current.items[lastIndex]} ${text}`;
    }
  }

  if (current && current.items.length > 0) sections.push(current);

  if (sections.length > 0) return sections.filter((section) => section.items.length > 0);

  const headlines = (digest.headlines || []) as DigestHeadline[];
  if (headlines.length > 0) {
    return [{
      title: '今日要闻',
      items: headlines.slice(0, 12).map((item) => `${item.title}${item.summary ? `：${item.summary}` : ''}`),
    }];
  }

  return [{ title: '今日简报', items: ['暂无可展示的每日新闻简报内容。'] }];
}

const LANGS = [
  { key: 'zh', label: '中' },
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日' },
] as const;

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function DigestPoster({
  digest,
  categories,
  displayDate,
  posterRef,
}: {
  digest: DailyDigest;
  categories: Record<string, DigestCategorySummary>;
  displayDate: string;
  posterRef?: RefObject<HTMLDivElement | null>;
}) {
  const sections = digestPosterSections(digest);
  const stats = digest.statistics;
  const keywords = ((stats?.top_keywords || digest.trending_keywords || []) as string[]).slice(0, 5);
  const categoryNames = Object.keys(categories).slice(0, 4);

  return (
    <div
      ref={posterRef}
      className="relative overflow-hidden p-8"
      style={{
        width: 520,
        minWidth: 520,
        maxWidth: 520,
        boxSizing: 'border-box',
        background: '#f6f0e6',
        color: '#171410',
        fontFamily: '"Noto Serif SC", "Songti SC", "SimSun", serif',
        boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
      }}
    >
      <div
        className="absolute inset-0 opacity-45"
        style={{
          background:
            'linear-gradient(90deg, rgba(110,72,36,0.05) 1px, transparent 1px), linear-gradient(0deg, rgba(110,72,36,0.04) 1px, transparent 1px), radial-gradient(circle at 8% 3%, rgba(206,168,105,0.28), transparent 20%)',
          backgroundSize: '24px 24px, 24px 24px, auto',
        }}
      />
      <div className="relative">
        <div className="mb-6 flex items-start justify-between border-b pb-4" style={{ borderColor: '#ded2c0' }}>
          <div>
            <div className="text-xs font-semibold tracking-[0.26em]" style={{ color: '#7a5c32' }}>
              一念三千
            </div>
            <div className="mt-2 text-4xl font-black leading-none" style={{ color: '#111' }}>
              Daily Digest
            </div>
            <div className="mt-2 text-sm font-semibold" style={{ color: '#7a5c32' }}>
              {displayDate} 每日新闻简报
            </div>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black"
            style={{ background: '#111', color: '#f6f0e6' }}
          >
            AI
          </div>
        </div>

        <div className="space-y-5">
          {sections.map((section, sectionIndex) => (
            <section key={`${section.title}-${sectionIndex}`}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
                  style={{ background: '#2f7b55', color: '#fff' }}
                >
                  {String(sectionIndex + 1).padStart(2, '0')}
                </span>
                <h3 className="text-xl font-black leading-tight" style={{ color: '#171410' }}>
                  {section.title}
                </h3>
              </div>
              <ul className="space-y-2">
                {section.items.map((item, itemIndex) => (
                  <li
                    key={`${section.title}-${itemIndex}`}
                    className="rounded-xl px-4 py-3 text-[15px] font-semibold leading-relaxed"
                    style={{
                      background: itemIndex === 0 ? '#eee7dc' : 'rgba(255,255,255,0.46)',
                      color: '#201b15',
                      border: '1px solid rgba(101,79,52,0.12)',
                    }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          className="mt-7 rounded-2xl px-5 py-4 text-center text-sm font-black leading-relaxed"
          style={{
            background: '#16120d',
            color: '#f4ead9',
          }}
        >
          <span>{stats?.total_articles || sections.reduce((sum, section) => sum + section.items.length, 0)} 条资讯</span>
          <span style={{ color: '#d8af63' }}> · </span>
          <span>{stats?.source_count || categoryNames.length || 1} 个信息源</span>
          {keywords.length > 0 && (
            <>
              <span style={{ color: '#d8af63' }}> · </span>
              <span>{keywords.join(' / ')}</span>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between border-t pt-4 text-[11px]" style={{ borderColor: '#ded2c0', color: '#786852' }}>
          <span>WorldOverview</span>
          <span>全球资讯 AI 聚合</span>
        </div>
      </div>
    </div>
  );
}

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
  const [posterExporting, setPosterExporting] = useState(false);
  const posterRef = useRef<HTMLDivElement | null>(null);
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

  const handleExportPoster = async () => {
    if (!digest || !posterRef.current) return;
    setPosterExporting(true);
    let clone: HTMLElement | null = null;
    try {
      const node = posterRef.current;
      const width = node.scrollWidth;
      const height = node.scrollHeight;
      clone = node.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: `${width}px`,
        height: `${height}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        margin: '0',
        transform: 'none',
        zIndex: '-1',
      });
      document.body.appendChild(clone);

      const dataUrl = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        width,
        height,
        canvasWidth: width * 2,
        canvasHeight: height * 2,
        backgroundColor: '#f6f0e6',
        style: {
          width: `${width}px`,
          height: `${height}px`,
          margin: '0',
          maxWidth: 'none',
          transform: 'none',
        },
      });
      downloadDataUrl(dataUrl, `digest-poster-${date || digest.digest_date}.png`);
      toast('Digest 海报已生成', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成海报失败', 'error');
    } finally {
      clone?.remove();
      setPosterExporting(false);
    }
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

        {/* 海报生成 */}
        <section className="mb-6 sm:mb-8">
          <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Digest 图片海报
            </h2>
            <button
              onClick={handleExportPoster}
              disabled={posterExporting}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {posterExporting ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
              下载 PNG
            </button>
          </div>
          <div
            className="overflow-x-auto rounded-xl border p-4 sm:p-6"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
          >
            <div className="mx-auto w-fit">
              <DigestPoster
                digest={digest}
                categories={categories as Record<string, DigestCategorySummary>}
                displayDate={date || digest.digest_date}
                posterRef={posterRef}
              />
            </div>
          </div>
        </section>

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
