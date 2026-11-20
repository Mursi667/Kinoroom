import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant } from '../types';
import type { VoiceSignalEvent } from './useWatchParty';

interface UseVoiceChatOptions {
  selfId: string | null;
  participants: Participant[];
  sendRaw: (payload: unknown) => void;
  registerVoiceSignalHandler: (fn: (ev: VoiceSignalEvent) => void) => void;
  onNotice: (text: string, level?: 'info' | 'warn') => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useVoiceChat({
  selfId,
  participants,
  sendRaw,
  registerVoiceSignalHandler,
  onNotice,
}: UseVoiceChatOptions) {
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeakingLocal, setIsSpeakingLocal] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [micError, setMicError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserIntervalRef = useRef<number | null>(null);
  const isMutedRef = useRef(false);
  const isJoinedRef = useRef(false);
  const isDeafenedRef = useRef(false);
  const lastSpeakingSentRef = useRef<boolean>(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isJoinedRef.current = isJoined;
  }, [isJoined]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
    for (const [peerId, audio] of audioElementsRef.current.entries()) {
      const peer = participants.find((p) => p.id === peerId);
      audio.muted = isDeafened || Boolean(peer?.isForceMuted);
    }
  }, [isDeafened, participants]);

  const cleanupPeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      peersRef.current.delete(peerId);
    }
    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      audioElementsRef.current.delete(peerId);
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendRaw({
            type: 'voice:signal',
            targetId: peerId,
            signalType: 'ice',
            payload: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        let audio = audioElementsRef.current.get(peerId);
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          audio.volume = peerVolumes[peerId] ?? 1;
          audioElementsRef.current.set(peerId, audio);
        }
        audio.srcObject = stream;
        audio.play().catch(() => {
          // Autoplay policy handled on user gesture
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupPeer(peerId);
        }
      };

      peersRef.current.set(peerId, pc);
      return pc;
    },
    [cleanupPeer, peerVolumes, sendRaw]
  );

  const leaveVoice = useCallback(() => {
    if (analyserIntervalRef.current) {
      window.clearInterval(analyserIntervalRef.current);
      analyserIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    for (const peerId of Array.from(peersRef.current.keys())) {
      cleanupPeer(peerId);
    }
    setIsJoined(false);
    setIsSpeakingLocal(false);
    setMicLevel(0);
    if (isJoinedRef.current) {
      sendRaw({ type: 'voice:leave' });
    }
  }, [cleanupPeer, sendRaw]);

  const joinVoice = useCallback(async () => {
    setMicError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Браузер не поддерживает доступ к микрофону (требуется HTTPS или localhost).';
      setMicError(msg);
      onNotice(msg, 'warn');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setIsJoined(true);
      setIsMuted(false);
      isMutedRef.current = false;

      // Setup Web Audio AnalyserNode for real voice activity detection
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        analyserIntervalRef.current = window.setInterval(() => {
          if (isMutedRef.current) {
            setMicLevel(0);
            setIsSpeakingLocal(false);
            if (lastSpeakingSentRef.current) {
              lastSpeakingSentRef.current = false;
              sendRaw({ type: 'voice:state', isMuted: true, isSpeaking: false });
            }
            return;
          }

          analyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const val = (dataArray[i] - 128) / 128;
            sum += val * val;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const normalized = Math.min(1, rms * 6.5);
          setMicLevel(normalized);
          const speaking = rms > 0.025;
          setIsSpeakingLocal(speaking);

          if (speaking !== lastSpeakingSentRef.current) {
            lastSpeakingSentRef.current = speaking;
            sendRaw({ type: 'voice:state', isMuted: false, isSpeaking: speaking });
          }
        }, 120);
      } catch {
        // Fallback if AudioContext blocked
      }

      sendRaw({ type: 'voice:join' });

      // Initiate offers to all currently active voice peers
      for (const peer of participants) {
        if (peer.id !== selfId && peer.isVoiceActive) {
          const pc = createPeerConnection(peer.id);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendRaw({
            type: 'voice:signal',
            targetId: peer.id,
            signalType: 'offer',
            payload: offer,
          });
        }
      }
    } catch {
      const msg = 'Доступ к микрофону отклонён. Разрешите микрофон в настройках браузера.';
      setMicError(msg);
      onNotice(msg, 'warn');
    }
  }, [createPeerConnection, onNotice, participants, selfId, sendRaw]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMutedRef.current;
    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (nextMuted) {
      setIsSpeakingLocal(false);
      lastSpeakingSentRef.current = false;
    }
    sendRaw({ type: 'voice:state', isMuted: nextMuted, isSpeaking: false });
  }, [sendRaw]);

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setPeerVolumes((prev) => ({ ...prev, [peerId]: clamped }));
    const audio = audioElementsRef.current.get(peerId);
    if (audio) {
      audio.volume = clamped;
    }
  }, []);

  useEffect(() => {
    registerVoiceSignalHandler(async (ev) => {
      if (ev.type === 'voice:force-mute') {
        if (ev.isForceMuted) {
          if (localStreamRef.current) {
            for (const track of localStreamRef.current.getAudioTracks()) {
              track.enabled = false;
            }
          }
          setIsMuted(true);
          isMutedRef.current = true;
          setIsSpeakingLocal(false);
          onNotice('Администратор отключил ваш микрофон.', 'warn');
        } else {
          onNotice('Администратор разрешил вам включить микрофон.');
        }
        return;
      }

      if (ev.type === 'voice:peer-left' && ev.peerId) {
        cleanupPeer(ev.peerId);
        return;
      }

      if (ev.type === 'voice:peer-joined' && ev.peerId && isJoinedRef.current) {
        // The newly joined peer initiates offers to existing peers; we prepare connection
        createPeerConnection(ev.peerId);
        return;
      }

      if (ev.type === 'voice:signal' && ev.fromId && isJoinedRef.current) {
        const pc = createPeerConnection(ev.fromId);
        try {
          if (ev.signalType === 'offer' && ev.payload) {
            await pc.setRemoteDescription(new RTCSessionDescription(ev.payload as RTCSessionDescriptionInit));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendRaw({
              type: 'voice:signal',
              targetId: ev.fromId,
              signalType: 'answer',
              payload: answer,
            });
          } else if (ev.signalType === 'answer' && ev.payload) {
            await pc.setRemoteDescription(new RTCSessionDescription(ev.payload as RTCSessionDescriptionInit));
          } else if (ev.signalType === 'ice' && ev.payload) {
            await pc.addIceCandidate(new RTCIceCandidate(ev.payload as RTCIceCandidateInit));
          }
        } catch {
          // Ignore transient WebRTC state race
        }
      }
    });
  }, [cleanupPeer, createPeerConnection, onNotice, registerVoiceSignalHandler, sendRaw]);

  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [leaveVoice]);

  const anySpeaking = isSpeakingLocal || participants.some((p) => p.isSpeaking && p.id !== selfId);

  return {
    isJoined,
    isMuted,
    isDeafened,
    setIsDeafened,
    isSpeakingLocal,
    micLevel,
    micError,
    peerVolumes,
    anySpeaking,
    joinVoice,
    leaveVoice,
    toggleMute,
    setPeerVolume,
  };
}
