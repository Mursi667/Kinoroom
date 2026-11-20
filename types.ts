export type QualityTier = 'auto' | '1440p' | '1080p' | '720p' | '480p' | '360p';

export type ResolvedQuality = '1440p' | '1080p' | '720p' | '480p' | '360p';

export type UserRole = 'admin' | 'member';

export type VideoProvider = 'direct' | 'youtube' | 'gdrive' | 'uploaded' | 'local';

export interface MovieSourceMap {
  '1440p': string;
  '1080p': string;
  '720p': string;
  '480p': string;
  '360p': string;
}

export interface Movie {
  id: string;
  title: string;
  provider: VideoProvider;
  externalId?: string;
  genre: string;
  durationLabel: string;
  sources: MovieSourceMap;
  isCustom?: boolean;
}

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
  role: UserRole;
  color: string;
  isVoiceActive: boolean;
  isMuted: boolean;
  isForceMuted: boolean;
  isChatMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderRole: UserRole;
  text: string;
  timestamp: number;
  type: 'user' | 'system';
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  offsetX: number;
  createdAt: number;
}

export interface PlaybackState {
  movieId: string;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
}

export interface RoomState {
  roomId: string;
  title: string;
  adminOnlyControl: boolean;
  playback: PlaybackState;
  movies: Movie[];
  participants: Participant[];
  messages: ChatMessage[];
}

export const STARTER_VIDEO: Movie = {
  id: 'sintel-starter',
  title: 'Синтел (демо-поток)',
  provider: 'direct',
  genre: 'MP4-поток',
  durationLabel: '14 мин',
  sources: {
    '1440p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    '1080p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    '720p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    '480p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    '360p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
};
