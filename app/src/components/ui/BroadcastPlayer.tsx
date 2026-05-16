'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, ChevronUp, Loader2 } from 'lucide-react';

interface Segment {
  index: number;
  text: string;
  duration_ms?: number;
  audio_url?: string | null;
}

interface BroadcastPlayerProps {
  script: string;
  segments: Segment[];
  title: string;
  voiceId?: string;
  onSegmentChange?: (index: number) => void;
  onClose?: () => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

function resolveAudioUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (basePath && url.startsWith(`${basePath}/`)) return url;
  return `${basePath}${url}`;
}

export default function BroadcastPlayer({ segments, title, voiceId = 'longshu_v3', onSegmentChange, onClose }: BroadcastPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [synthLoading, setSynthLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const totalSegments = segments.length || 1;

  const destroyAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  const synthesizeOnDemand = useCallback(async (text: string): Promise<string | null> => {
    setSynthLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/tts/synthesize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: text.slice(0, 5000), voice: voiceId }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        return data.data.url;
      }
    } catch (e) {
      console.error('[BroadcastPlayer] TTS 合成失败:', e);
    } finally {
      setSynthLoading(false);
    }
    return null;
  }, [voiceId]);

  const playSegment = useCallback(async (segIndex: number) => {
    destroyAudio();
    const seg = segments[segIndex];
    if (!seg) return;

    let audioUrl = seg.audio_url ? resolveAudioUrl(seg.audio_url) : null;

    if (!audioUrl && seg.text) {
      audioUrl = await synthesizeOnDemand(seg.text);
    }

    if (!audioUrl) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(seg.text);
        utterance.rate = speed;
        utterance.volume = muted ? 0 : volume;
        utterance.lang = 'zh-CN';
        utterance.onend = () => {
          if (segIndex < totalSegments - 1) {
            setCurrentSegment(segIndex + 1);
          } else {
            setIsPlaying(false);
            setProgress(100);
          }
        };
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
      }
      return;
    }

    setLoading(true);
    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    audio.volume = muted ? 0 : volume;
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setLoading(false);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    });

    audio.addEventListener('ended', () => {
      if (segIndex < totalSegments - 1) {
        setCurrentSegment(segIndex + 1);
      } else {
        setIsPlaying(false);
        setProgress(100);
      }
    });

    audio.addEventListener('error', () => {
      console.error('[BroadcastPlayer] 音频播放错误');
      setLoading(false);
      if (segIndex < totalSegments - 1) {
        setCurrentSegment(segIndex + 1);
      } else {
        setIsPlaying(false);
      }
    });

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setLoading(false);
    }
  }, [segments, speed, volume, muted, totalSegments, destroyAudio, synthesizeOnDemand]);

  useEffect(() => {
    if (isPlaying) {
      playSegment(currentSegment);
      onSegmentChange?.(currentSegment);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSegment]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  useEffect(() => {
    return () => {
      destroyAudio();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, [destroyAudio]);

  const togglePlay = async () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined') window.speechSynthesis?.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current && audioRef.current.paused && audioRef.current.currentTime > 0) {
        await audioRef.current.play();
        setIsPlaying(true);
      } else if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
        setIsPlaying(true);
      } else {
        await playSegment(currentSegment);
        onSegmentChange?.(currentSegment);
      }
    }
  };

  const skipPrev = () => {
    destroyAudio();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    const newIdx = Math.max(0, currentSegment - 1);
    setCurrentSegment(newIdx);
    setProgress(0);
    setCurrentTime(0);
  };

  const skipNext = () => {
    destroyAudio();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    if (currentSegment < totalSegments - 1) {
      setCurrentSegment(currentSegment + 1);
      setProgress(0);
      setCurrentTime(0);
    }
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transition-all"
      style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-full transition-all"
          style={{ width: `${progress}%`, backgroundColor: 'var(--accent)' }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={skipPrev} className="p-1.5 sm:p-2 rounded-lg hover:bg-white/5">
              <SkipBack size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button
              onClick={togglePlay}
              disabled={loading || synthLoading}
              className="p-2.5 sm:p-3 rounded-full"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              {loading || synthLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} />
              ) : (
                <Play size={18} className="ml-0.5" />
              )}
            </button>
            <button onClick={skipNext} className="p-1.5 sm:p-2 rounded-lg hover:bg-white/5">
              <SkipForward size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {title}
            </p>
            <p className="text-[10px] sm:text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {currentSegment + 1}/{totalSegments}段
              {duration > 0 && ` · ${formatTime(currentTime)}/${formatTime(duration)}`}
              {synthLoading && ' · 合成中'}
            </p>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={cycleSpeed}
              className="px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-xs font-mono"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--accent)', border: '1px solid var(--border)' }}
            >
              {speed}x
            </button>

            <button onClick={() => setMuted(!muted)} className="p-1.5 sm:p-2 rounded-lg hover:bg-white/5 hidden sm:block">
              {muted
                ? <VolumeX size={18} style={{ color: 'var(--text-secondary)' }} />
                : <Volume2 size={18} style={{ color: 'var(--text-secondary)' }} />}
            </button>

            <button onClick={() => setExpanded(!expanded)} className="p-1.5 sm:p-2 rounded-lg hover:bg-white/5">
              <ChevronUp
                size={16}
                style={{
                  color: 'var(--text-secondary)',
                  transform: expanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                }}
              />
            </button>

            {onClose && (
              <button onClick={onClose} className="p-1.5 sm:p-2 rounded-lg hover:bg-white/5">
                <X size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 max-h-48 overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
            {segments.map((seg, i) => (
              <div
                key={i}
                onClick={() => {
                  destroyAudio();
                  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
                  setCurrentSegment(i);
                  setProgress(0);
                  setCurrentTime(0);
                  if (isPlaying) {
                    playSegment(i);
                  }
                }}
                className="p-2 rounded-lg cursor-pointer text-sm mb-1 transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: i === currentSegment ? 'rgba(0,255,157,0.1)' : 'transparent',
                  color: i === currentSegment ? 'var(--accent)' : 'var(--text-secondary)',
                  borderLeft: i === currentSegment ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <span className="flex-1 truncate">{seg.text.slice(0, 100)}...</span>
                {seg.audio_url && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,255,157,0.15)', color: 'var(--accent)' }}>
                    音频
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
