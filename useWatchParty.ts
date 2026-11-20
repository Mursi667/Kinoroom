import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessage,
  FloatingReaction,
  Movie,
  Participant,
  PlaybackState,
  QualityTier,
  ResolvedQuality,
  RoomState,
} from '../types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export interface VoiceSignalEvent {
  type: 'voice:peer-joined' | 'voice:peer-left' | 'voice:signal' | 'voice:force-mute';
  peerId?: string;
  fromId?: string;
  signalType?: 'offer' | 'answer' | 'ice';
  payload?: unknown;
  isForceMuted?: boolean;
}

const DEFAULT_NAMES = [
  'Алексей',
  'Мария',
  'Дмитрий',
  'Алина',
  'Максим',
  'София',
  'Артём',
  'Екатерина',
];

function getOrCreateUserName(): string {
  const saved = localStorage.getItem('kinoroom_username');
  if (saved && saved.trim()) return saved.trim();
  const generated = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
  localStorage.setItem('kinoroom_username', generated);
  return generated;
}

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('room')?.trim().toUpperCase();
  if (fromUrl) return fromUrl;

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('room', code);
  window.history.replaceState({}, '', nextUrl.toString());
  return code;
}

function resolveQualityFromBandwidth(mbps: number): ResolvedQuality {
  if (mbps >= 14) return '1440p';
  if (mbps >= 6) return '1080p';
  if (mbps >= 2.5) return '720p';
  if (mbps >= 1.1) return '480p';
  return '360p';
}

function getSavedAvatar(): string | undefined {
  const saved = localStorage.getItem('kinoroom_avatar');
  return saved && saved.trim() ? saved.trim() : undefined;
}

export function useWatchParty() {
  const [roomId, setRoomId] = useState<string>(() => getInitialRoomId());
  const [userName, setUserName] = useState<string>(() => getOrCreateUserName());
  const [userAvatar, setUserAvatar] = useState<string | undefined>(() => getSavedAvatar());
  const [room, setRoom] = useState<RoomState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [rttMs, setRttMs] = useState<number>(28);
  const [networkMbps, setNetworkMbps] = useState<number>(12.4);
  const [qualityMode, setQualityMode] = useState<QualityTier>('auto');
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [notice, setNotice] = useState<{ id: string; level: 'info' | 'warn'; text: string } | null>(
    null
  );
  const [kickedReason, setKickedReason] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const voiceHandlerRef = useRef<((ev: VoiceSignalEvent) => void) | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const manualCloseRef = useRef(false);

  const showNotice = useCallback((text: string, level: 'info' | 'warn' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotice({ id, level, text });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice((prev) => (prev?.id === id ? null : prev));
    }, 3800);
  }, []);

  const sendRaw = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const measureSpeed = useCallback(async () => {
    try {
      const navConn = (
        navigator as Navigator & {
          connection?: { downlink?: number; effectiveType?: string };
        }
      ).connection;

      const t0 = performance.now();
      const res = await fetch(`/api/speed-probe?t=${Date.now()}`, { cache: 'no-store' });
      const buf = await res.arrayBuffer();
      const elapsedSec = Math.max(0.004, (performance.now() - t0) / 1000);
      const measuredMbps = (buf.byteLength * 8) / (elapsedSec * 1_000_000);

      // Blend real probe throughput with browser Network Information API when present
      const blended =
        navConn && typeof navConn.downlink === 'number' && navConn.downlink > 0
          ? Math.min(measuredMbps, navConn.downlink * 1.6) * 0.7 + navConn.downlink * 0.3
          : measuredMbps;

      setNetworkMbps(Math.max(0.4, Math.min(85, Number(blended.toFixed(1)))));
    } catch {
      // Ignore transient probe errors
    }
  }, []);

  useEffect(() => {
    measureSpeed();
    const timer = window.setInterval(measureSpeed, 20000);
    return () => window.clearInterval(timer);
  }, [measureSpeed]);

  useEffect(() => {
    manualCloseRef.current = false;
    setKickedReason(null);

    let attempt = 0;

    const connect = () => {
      if (manualCloseRef.current) return;
      setConnectionStatus(attempt === 0 ? 'connecting' : 'reconnecting');

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnectionStatus('connected');
        const savedToken = localStorage.getItem(`kinoroom_admin_${roomId}`) || '';
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId,
            name: userName,
            avatar: userAvatar,
            adminToken: savedToken,
          })
        );
        ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      };

      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        const type = data.type;
        if (type === 'pong' && typeof data.ts === 'number') {
          setRttMs(Math.max(1, Math.round(Date.now() - data.ts)));
          return;
        }

        if (type === 'room:init') {
          const initRoom = data.room as RoomState;
          const myId = data.selfId as string;
          if (typeof data.adminToken === 'string' && data.adminToken) {
            localStorage.setItem(`kinoroom_admin_${initRoom.roomId}`, data.adminToken);
          }
          setSelfId(myId);
          setRoom(initRoom);
          return;
        }

        if (type === 'admin:granted' && typeof data.adminToken === 'string') {
          localStorage.setItem(`kinoroom_admin_${roomId}`, data.adminToken);
          showNotice('Вам назначена роль администратора комнаты.');
          return;
        }

        if (type === 'admin:kicked') {
          manualCloseRef.current = true;
          setKickedReason(
            typeof data.reason === 'string' ? data.reason : 'Вы были удалены из комнаты.'
          );
          return;
        }

        if (type === 'room:participants') {
          const participants = data.participants as Participant[];
          setRoom((prev) => (prev ? { ...prev, participants } : prev));
          return;
        }

        if (type === 'room:movies') {
          const movies = data.movies as Movie[];
          setRoom((prev) => (prev ? { ...prev, movies } : prev));
          return;
        }

        if (type === 'room:settings') {
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  title: typeof data.title === 'string' ? data.title : prev.title,
                  adminOnlyControl:
                    typeof data.adminOnlyControl === 'boolean'
                      ? data.adminOnlyControl
                      : prev.adminOnlyControl,
                }
              : prev
          );
          return;
        }

        if (type === 'player:state') {
          const playback = data.playback as PlaybackState;
          setRoom((prev) => (prev ? { ...prev, playback } : prev));
          return;
        }

        if (type === 'chat:message') {
          const message = data.message as ChatMessage;
          setRoom((prev) => {
            if (!prev) return prev;
            if (prev.messages.some((m) => m.id === message.id)) return prev;
            return { ...prev, messages: [...prev.messages, message].slice(-150) };
          });
          return;
        }

        if (type === 'reaction:burst') {
          const reaction = data.reaction as FloatingReaction;
          setReactions((prev) => [...prev.slice(-14), reaction]);
          window.setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
          }, 2300);
          return;
        }

        if (type === 'notice' && typeof data.text === 'string') {
          showNotice(data.text, data.level === 'warn' ? 'warn' : 'info');
          return;
        }

        if (type === 'voice:participant-update') {
          const pid = data.participantId as string;
          const isMuted = Boolean(data.isMuted);
          const isSpeaking = Boolean(data.isSpeaking);
          setRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === pid ? { ...p, isMuted, isSpeaking } : p
              ),
            };
          });
          return;
        }

        if (
          type === 'voice:peer-joined' ||
          type === 'voice:peer-left' ||
          type === 'voice:signal' ||
          type === 'voice:force-mute'
        ) {
          voiceHandlerRef.current?.(data as unknown as VoiceSignalEvent);
        }
      };

      ws.onclose = () => {
        if (manualCloseRef.current) return;
        attempt += 1;
        setConnectionStatus('reconnecting');
        const delay = Math.min(5000, 900 * Math.pow(1.6, attempt));
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    const pingInterval = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }
    }, 8000);

    const heartbeatInterval = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'player:heartbeat' }));
      }
    }, 5000);

    return () => {
      manualCloseRef.current = true;
      window.clearInterval(pingInterval);
      window.clearInterval(heartbeatInterval);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [roomId, showNotice]);

  const selfParticipant = useMemo(
    () => room?.participants.find((p) => p.id === selfId) ?? null,
    [room, selfId]
  );

  const isAdmin = selfParticipant?.role === 'admin';

  const resolvedQuality: ResolvedQuality = useMemo(() => {
    if (qualityMode === 'auto') {
      return resolveQualityFromBandwidth(networkMbps);
    }
    return qualityMode;
  }, [qualityMode, networkMbps]);

  const [localMovieOverride, setLocalMovieOverride] = useState<Movie | null>(null);

  const currentMovie = useMemo(() => {
    if (localMovieOverride) return localMovieOverride;
    if (!room) return null;
    return room.movies.find((m) => m.id === room.playback.movieId) ?? room.movies[0] ?? null;
  }, [room, localMovieOverride]);

  const sendPlay = useCallback(
    (currentTime: number) => {
      sendRaw({ type: 'player:sync', action: 'play', currentTime });
    },
    [sendRaw]
  );

  const sendPause = useCallback(
    (currentTime: number) => {
      sendRaw({ type: 'player:sync', action: 'pause', currentTime });
    },
    [sendRaw]
  );

  const sendSeek = useCallback(
    (currentTime: number) => {
      sendRaw({ type: 'player:sync', action: 'seek', currentTime });
    },
    [sendRaw]
  );

  const sendRate = useCallback(
    (playbackRate: number) => {
      sendRaw({ type: 'player:sync', action: 'rate', playbackRate });
    },
    [sendRaw]
  );

  const selectMovie = useCallback(
    (movieId: string) => {
      setLocalMovieOverride(null);
      sendRaw({ type: 'player:sync', action: 'movie', movieId });
    },
    [sendRaw]
  );

  const setVideoSource = useCallback(
    (opts: {
      title: string;
      url: string;
      provider: 'direct' | 'youtube' | 'gdrive' | 'uploaded';
      externalId?: string;
    }) => {
      setLocalMovieOverride(null);
      sendRaw({
        type: 'player:sync',
        action: 'movie',
        customMovie: {
          title: opts.title,
          provider: opts.provider,
          externalId: opts.externalId,
          sources: {
            '1440p': opts.url,
            '1080p': opts.url,
            '720p': opts.url,
            '480p': opts.url,
            '360p': opts.url,
          },
        },
      });
    },
    [sendRaw]
  );

  const openLocalFileOnly = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setLocalMovieOverride({
      id: `local-${Date.now()}`,
      title: file.name,
      provider: 'local',
      genre: 'Локальный файл',
      durationLabel: 'С устройства',
      isCustom: true,
      sources: {
        '1440p': objectUrl,
        '1080p': objectUrl,
        '720p': objectUrl,
        '480p': objectUrl,
        '360p': objectUrl,
      },
    });
    showNotice('Локальный файл открыт у вас. Чтобы смотрели друзья, выберите загрузку в комнату.');
  }, [showNotice]);

  const uploadVideoFile = useCallback(
    (file: File, onProgress?: (pct: number) => void): Promise<boolean> => {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload-video');
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && onProgress) {
            onProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText) as {
                title: string;
                url: string;
              };
              setVideoSource({
                title: data.title,
                url: data.url,
                provider: 'uploaded',
              });
              showNotice('Видео загружено и запущено для всей комнаты.');
              resolve(true);
              return;
            } catch {
              // fallback below
            }
          }
          showNotice('Не удалось загрузить файл (лимит 120 МБ).', 'warn');
          resolve(false);
        };

        xhr.onerror = () => {
          showNotice('Ошибка сети при загрузке файла.', 'warn');
          resolve(false);
        };

        xhr.send(file);
      });
    },
    [setVideoSource, showNotice]
  );

  const sendChat = useCallback(
    (text: string) => {
      sendRaw({ type: 'chat:send', text });
    },
    [sendRaw]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      sendRaw({ type: 'reaction:send', emoji });
    },
    [sendRaw]
  );

  const updateProfile = useCallback(
    (nextName: string, nextAvatar?: string | null) => {
      const cleaned = nextName.trim().slice(0, 28);
      if (cleaned) {
        localStorage.setItem('kinoroom_username', cleaned);
        setUserName(cleaned);
      }

      let resolvedAvatar = userAvatar;
      if (nextAvatar !== undefined) {
        if (nextAvatar && nextAvatar.trim()) {
          localStorage.setItem('kinoroom_avatar', nextAvatar.trim());
          resolvedAvatar = nextAvatar.trim();
        } else {
          localStorage.removeItem('kinoroom_avatar');
          resolvedAvatar = undefined;
        }
        setUserAvatar(resolvedAvatar);
      }

      sendRaw({
        type: 'user:profile',
        name: cleaned || userName,
        avatar: resolvedAvatar ?? '',
      });
      showNotice('Профиль обновлён.');
    },
    [sendRaw, showNotice, userAvatar, userName]
  );

  const sendAdminAction = useCallback(
    (
      actionType:
        | 'toggle-lock'
        | 'promote'
        | 'demote'
        | 'mute-user'
        | 'chat-ban'
        | 'kick-user'
        | 'update-title',
      targetId?: string,
      value?: string
    ) => {
      sendRaw({ type: 'admin:action', actionType, targetId, value });
    },
    [sendRaw]
  );

  const joinRoomByCode = useCallback((code: string) => {
    const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleaned) return;
    setLocalMovieOverride(null);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('room', cleaned);
    window.history.pushState({}, '', nextUrl.toString());
    setRoomId(cleaned);
  }, []);

  const createNewRoom = useCallback(async (title?: string) => {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { roomId: string; adminToken: string };
      localStorage.setItem(`kinoroom_admin_${data.roomId}`, data.adminToken);
      setLocalMovieOverride(null);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('room', data.roomId);
      window.history.pushState({}, '', nextUrl.toString());
      setRoomId(data.roomId);
      return data.roomId;
    } catch {
      return null;
    }
  }, []);

  const registerVoiceSignalHandler = useCallback((fn: (ev: VoiceSignalEvent) => void) => {
    voiceHandlerRef.current = fn;
  }, []);

  return {
    roomId,
    userName,
    userAvatar,
    room,
    selfId,
    selfParticipant,
    isAdmin,
    isChatMuted: Boolean(selfParticipant?.isChatMuted),
    currentMovie,
    connectionStatus,
    rttMs,
    networkMbps,
    qualityMode,
    setQualityMode,
    resolvedQuality,
    measureSpeed,
    reactions,
    notice,
    showNotice,
    kickedReason,
    sendRaw,
    sendPlay,
    sendPause,
    sendSeek,
    sendRate,
    selectMovie,
    setVideoSource,
    openLocalFileOnly,
    uploadVideoFile,
    sendChat,
    sendReaction,
    updateProfile,
    sendAdminAction,
    joinRoomByCode,
    createNewRoom,
    registerVoiceSignalHandler,
  };
}
