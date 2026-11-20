import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Film,
  FolderPlus,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import type {
  FloatingReaction,
  Movie,
  PlaybackState,
  QualityTier,
  ResolvedQuality,
} from '../types';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  setPlaybackRate: (rate: number) => void;
  setPlaybackQuality: (quality: string) => void;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (ev: { target: YTPlayerInstance }) => void;
            onStateChange?: (ev: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface VideoStageProps {
  movie: Movie | null;
  playback: PlaybackState | null;
  canControl: boolean;
  adminOnlyControl: boolean;
  qualityMode: QualityTier;
  resolvedQuality: ResolvedQuality;
  networkMbps: number;
  onChangeQuality: (q: QualityTier) => void;
  onMeasureSpeed: () => void;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (currentTime: number) => void;
  onRateChange: (rate: number) => void;
  onOpenSourceModal: () => void;
  reactions: FloatingReaction[];
  onSendReaction: (emoji: string) => void;
  autoDuckActive: boolean;
  anySpeaking: boolean;
}

const QUALITY_OPTIONS: { id: QualityTier; label: string; hint: string }[] = [
  { id: 'auto', label: 'Авто (по сети)', hint: 'Адаптивный выбор' },
  { id: '1440p', label: '1440p 2K QHD', hint: 'Ультра чёткость' },
  { id: '1080p', label: '1080p Full HD', hint: 'Высокий битрейт' },
  { id: '720p', label: '720p HD', hint: 'Оптимально' },
  { id: '480p', label: '480p SD', hint: 'Экономия трафика' },
  { id: '360p', label: '360p Мобильный', hint: 'Слабый интернет' },
];

const REACTION_EMOJIS = ['🔥', '😂', '👏', '🤯', '❤️'];

const YT_QUALITY_MAP: Record<ResolvedQuality, string> = {
  '1440p': 'hd1440',
  '1080p': 'hd1080',
  '720p': 'hd720',
  '480p': 'large',
  '360p': 'medium',
};

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const VideoStage: React.FC<VideoStageProps> = ({
  movie,
  playback,
  canControl,
  adminOnlyControl,
  qualityMode,
  resolvedQuality,
  networkMbps,
  onChangeQuality,
  onMeasureSpeed,
  onPlay,
  onPause,
  onSeek,
  onRateChange,
  onOpenSourceModal,
  reactions,
  onSendReaction,
  autoDuckActive,
  anySpeaking,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const isRemoteSyncRef = useRef(false);
  const resumePositionRef = useRef<number | null>(null);
  const resumePlayRef = useRef<boolean>(false);

  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const hideControlsTimerRef = useRef<number | null>(null);
  const prevSrcRef = useRef<string>('');

  const provider = movie?.provider ?? 'direct';
  const isHtmlVideo = provider === 'direct' || provider === 'uploaded' || provider === 'local';
  const activeUrl = movie ? movie.sources[resolvedQuality] : '';

  // Apply ducking when friends speak in voice chat
  useEffect(() => {
    const effectiveVol =
      autoDuckActive && anySpeaking ? Math.min(volume, 0.25) : volume;
    const video = videoRef.current;
    if (video) {
      video.volume = effectiveVol;
      video.muted = isMuted;
    }
    const yt = ytPlayerRef.current;
    if (yt && ytReadyRef.current) {
      yt.setVolume(Math.round(effectiveVol * 100));
      if (isMuted) yt.mute();
      else yt.unMute();
    }
  }, [volume, isMuted, autoDuckActive, anySpeaking]);

  // Preserve position across quality switches for HTML5 video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeUrl || !isHtmlVideo) return;
    if (prevSrcRef.current && prevSrcRef.current !== activeUrl) {
      resumePositionRef.current = video.currentTime;
      resumePlayRef.current = !video.paused;
    }
    prevSrcRef.current = activeUrl;
  }, [activeUrl, isHtmlVideo]);

  // Initialize & manage YouTube IFrame Player API when provider === 'youtube'
  useEffect(() => {
    if (provider !== 'youtube' || !movie?.externalId) {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
      }
      return;
    }

    const ytId = movie.externalId;
    let cancelled = false;

    const mountPlayer = () => {
      if (cancelled || !ytContainerRef.current || !window.YT?.Player) return;
      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideoById(ytId);
        return;
      }

      ytReadyRef.current = false;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: ytId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            ytReadyRef.current = true;
            setDuration(ev.target.getDuration() || 0);
            ev.target.setPlaybackQuality(YT_QUALITY_MAP[resolvedQuality]);
            if (playback) {
              const elapsed = playback.isPlaying
                ? Math.max(0, (Date.now() - playback.updatedAt) / 1000) * playback.playbackRate
                : 0;
              ev.target.seekTo(playback.currentTime + elapsed, true);
              if (playback.isPlaying) ev.target.playVideo();
            }
          },
          onStateChange: (ev) => {
            if (cancelled || isRemoteSyncRef.current || !canControl) return;
            const current = ev.target.getCurrentTime();
            if (ev.data === window.YT?.PlayerState.PLAYING) {
              onPlay(current);
            } else if (ev.data === window.YT?.PlayerState.PAUSED) {
              onPause(current);
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      mountPlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = () => {
        mountPlayer();
      };
    }

    const pollYt = window.setInterval(() => {
      if (ytPlayerRef.current && ytReadyRef.current) {
        const t = ytPlayerRef.current.getCurrentTime();
        const d = ytPlayerRef.current.getDuration();
        if (Number.isFinite(t)) setLocalTime(t);
        if (Number.isFinite(d) && d > 0) setDuration(d);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(pollYt);
    };
  }, [provider, movie?.externalId]);

  // Apply YouTube quality updates
  useEffect(() => {
    if (provider === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.setPlaybackQuality(YT_QUALITY_MAP[resolvedQuality]);
    }
  }, [provider, resolvedQuality]);

  // Sync HTML5 video or YouTube player with authoritative server PlaybackState
  useEffect(() => {
    if (!playback) return;
    const elapsed = playback.isPlaying
      ? Math.max(0, (Date.now() - playback.updatedAt) / 1000) * playback.playbackRate
      : 0;
    const targetTime = playback.currentTime + elapsed;

    isRemoteSyncRef.current = true;

    if (isHtmlVideo && videoRef.current) {
      const video = videoRef.current;
      if (video.playbackRate !== playback.playbackRate) {
        video.playbackRate = playback.playbackRate;
      }
      if (video.readyState >= 1 && Math.abs(video.currentTime - targetTime) > 0.7) {
        video.currentTime = targetTime;
        setLocalTime(targetTime);
      }
      if (playback.isPlaying && video.paused) {
        video
          .play()
          .then(() => setAutoplayBlocked(false))
          .catch(() => setAutoplayBlocked(true));
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
        setAutoplayBlocked(false);
      }
    } else if (provider === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      const yt = ytPlayerRef.current;
      yt.setPlaybackRate(playback.playbackRate);
      const current = yt.getCurrentTime();
      if (Math.abs(current - targetTime) > 1.2) {
        yt.seekTo(targetTime, true);
      }
      const state = yt.getPlayerState();
      if (playback.isPlaying && state !== window.YT?.PlayerState.PLAYING) {
        yt.playVideo();
      } else if (!playback.isPlaying && state === window.YT?.PlayerState.PLAYING) {
        yt.pauseVideo();
      }
    }

    window.setTimeout(() => {
      isRemoteSyncRef.current = false;
    }, 180);
  }, [playback, isHtmlVideo, provider]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = window.setTimeout(() => {
      if (playback?.isPlaying) {
        setShowControls(false);
        setShowQualityMenu(false);
      }
    }, 3200);
  }, [playback?.isPlaying]);

  const handleTogglePlay = () => {
    if (!canControl) return;
    const current = isHtmlVideo
      ? videoRef.current?.currentTime ?? 0
      : provider === 'youtube' && ytReadyRef.current
      ? ytPlayerRef.current?.getCurrentTime() ?? 0
      : localTime;

    if (playback?.isPlaying) {
      onPause(current);
    } else {
      onPlay(current);
    }
  };

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl) return;
    const next = Number(e.target.value);
    setLocalTime(next);
    if (isHtmlVideo && videoRef.current) {
      videoRef.current.currentTime = next;
    } else if (provider === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.seekTo(next, true);
    }
    onSeek(next);
  };

  const handleSkip = (delta: number) => {
    if (!canControl) return;
    const current = isHtmlVideo
      ? videoRef.current?.currentTime ?? localTime
      : localTime;
    const next = Math.max(0, Math.min(duration || current + delta, current + delta));
    if (isHtmlVideo && videoRef.current) videoRef.current.currentTime = next;
    if (provider === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.seekTo(next, true);
    }
    setLocalTime(next);
    onSeek(next);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleUnblockAutoplay = () => {
    const video = videoRef.current;
    if (!video || !playback) return;
    const elapsed = playback.isPlaying
      ? Math.max(0, (Date.now() - playback.updatedAt) / 1000) * playback.playbackRate
      : 0;
    video.currentTime = playback.currentTime + elapsed;
    video
      .play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => {});
  };

  return (
    <div className="space-y-3">
      {/* Main Theater Viewport */}
      <div
        ref={containerRef}
        onMouseMove={revealControls}
        onMouseLeave={() => playback?.isPlaying && setShowControls(false)}
        className="relative aspect-video w-full overflow-hidden rounded-3xl bg-slate-950 border border-slate-900/15 dark:border-white/10 shadow-2xl select-none group"
      >
        {isHtmlVideo && activeUrl ? (
          <video
            ref={videoRef}
            src={activeUrl}
            playsInline
            preload="metadata"
            onLoadedMetadata={() => {
              const video = videoRef.current;
              if (!video) return;
              setDuration(video.duration || 0);
              if (resumePositionRef.current !== null) {
                video.currentTime = resumePositionRef.current;
                resumePositionRef.current = null;
                if (resumePlayRef.current) {
                  video.play().catch(() => {});
                }
              } else if (playback) {
                const elapsed = playback.isPlaying
                  ? Math.max(0, (Date.now() - playback.updatedAt) / 1000) * playback.playbackRate
                  : 0;
                const target = playback.currentTime + elapsed;
                if (Math.abs(video.currentTime - target) > 0.7) {
                  video.currentTime = target;
                }
              }
            }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                setLocalTime(videoRef.current.currentTime);
              }
            }}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onEnded={() => {
              if (canControl && videoRef.current) {
                onPause(videoRef.current.duration || 0);
              }
            }}
            onClick={handleTogglePlay}
            className="h-full w-full object-contain bg-black cursor-pointer"
          />
        ) : provider === 'youtube' && movie?.externalId ? (
          <div className="h-full w-full bg-black">
            <div ref={ytContainerRef} className="h-full w-full" />
          </div>
        ) : provider === 'gdrive' && movie?.externalId ? (
          <iframe
            src={`https://drive.google.com/file/d/${movie.externalId}/preview`}
            allow="autoplay; fullscreen"
            title={movie.title}
            className="h-full w-full border-0 bg-black"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-300">
            <div className="flex flex-col items-center gap-3">
              <Film className="h-10 w-10 text-sky-400" />
              <span className="text-sm">Выберите источник видео для просмотра</span>
            </div>
          </div>
        )}

        {/* Top measured scrim */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-5 pt-4 pb-10 transition-opacity duration-200 ${
            showControls || !playback?.isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-white truncate">
                {movie?.title ?? 'Загрузка видео...'}
              </h2>
              <p className="text-xs text-slate-300 truncate">
                {movie ? `${movie.genre} · ${movie.durationLabel}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-200 tabular-nums shrink-0">
              {adminOnlyControl && (
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Только админ</span>
                </span>
              )}
              <span>
                {qualityMode === 'auto' ? `Авто (${resolvedQuality})` : resolvedQuality} ·{' '}
                {networkMbps.toFixed(1)} Мбит/с
              </span>
            </div>
          </div>
        </div>

        {/* Floating Live Emoji Reactions */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {reactions.map((r) => (
            <div
              key={r.id}
              style={{ left: `${r.offsetX}%` }}
              className="animate-reaction-float absolute bottom-20 flex flex-col items-center"
            >
              <span className="text-3xl drop-shadow-md">{r.emoji}</span>
              <span className="mt-0.5 text-[11px] font-medium text-white drop-shadow">
                {r.senderName}
              </span>
            </div>
          ))}
        </div>

        {isBuffering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="liquid-glass-elevated rounded-2xl px-4 py-2.5 text-xs font-medium text-white">
              Буферизация потока...
            </div>
          </div>
        )}

        {autoplayBlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
            <button
              type="button"
              onClick={handleUnblockAutoplay}
              className="liquid-glass-elevated rounded-2xl px-6 py-4 flex items-center gap-3 text-white hover:scale-[1.02] transition-transform duration-150 cursor-pointer"
            >
              <Play className="h-5 w-5 text-sky-400 fill-sky-400" />
              <span className="text-sm font-semibold">
                Нажмите, чтобы синхронизироваться со звуком
              </span>
            </button>
          </div>
        )}

        {/* Custom Bottom Controls (Shown for HTML5 video; compact sync bar for YouTube) */}
        {provider !== 'gdrive' && (
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 sm:px-5 pt-12 pb-3.5 transition-opacity duration-200 ${
              provider === 'youtube'
                ? 'pointer-events-none opacity-0 group-hover:opacity-100'
                : showControls || !playback?.isPlaying
                ? 'opacity-100'
                : 'opacity-0'
            }`}
          >
            {isHtmlVideo && (
              <div className="mb-2.5 flex items-center gap-3">
                <span className="text-xs font-mono text-slate-200 tabular-nums w-12 text-right">
                  {formatTime(localTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={Math.min(localTime, duration || 100)}
                  disabled={!canControl}
                  onChange={handleSeekInput}
                  aria-label="Перемотка видео"
                  className="h-1.5 flex-1 appearance-none rounded-full bg-white/25 accent-sky-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="text-xs font-mono text-slate-300 tabular-nums w-12">
                  {formatTime(duration)}
                </span>
              </div>
            )}

            <div className="pointer-events-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  disabled={!canControl}
                  title={
                    canControl
                      ? playback?.isPlaying
                        ? 'Пауза для всех'
                        : 'Воспроизвести для всех'
                      : 'Только администратор управляет плеером'
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                >
                  {playback?.isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSkip(-10)}
                  disabled={!canControl}
                  title="Назад 10 сек"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-200 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSkip(10)}
                  disabled={!canControl}
                  title="Вперёд 10 сек"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-200 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                <div className="hidden sm:flex items-center gap-2 ml-1">
                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    title={isMuted ? 'Включить звук' : 'Выключить звук'}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-200 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      if (v > 0 && isMuted) setIsMuted(false);
                    }}
                    aria-label="Громкость видео"
                    className="w-20 h-1 appearance-none rounded-full bg-white/25 accent-sky-400 cursor-pointer"
                  />
                  {autoDuckActive && anySpeaking && (
                    <span className="text-[11px] text-sky-300 whitespace-nowrap">
                      Приглушено для голоса
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 relative">
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => {
                    const rates = [1, 1.25, 1.5, 0.75];
                    const idx = rates.indexOf(playback?.playbackRate ?? 1);
                    onRateChange(rates[(idx + 1) % rates.length]);
                  }}
                  title="Скорость воспроизведения"
                  className="h-9 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono text-slate-100 tabular-nums transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {(playback?.playbackRate ?? 1).toFixed(playback?.playbackRate === 1 ? 0 : 2)}x
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowQualityMenu((v) => !v)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                    <span>
                      {qualityMode === 'auto' ? `Авто · ${resolvedQuality}` : resolvedQuality}
                    </span>
                  </button>

                  {showQualityMenu && (
                    <div className="absolute right-0 bottom-12 z-30 w-64 rounded-2xl bg-slate-900/95 backdrop-blur-2xl border border-white/15 p-2 shadow-2xl">
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10 mb-1">
                        <span className="text-xs font-semibold text-white">Качество видео</span>
                        <button
                          type="button"
                          onClick={onMeasureSpeed}
                          className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                        >
                          <Wifi className="h-3 w-3" />
                          <span className="tabular-nums">{networkMbps.toFixed(1)} Мбит/с</span>
                        </button>
                      </div>
                      <div className="space-y-0.5">
                        {QUALITY_OPTIONS.map((opt) => {
                          const selected = qualityMode === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                onChangeQuality(opt.id);
                                setShowQualityMenu(false);
                              }}
                              className={`w-full flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                                selected
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="font-medium">{opt.label}</div>
                                <div className="text-[11px] text-slate-400">{opt.hint}</div>
                              </div>
                              {selected && <Check className="h-4 w-4 text-sky-400 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Reaction & Source Control Strip */}
      <div className="liquid-glass rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Реакции:
          </span>
          <div className="flex items-center gap-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSendReaction(emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-900/5 dark:hover:bg-white/10 active:scale-90 text-lg transition-transform duration-150 cursor-pointer"
                title={`Отправить реакцию ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenSourceModal}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ссылка / Файл / YouTube / Google</span>
          </button>

          <span className="hidden sm:inline text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            {qualityMode === 'auto' ? `Авто (${resolvedQuality})` : resolvedQuality} ·{' '}
            {networkMbps.toFixed(1)} Мбит/с
          </span>
        </div>
      </div>
    </div>
  );
};
