'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import {
  Share2,
  Plus,
  Loader2,
  X,
  Copy,
  Check,
  BookOpen,
  MessageCircle,
  Filter,
  RefreshCw,
  Image as ImageIcon,
  Link2,
  ExternalLink,
  Twitter,
  Sparkles,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface SocialShare {
  id: string;
  user_id: string;
  digest_id: string;
  article_id: string;
  platform: string;
  title: string;
  content: string;
  cover_url: string;
  images: string;
  image_status: string;
  language: string;
  template_id: string;
  created_at: string;
}

interface Digest {
  id: string;
  digest_date: string;
  language: string;
}

type Platform = '' | 'xiaohongshu' | 'wechat_moments' | 'x';
type ModalPlatform = 'xiaohongshu' | 'wechat_moments' | 'x';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const platformLabels: Record<string, string> = {
  xiaohongshu: '小红书',
  wechat_moments: '朋友圈',
  x: 'X (Twitter)',
};

const platformColors: Record<string, { bg: string; text: string }> = {
  xiaohongshu: { bg: 'rgba(255,45,85,0.1)', text: '#FF6B81' },
  wechat_moments: { bg: 'rgba(7,193,96,0.1)', text: '#07C160' },
  x: { bg: 'rgba(29,161,242,0.1)', text: '#1DA1F2' },
};

const PlatformIcon = ({ platform, size = 18, color }: { platform: string; size?: number; color?: string }) => {
  switch (platform) {
    case 'xiaohongshu': return <BookOpen size={size} style={{ color }} />;
    case 'wechat_moments': return <MessageCircle size={size} style={{ color }} />;
    case 'x': return <Twitter size={size} style={{ color }} />;
    default: return <Share2 size={size} style={{ color }} />;
  }
};

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// 海报只展示中文信息部分：剔除英文推文引用行，清理 markdown 残留
function extractChineseLines(content: string) {
  const rawLines = (content || '').split(/\n+/);
  const zhMarkerIndex = rawLines.findIndex((line) => /中文版本|中文版/.test(line));
  const sourceLines = zhMarkerIndex >= 0 ? rawLines.slice(zhMarkerIndex + 1) : rawLines;

  return sourceLines
    .map((line) =>
      line
        // 去掉行首的 markdown 标记：引用 >、列表 - * #、空白
        .replace(/^[>\-*#\s]+/, '')
        // 去掉 markdown 粗体/斜体包裹符号
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .trim(),
    )
    .filter((line) => {
      if (!line || !/[\u4e00-\u9fa5]/.test(line)) return false;
      const label = line.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '');
      if (/^(中文版本|中文版|每日新闻摘要|日期[:：]?|推文#?\d+|微博#?\d+)/.test(label)) return false;
      if (/^[-—]{2,}$/.test(line)) return false;
      return true;
    })
    .slice(0, 8);
}

function SharePoster({ share }: { share: SocialShare }) {
  const lines = extractChineseLines(share.content);
  const platformName = platformLabels[share.platform] || 'Share';
  const posterTitle = lines[0] || share.title || '今日资讯分享';
  const fallbackLines = lines.length > 1 ? lines.slice(1) : lines.length > 0 ? lines : ['今日重点内容'];

  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-6"
      style={{
        width: 760,
        minHeight: 1080,
        background: 'linear-gradient(180deg, #031525 0%, #071624 52%, #04080f 100%)',
        color: '#f8fbff',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 8%, rgba(84,255,224,0.28), transparent 28%), radial-gradient(circle at 84% 14%, rgba(255,204,112,0.22), transparent 30%), linear-gradient(90deg, rgba(98,255,232,0.07) 1px, transparent 1px), linear-gradient(0deg, rgba(98,255,232,0.06) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 46px 46px, 46px 46px',
        }}
      />
      <div className="relative">
        <div className="mb-7 flex items-center justify-between">
          <div>
            <div className="text-3xl font-black tracking-[0.14em]" style={{ color: '#58ffe2' }}>一念三千</div>
            <div className="mt-1 text-lg font-bold uppercase tracking-[0.28em]" style={{ color: 'rgba(248,251,255,0.64)' }}>
              {platformName} POSTER
            </div>
          </div>
          <div
            className="rounded-full px-5 py-2 text-xl font-black"
            style={{
              background: 'rgba(88,255,226,0.12)',
              border: '1px solid rgba(88,255,226,0.38)',
              color: '#f3c96f',
            }}
          >
            AI SHARE
          </div>
        </div>

        <div className="mb-8 text-center">
          <h1
            className="text-5xl font-black leading-tight"
            style={{ color: '#f4ce78', textShadow: '0 3px 0 #59421f, 0 0 26px rgba(244,206,120,0.34)' }}
          >
            {posterTitle}
          </h1>
        </div>

        <div className="space-y-4">
          {fallbackLines.map((line, index) => {
            const accent = index % 2 === 0 ? '#68fff0' : '#ffd889';
            return (
              <div
                key={`${line}-${index}`}
                className="relative grid items-center gap-5 overflow-hidden rounded-2xl px-5 py-4"
                style={{
                  gridTemplateColumns: '106px 1fr',
                  background: 'linear-gradient(90deg, rgba(13, 78, 82, 0.88), rgba(25, 27, 50, 0.93))',
                  border: '1px solid rgba(121,255,240,0.42)',
                  boxShadow: '0 0 18px rgba(57,255,226,0.14), inset 0 0 24px rgba(255,255,255,0.04)',
                }}
              >
                <div
                  className="absolute right-4 top-3 h-2 w-28 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,217,140,0.78))' }}
                />
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-2xl text-4xl font-black"
                  style={{
                    color: accent,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(130,255,242,0.24)',
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <p className="line-clamp-3 text-3xl font-black leading-snug" style={{ color: index % 2 === 0 ? '#f4f9f4' : '#ffe2a5' }}>
                  {line}
                </p>
              </div>
            );
          })}
        </div>

        <div
          className="mt-8 rounded-2xl px-7 py-5 text-center text-3xl font-black leading-snug"
          style={{
            background: 'linear-gradient(90deg, rgba(6, 40, 57, 0.92), rgba(15, 32, 51, 0.92))',
            border: '1px solid rgba(91,255,229,0.28)',
            color: '#f4f7f2',
          }}
        >
          <span>{platformName}</span>
          <span style={{ color: '#f3c96f' }}> · </span>
          <span>{format(new Date(share.created_at), 'yyyy-MM-dd')}</span>
          <span style={{ color: '#f3c96f' }}> · </span>
          <span>长按保存分享图</span>
        </div>
      </div>
    </div>
  );
}

function ImageGeneratingPlaceholder({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg ${className}`}
      style={{ background: 'linear-gradient(135deg, rgba(0,255,136,0.05), rgba(0,200,100,0.1))', border: '1px dashed rgba(0,255,136,0.3)', ...style }}
    >
      <div className="relative">
        <Sparkles size={24} style={{ color: 'var(--accent)', opacity: 0.7 }} />
        <Loader2 size={14} className="animate-spin absolute -right-1 -top-1" style={{ color: 'var(--accent)' }} />
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--accent)', opacity: 0.8 }}>
        AI 配图生成中...
      </span>
    </div>
  );
}

export default function ShareHistoryPage() {
  const [shares, setShares] = useState<SocialShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Platform>('');
  const [showModal, setShowModal] = useState(false);
  const [detailShare, setDetailShare] = useState<SocialShare | null>(null);
  const [copied, setCopied] = useState<string>('');

  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [posterExporting, setPosterExporting] = useState(false);
  const [modalPlatform, setModalPlatform] = useState<ModalPlatform>('xiaohongshu');
  const [digests, setDigests] = useState<Digest[]>([]);
  const [selectedDigestId, setSelectedDigestId] = useState('');
  const { toast } = useToast();

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.shares.list(1, 50, activeTab) as { shares: SocialShare[] };
      setShares(data.shares || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : '获取分享列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);

  const fetchDigests = async () => {
    try {
      const data = await api.digests.list(1, 10) as { digests: Digest[] } | Digest[];
      const list = Array.isArray(data) ? data : (data.digests || []);
      setDigests(list);
      if (list.length > 0) setSelectedDigestId(list[0].id);
    } catch (e) {
      toast(e instanceof Error ? e.message : '获取摘要列表失败', 'error');
    }
  };

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // Poll for generating shares in the list
  useEffect(() => {
    const hasGenerating = shares.some(s => s.image_status === 'generating');
    if (hasGenerating) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        try {
          const data = await api.shares.list(1, 50, activeTab) as { shares: SocialShare[] };
          const newShares = data.shares || [];
          setShares(newShares);

          if (detailShare) {
            const updated = newShares.find(s => s.id === detailShare.id);
            if (updated && updated.image_status !== detailShare.image_status) {
              setDetailShare(updated);
            }
          }

          if (!newShares.some(s => s.image_status === 'generating')) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } catch { /* ignore polling errors */ }
      }, 4000);
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [shares, activeTab, detailShare]);

  const detailShareId = detailShare?.id || '';
  const detailShareStatus = detailShare?.image_status || '';

  // Poll for the detail modal's share image status
  useEffect(() => {
    if (!detailShareId || detailShareStatus !== 'generating') {
      if (detailPollRef.current) {
        clearInterval(detailPollRef.current);
        detailPollRef.current = null;
      }
      return;
    }

    detailPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${basePath}/api/share/${detailShareId}`);
        const json = await res.json();
        if (json.success && json.data) {
          const updated = json.data as SocialShare;
          setDetailShare(updated);
          setShares(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
          if (updated.image_status !== 'generating') {
            if (detailPollRef.current) clearInterval(detailPollRef.current);
            detailPollRef.current = null;
            if (updated.image_status === 'ready') {
              toast('AI 配图已生成完毕', 'success');
            }
          }
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      if (detailPollRef.current) {
        clearInterval(detailPollRef.current);
        detailPollRef.current = null;
      }
    };
  }, [detailShareId, detailShareStatus, toast]);

  const handleOpenModal = () => {
    setShowModal(true);
    fetchDigests();
  };

  const handleGenerate = async () => {
    if (!selectedDigestId) return;
    setGenerating(true);
    try {
      await api.shares.generate(modalPlatform, selectedDigestId, undefined, 'zh');
      setShowModal(false);
      await fetchShares();
      toast('分享文案生成成功' + (modalPlatform === 'xiaohongshu' ? '，配图正在后台生成' : ''), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成分享失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string, type = 'content') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      toast(type === 'link' ? '链接已复制' : '文案已复制到剪贴板', 'success');
      setTimeout(() => setCopied(''), 2000);
    } catch {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const handleRegenerate = async (share: SocialShare) => {
    setRegenerating(true);
    try {
      await api.shares.generate(
        share.platform,
        share.digest_id || undefined,
        share.article_id || undefined,
        share.language || 'zh',
      );
      await fetchShares();
      setDetailShare(null);
      toast('已重新生成分享文案', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '重新生成失败', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handleExportPoster = async (share: SocialShare) => {
    if (!posterRef.current) return;
    setPosterExporting(true);
    try {
      const dataUrl = await toPng(posterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#031525',
      });
      downloadDataUrl(dataUrl, `share-poster-${share.id.slice(0, 8)}.png`);
      toast('分享海报已生成', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成海报失败', 'error');
    } finally {
      setPosterExporting(false);
    }
  };

  const getPublicUrl = (shareId: string) => {
    const host = typeof window !== 'undefined' ? window.location.origin : '';
    return `${host}${basePath}/share/${shareId}/public`;
  };

  const parseImages = (imagesStr: string) => {
    try {
      if (!imagesStr) return [];
      const parsed = JSON.parse(imagesStr);
      if (Array.isArray(parsed)) {
        return parsed.map((item: string | { url: string }) =>
          typeof item === 'string' ? item : item.url
        ).filter(Boolean);
      }
      return [];
    } catch { return []; }
  };

  const isImageReady = (share: SocialShare) => share.image_status === 'ready' && (share.cover_url || parseImages(share.images).length > 0);
  const isImageGenerating = (share: SocialShare) => share.image_status === 'generating';

  const tabs: { key: Platform; label: string }[] = [
    { key: '', label: '全部' },
    { key: 'xiaohongshu', label: '小红书' },
    { key: 'wechat_moments', label: '朋友圈' },
    { key: 'x', label: 'X' },
  ];

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 sm:mb-8 flex items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              分享历史
            </h1>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              AI 生成的社交平台分享文案
            </p>
          </div>
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">生成新分享</span>
            <span className="sm:hidden">新建</span>
          </button>
        </div>

        <div
          className="mb-6 flex gap-1 rounded-lg border p-1"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.key ? '#000' : 'var(--text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : shares.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl border py-16"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <Share2 size={40} className="mb-4" style={{ color: 'var(--text-secondary)' }} />
            <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>暂无分享记录</p>
            <p className="mb-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
              点击&quot;生成新分享&quot;为社交平台创建精彩文案
            </p>
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={16} />
              生成分享
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {shares.map((share) => {
              const pColor = platformColors[share.platform] || { bg: 'rgba(0,255,157,0.08)', text: 'var(--accent-secondary)' };
              const imgs = parseImages(share.images);

              return (
                <button
                  key={share.id}
                  onClick={() => setDetailShare(share)}
                  className="glow-border group flex w-full items-start gap-3 sm:gap-4 rounded-xl border p-3 sm:p-5 text-left transition-colors"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: pColor.bg }}>
                    <PlatformIcon platform={share.platform} color={pColor.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: pColor.bg, color: pColor.text }}
                      >
                        {platformLabels[share.platform] || share.platform}
                      </span>
                      {isImageGenerating(share) && (
                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: 'rgba(0,255,136,0.08)', color: 'var(--accent)' }}>
                          <Loader2 size={10} className="animate-spin" /> 配图生成中
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {share.title || '无标题'}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {share.content?.slice(0, 120)}
                    </p>

                    {isImageGenerating(share) && (
                      <ImageGeneratingPlaceholder className="mt-2 h-16 w-28" />
                    )}

                    {isImageReady(share) && (
                      <div className="mt-2 flex gap-1.5 overflow-hidden">
                        {share.cover_url && (
                          <img src={share.cover_url} alt="封面" className="h-16 w-24 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} />
                        )}
                        {imgs.slice(0, 3).map((img, i) => (
                          <img key={i} src={img} alt="" className="h-16 w-16 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} />
                        ))}
                      </div>
                    )}

                    <span className="mt-2 inline-block text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {format(new Date(share.created_at), 'yyyy-MM-dd HH:mm')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        {detailShare && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDetailShare(null)}
          >
            <div
              className="relative max-h-[92vh] sm:max-h-[85vh] w-full sm:max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-xl border p-4 sm:p-6"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setDetailShare(null)}
                className="absolute right-4 top-4 rounded p-1 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>

              <div className="mb-4 flex items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    background: (platformColors[detailShare.platform] || { bg: 'rgba(0,255,157,0.08)' }).bg,
                    color: (platformColors[detailShare.platform] || { text: 'var(--accent-secondary)' }).text,
                  }}
                >
                  {platformLabels[detailShare.platform] || detailShare.platform}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {format(new Date(detailShare.created_at), 'yyyy-MM-dd HH:mm')}
                </span>
              </div>

              <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {detailShare.title || '无标题'}
              </h2>

              {/* Cover image area */}
              {isImageGenerating(detailShare) && (
                <ImageGeneratingPlaceholder className="mb-4 h-48 w-full" />
              )}

              {isImageReady(detailShare) && detailShare.cover_url && (
                <div className="mb-4 overflow-hidden rounded-lg">
                  <img src={detailShare.cover_url} alt="封面" className="w-full rounded-lg object-cover" style={{ maxHeight: 280 }} />
                </div>
              )}

              <div
                className="mb-4 whitespace-pre-wrap rounded-lg border p-4 text-sm leading-relaxed"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {detailShare.content}
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <ImageIcon size={12} />
                    HTML 海报预览
                  </div>
                  <button
                    onClick={() => handleExportPoster(detailShare)}
                    disabled={posterExporting}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-60"
                    style={{ background: 'var(--accent)', color: '#000' }}
                  >
                    {posterExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    下载 PNG
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border p-2" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                  <div className="origin-top-left" style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: 760, height: 1080, marginBottom: -626 }}>
                    <div ref={posterRef}>
                      <SharePoster share={detailShare} />
                    </div>
                  </div>
                </div>
              </div>

              {/* AI images */}
              {isImageReady(detailShare) && (() => {
                const imgs = parseImages(detailShare.images);
                if (imgs.length === 0) return null;
                return (
                  <div className="mb-5">
                    <div className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <ImageIcon size={12} />
                      AI 生成配图 ({imgs.length})
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {imgs.map((img, i) => (
                        <img key={i} src={img} alt="" className="w-full rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {isImageGenerating(detailShare) && (
                <div className="mb-5 flex items-center gap-2 rounded-lg border p-3" style={{ background: 'rgba(0,255,136,0.03)', borderColor: 'rgba(0,255,136,0.15)' }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--accent)' }}>
                    AI 正在为您生成配图，完成后将自动显示...
                  </span>
                </div>
              )}

              {/* Public link */}
              <div className="mb-4 flex items-center gap-2 rounded-lg border p-3" style={{ background: 'rgba(0,255,136,0.03)', borderColor: 'var(--border)' }}>
                <Link2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {getPublicUrl(detailShare.id)}
                </span>
                <button
                  onClick={() => handleCopy(getPublicUrl(detailShare.id), 'link')}
                  className="flex shrink-0 items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-all"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  {copied === 'link' ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制链接</>}
                </button>
              </div>

              <a
                href={getPublicUrl(detailShare.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4 flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
              >
                <ExternalLink size={14} />
                打开对外分享页
              </a>

              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(detailShare.content, 'content')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110"
                  style={{ background: 'var(--accent)' }}
                >
                  {copied === 'content' ? <Check size={16} /> : <Copy size={16} />}
                  {copied === 'content' ? '已复制' : '一键复制文案'}
                </button>
                <button
                  onClick={() => handleRegenerate(detailShare)}
                  disabled={regenerating}
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all hover:brightness-110"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {regenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  重新生成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generate Modal */}
        {showModal && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowModal(false)}
          >
            <div
              className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border p-4 sm:p-6 max-h-[85vh] overflow-y-auto"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowModal(false)}
                className="absolute right-4 top-4 rounded p-1 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>

              <h2 className="mb-5 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                生成社交分享
              </h2>

              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                选择平台
              </label>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {(['xiaohongshu', 'wechat_moments', 'x'] as const).map((p) => {
                  const pColor = platformColors[p];
                  return (
                    <button
                      key={p}
                      onClick={() => setModalPlatform(p)}
                      className="flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors"
                      style={{
                        borderColor: modalPlatform === p ? pColor.text : 'var(--border)',
                        background: modalPlatform === p ? pColor.bg : 'transparent',
                        color: modalPlatform === p ? pColor.text : 'var(--text-secondary)',
                      }}
                    >
                      <PlatformIcon platform={p} size={20} color={modalPlatform === p ? pColor.text : 'var(--text-secondary)'} />
                      {platformLabels[p]}
                    </button>
                  );
                })}
              </div>

              {modalPlatform === 'x' && (
                <p className="mb-4 rounded-lg border p-3 text-xs" style={{ background: 'rgba(29,161,242,0.05)', borderColor: 'rgba(29,161,242,0.2)', color: '#1DA1F2' }}>
                  X 平台将同时生成英文和中文双语版本
                </p>
              )}

              {modalPlatform === 'xiaohongshu' && (
                <p className="mb-4 rounded-lg border p-3 text-xs" style={{ background: 'rgba(255,45,85,0.05)', borderColor: 'rgba(255,45,85,0.2)', color: '#FF6B81' }}>
                  小红书将自动生成AI配图（后台异步生成，不影响其他操作）
                </p>
              )}

              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                选择内容来源
              </label>
              <div className="mb-5">
                {digests.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    暂无可用摘要，请先生成每日摘要
                  </p>
                ) : (
                  <div className="space-y-2">
                    {digests.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDigestId(d.id)}
                        className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors"
                        style={{
                          borderColor: selectedDigestId === d.id ? 'var(--accent)' : 'var(--border)',
                          background: selectedDigestId === d.id ? 'rgba(0,255,157,0.08)' : 'transparent',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
                        {d.digest_date} 摘要
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !selectedDigestId}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60"
                style={{ background: 'var(--accent)' }}
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                {generating ? '生成中...' : '生成分享文案'}
              </button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
