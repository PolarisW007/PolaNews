'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Plus, Loader2, Calendar, Globe, Clock, Mic } from 'lucide-react';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface Broadcast {
  id: string;
  digest_id: string;
  broadcast_date: string;
  language: string;
  script: string;
  segments: string;
  total_duration_ms: number;
  voice_id: string;
  status: string;
  created_at: string;
}

interface TTSVoice {
  id: string;
  name: string;
  description: string;
}

export default function BroadcastListPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('longshu_v3');
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceMenuRef = useRef<HTMLDivElement>(null);

  const fetchBroadcasts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.broadcasts.list() as { broadcasts: Broadcast[] };
      setBroadcasts(data.broadcasts || []);
    } catch (e) {
      if (!silent) toast(e instanceof Error ? e.message : '获取播报列表失败', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  const fetchVoices = async () => {
    try {
      const data = await api.tts.voices() as TTSVoice[];
      if (Array.isArray(data)) setVoices(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchBroadcasts();
    fetchVoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 关闭语音菜单（点击外部）
  useEffect(() => {
    if (!showVoiceMenu) return;
    const handler = (e: MouseEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target as Node)) {
        setShowVoiceMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVoiceMenu]);

  // 生成中轮询
  useEffect(() => {
    if (generating) {
      setPollCount(0);
      pollRef.current = setInterval(async () => {
        setPollCount(c => c + 1);
        await fetchBroadcasts(true);
      }, 3000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [generating, fetchBroadcasts]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.broadcasts.generate('zh', selectedVoice);
      toast('播报生成中，音频正在后台合成...', 'success');
      await fetchBroadcasts(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成播报失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語' };
  const statusLabels: Record<string, string> = { ready: '就绪', playing: '播放中', error: '错误' };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 sm:mb-8">
          <div className="flex items-start sm:items-center justify-between gap-3 mb-3 sm:mb-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                智能播报
              </h1>
              <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                AI 将每日摘要转化为口语化播报稿
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60 shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              <span className="hidden sm:inline">生成新播报</span>
              <span className="sm:hidden">新建</span>
            </button>
          </div>
          <div className="flex items-center gap-2" ref={voiceMenuRef}>
            <div className="relative">
              <button
                onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                <Mic size={14} />
                {voices.find(v => v.id === selectedVoice)?.name || '龙叔'}
              </button>
              {showVoiceMenu && (
                <div
                  className="absolute left-0 sm:right-0 sm:left-auto top-full z-20 mt-1 min-w-[160px] rounded-lg py-1"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  {voices.map(v => (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedVoice(v.id); setShowVoiceMenu(false); }}
                      className="block w-full px-4 py-2 text-left text-xs transition-colors"
                      style={{
                        color: v.id === selectedVoice ? 'var(--accent)' : 'var(--text-secondary)',
                        backgroundColor: 'transparent',
                      }}
                    >
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-2 opacity-60">{v.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 生成中状态提示 */}
        {generating && (
          <div
            className="mb-4 flex items-center gap-3 rounded-xl border p-4"
            style={{ background: 'rgba(0,230,118,0.06)', borderColor: 'var(--accent)' }}
          >
            <Loader2 size={18} className="animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                正在生成播报脚本…
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                AI 正在撰写今日新闻播报，约需 30-60 秒（已刷新 {pollCount} 次）
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : broadcasts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl border py-16"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <Radio size={40} className="mb-4" style={{ color: 'var(--text-secondary)' }} />
            <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              暂无播报
            </p>
            <p className="mb-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
              点击"生成新播报"按钮，AI 将为你生成口语化的新闻播报稿
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              生成播报
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/broadcast/${b.id}`)}
                className="glow-border group flex w-full items-center gap-3 sm:gap-4 rounded-xl border p-3 sm:p-5 text-left transition-colors"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              >
                <div
                  className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(0,230,118,0.1)' }}
                >
                  <Radio size={20} style={{ color: 'var(--accent)' }} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3
                    className="text-sm sm:text-base font-medium group-hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {b.broadcast_date} 新闻播报
                  </h3>
                  <div
                    className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {format(new Date(b.created_at), 'yyyy-MM-dd HH:mm')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe size={12} />
                      {langLabels[b.language] || b.language}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(b.total_duration_ms)}
                    </span>
                  </div>
                </div>

                <span
                  className="rounded-full px-3 py-1 text-xs"
                  style={{
                    background: b.status === 'ready' ? 'rgba(0,230,118,0.08)' : 'rgba(255,152,0,0.08)',
                    color: b.status === 'ready' ? 'var(--accent-secondary)' : '#FFB74D',
                    border: '1px solid var(--border)',
                  }}
                >
                  {statusLabels[b.status] || b.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
