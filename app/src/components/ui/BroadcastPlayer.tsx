'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, ChevronUp } from 'lucide-react';

interface Segment {
  index: number;
  text: string;
  duration_ms?: number;
}

interface BroadcastPlayerProps {
  script: string;
  segments: Segment[];
  title: string;
  onSegmentChange?: (index: number) => void;
  onClose?: () => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function BroadcastPlayer({ script, segments, title, onSegmentChange, onClose }: BroadcastPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentText = segments[currentSegment]?.text || script;
  const totalSegments = segments.length || 1;

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.volume = muted ? 0 : volume;
    utterance.lang = 'zh-CN';

    utterance.onend = () => {
      if (currentSegment < totalSegments - 1) {
        setCurrentSegment(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setProgress(100);
      }
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speed, volume, muted, currentSegment, totalSegments]);

  useEffect(() => {
    if (isPlaying) {
      speak(currentText);
      onSegmentChange?.(currentSegment);
    }
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, [isPlaying, currentSegment, speak, currentText, onSegmentChange]);

  useEffect(() => {
    if (isPlaying) {
      let elapsed = 0;
      const estimatedDuration = currentText.length * 120 / speed;
      intervalRef.current = setInterval(() => {
        elapsed += 100;
        setProgress(Math.min((elapsed / estimatedDuration) * 100, 99));
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, currentText, speed]);

  const togglePlay = () => {
    if (isPlaying) {
      window.speechSynthesis?.pause();
      setIsPlaying(false);
    } else {
      if (window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
      setIsPlaying(true);
    }
  };

  const skipPrev = () => {
    window.speechSynthesis?.cancel();
    setCurrentSegment(Math.max(0, currentSegment - 1));
    setProgress(0);
    if (isPlaying) setIsPlaying(true);
  };

  const skipNext = () => {
    window.speechSynthesis?.cancel();
    if (currentSegment < totalSegments - 1) {
      setCurrentSegment(currentSegment + 1);
      setProgress(0);
      if (isPlaying) setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transition-all"
      style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-full transition-all"
          style={{ width: `${progress}%`, backgroundColor: 'var(--accent)' }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button onClick={skipPrev} className="p-2 rounded-lg hover:bg-white/5">
              <SkipBack size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <button
              onClick={togglePlay}
              className="p-3 rounded-full"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>
            <button onClick={skipNext} className="p-2 rounded-lg hover:bg-white/5">
              <SkipForward size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {title}
            </p>
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {currentSegment + 1} / {totalSegments} 段
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cycleSpeed}
              className="px-2 py-1 rounded text-xs font-mono"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--accent)', border: '1px solid var(--border)' }}
            >
              {speed}x
            </button>

            <button onClick={() => setMuted(!muted)} className="p-2 rounded-lg hover:bg-white/5">
              {muted ? <VolumeX size={18} style={{ color: 'var(--text-secondary)' }} /> : <Volume2 size={18} style={{ color: 'var(--text-secondary)' }} />}
            </button>

            <button onClick={() => setExpanded(!expanded)} className="p-2 rounded-lg hover:bg-white/5">
              <ChevronUp
                size={18}
                style={{ color: 'var(--text-secondary)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>

            {onClose && (
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
                <X size={18} style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 max-h-48 overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
            {segments.map((seg, i) => (
              <div
                key={i}
                onClick={() => { setCurrentSegment(i); setProgress(0); if (isPlaying) { window.speechSynthesis?.cancel(); setIsPlaying(true); } }}
                className="p-2 rounded-lg cursor-pointer text-sm mb-1 transition-colors"
                style={{
                  backgroundColor: i === currentSegment ? 'rgba(0,230,118,0.1)' : 'transparent',
                  color: i === currentSegment ? 'var(--accent)' : 'var(--text-secondary)',
                  borderLeft: i === currentSegment ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                {seg.text.slice(0, 100)}...
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
