'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [modalPlatform, setModalPlatform] = useState<ModalPlatform>('xiaohongshu');
  const [digests, setDigests] = useState<Digest[]>([]);
  const [selectedDigestId, setSelectedDigestId] = useState('');
  const { toast } = useToast();

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll for the detail modal's share image status
  useEffect(() => {
    if (!detailShare || detailShare.image_status !== 'generating') {
      if (detailPollRef.current) {
        clearInterval(detailPollRef.current);
        detailPollRef.current = null;
      }
      return;
    }

    detailPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${basePath}/api/share/${detailShare.id}`);
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
  }, [detailShare?.id, detailShare?.image_status, toast]);

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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              分享历史
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              AI 生成的社交平台分享文案
            </p>
          </div>
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={16} />
            生成新分享
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
              点击"生成新分享"为社交平台创建精彩文案
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
              const pColor = platformColors[share.platform] || { bg: 'rgba(0,230,118,0.08)', text: 'var(--accent-secondary)' };
              const imgs = parseImages(share.images);

              return (
                <button
                  key={share.id}
                  onClick={() => setDetailShare(share)}
                  className="glow-border group flex w-full items-start gap-4 rounded-xl border p-5 text-left transition-colors"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDetailShare(null)}
          >
            <div
              className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border p-6"
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
                    background: (platformColors[detailShare.platform] || { bg: 'rgba(0,230,118,0.08)' }).bg,
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowModal(false)}
          >
            <div
              className="relative w-full max-w-md rounded-xl border p-6"
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
                          background: selectedDigestId === d.id ? 'rgba(0,230,118,0.08)' : 'transparent',
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
