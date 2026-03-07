'use client';

import { useEffect, useState, useCallback } from 'react';
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
  language: string;
  template_id: string;
  created_at: string;
}

interface Digest {
  id: string;
  digest_date: string;
  language: string;
}

type Platform = '' | 'xiaohongshu' | 'wechat_moments';

const platformLabels: Record<string, string> = {
  xiaohongshu: '小红书',
  wechat_moments: '朋友圈',
};

const platformColors: Record<string, { bg: string; text: string }> = {
  xiaohongshu: { bg: 'rgba(255,45,85,0.1)', text: '#FF6B81' },
  wechat_moments: { bg: 'rgba(7,193,96,0.1)', text: '#07C160' },
};

export default function ShareHistoryPage() {
  const [shares, setShares] = useState<SocialShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Platform>('');
  const [showModal, setShowModal] = useState(false);
  const [detailShare, setDetailShare] = useState<SocialShare | null>(null);
  const [copied, setCopied] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [modalPlatform, setModalPlatform] = useState<'xiaohongshu' | 'wechat_moments'>('xiaohongshu');
  const [digests, setDigests] = useState<Digest[]>([]);
  const [selectedDigestId, setSelectedDigestId] = useState('');
  const { toast } = useToast();

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.shares.list(1, 20, activeTab) as { shares: SocialShare[] };
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
      toast('分享文案生成成功', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成分享失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast('文案已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 2000);
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

  const tabs: { key: Platform; label: string }[] = [
    { key: '', label: '全部' },
    { key: 'xiaohongshu', label: '小红书' },
    { key: 'wechat_moments', label: '朋友圈' },
  ];

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
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

        {/* Tabs */}
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

        {/* List */}
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
            <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              暂无分享记录
            </p>
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
              const pColor = platformColors[share.platform] || {
                bg: 'rgba(0,230,118,0.08)',
                text: 'var(--accent-secondary)',
              };
              return (
                <button
                  key={share.id}
                  onClick={() => setDetailShare(share)}
                  className="glow-border group flex w-full items-start gap-4 rounded-xl border p-5 text-left transition-colors"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: pColor.bg }}
                  >
                    {share.platform === 'xiaohongshu' ? (
                      <BookOpen size={18} style={{ color: pColor.text }} />
                    ) : (
                      <MessageCircle size={18} style={{ color: pColor.text }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: pColor.bg, color: pColor.text }}
                      >
                        {platformLabels[share.platform] || share.platform}
                      </span>
                    </div>
                    <h3
                      className="text-sm font-medium group-hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {share.title || '无标题'}
                    </h3>
                    <p
                      className="mt-1 line-clamp-2 text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {share.content?.slice(0, 120)}
                    </p>

                    {/* 封面图预览 */}
                    {share.cover_url && (
                      <div className="mt-2">
                        <img
                          src={share.cover_url}
                          alt="封面"
                          className="h-20 w-32 rounded-lg object-cover"
                        />
                      </div>
                    )}

                    {/* 图片缩略图 */}
                    {share.images && (() => {
                      try {
                        const imgs = JSON.parse(share.images) as string[];
                        if (imgs.length > 0) {
                          return (
                            <div className="mt-2 flex gap-1.5 overflow-hidden">
                              {imgs.slice(0, 4).map((img, i) => (
                                <img
                                  key={i}
                                  src={img}
                                  alt=""
                                  className="h-12 w-12 rounded object-cover"
                                  style={{ border: '1px solid var(--border)' }}
                                />
                              ))}
                              {imgs.length > 4 && (
                                <div
                                  className="flex h-12 w-12 items-center justify-center rounded text-xs"
                                  style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                >
                                  +{imgs.length - 4}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      } catch {
                        return null;
                      }
                    })()}

                    <span
                      className="mt-2 inline-block text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
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
              className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border p-6"
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

              {/* 封面图 */}
              {detailShare.cover_url && (
                <div className="mb-4 overflow-hidden rounded-lg">
                  <img
                    src={detailShare.cover_url}
                    alt="封面"
                    className="w-full rounded-lg object-cover"
                    style={{ maxHeight: 240 }}
                  />
                </div>
              )}

              <div
                className="mb-4 whitespace-pre-wrap rounded-lg border p-4 text-sm leading-relaxed"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {detailShare.content}
              </div>

              {/* 图片缩略图 */}
              {detailShare.images && (() => {
                try {
                  const imgs = JSON.parse(detailShare.images) as string[];
                  if (imgs.length > 0) {
                    return (
                      <div className="mb-5">
                        <div className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <ImageIcon size={12} />
                          配图 ({imgs.length})
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {imgs.map((img, i) => (
                            <img
                              key={i}
                              src={img}
                              alt=""
                              className="aspect-square w-full rounded-lg object-cover"
                              style={{ border: '1px solid var(--border)' }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                } catch {
                  return null;
                }
              })()}

              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(detailShare.content)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110"
                  style={{ background: 'var(--accent)' }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? '已复制' : '一键复制文案'}
                </button>
                <button
                  onClick={() => handleRegenerate(detailShare)}
                  disabled={regenerating}
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all hover:brightness-110"
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
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

              {/* Platform selection */}
              <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                选择平台
              </label>
              <div className="mb-4 flex gap-2">
                {(['xiaohongshu', 'wechat_moments'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setModalPlatform(p)}
                    className="flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors"
                    style={{
                      borderColor: modalPlatform === p ? 'var(--accent)' : 'var(--border)',
                      background: modalPlatform === p ? 'rgba(0,230,118,0.08)' : 'transparent',
                      color: modalPlatform === p ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {platformLabels[p]}
                  </button>
                ))}
              </div>

              {/* Digest selection */}
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
