import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  STARTER_VIDEO,
  type ChatMessage,
  type Movie,
  type Participant,
  type PlaybackState,
  type RoomState,
  type UserRole,
  type VideoProvider,
} from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

const UPLOAD_DIR = path.join(os.tmpdir(), 'kinoroom-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const AVATAR_COLORS = [
  '#38BDF8',
  '#818CF8',
  '#34D399',
  '#F472B6',
  '#FB923C',
  '#A78BFA',
  '#2DD4BF',
  '#FBBF24',
];

interface UploadedMediaMeta {
  id: string;
  filePath: string;
  mimeType: string;
  size: number;
  title: string;
}

interface ConnectedClient {
  id: string;
  roomId: string | null;
  ws: WebSocket;
}

interface ServerRoom {
  roomId: string;
  title: string;
  adminToken: string;
  adminOnlyControl: boolean;
  playback: PlaybackState;
  movies: Movie[];
  participants: Map<string, Participant>;
  sockets: Map<string, WebSocket>;
  messages: ChatMessage[];
  cleanupTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, ServerRoom>();
const uploadedMedia = new Map<string, UploadedMediaMeta>();
const probePayload = crypto.randomBytes(64 * 1024);

// --- Zero-dependency standard ZIP (PKZIP Store + CRC32) builder ---
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipArchive(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = entry.data;
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8
    localHeader.writeUInt16LE(0, 8); // Store (no compression)
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function collectProjectFiles(baseDir: string, currentDir: string, out: { name: string; data: Buffer }[]): void {
  const skipDirs = new Set(['node_modules', 'dist', '.git', '.aistudio']);
  const items = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const item of items) {
    if (skipDirs.has(item.name)) continue;
    const fullPath = path.join(currentDir, item.name);
    const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    if (item.isDirectory()) {
      collectProjectFiles(baseDir, fullPath, out);
    } else if (item.isFile()) {
      out.push({ name: relPath, data: fs.readFileSync(fullPath) });
    }
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sanitizeAvatar(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 65000) return undefined;
  if (
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed) ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }
  return undefined;
}

function getOrCreateRoom(roomIdRaw: string, customTitle?: string): ServerRoom {
  const roomId = roomIdRaw.trim().toUpperCase().slice(0, 24) || 'KINO01';
  const existing = rooms.get(roomId);
  if (existing) {
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
      existing.cleanupTimer = null;
    }
    return existing;
  }

  const starter: Movie = {
    ...STARTER_VIDEO,
    sources: { ...STARTER_VIDEO.sources },
  };

  const newRoom: ServerRoom = {
    roomId,
    title: customTitle?.trim() || `Кинозал ${roomId}`,
    adminToken: crypto.randomBytes(16).toString('hex'),
    adminOnlyControl: false,
    playback: {
      movieId: starter.id,
      isPlaying: false,
      currentTime: 0,
      playbackRate: 1,
      updatedAt: Date.now(),
    },
    movies: [starter],
    participants: new Map(),
    sockets: new Map(),
    messages: [
      {
        id: crypto.randomUUID(),
        senderId: 'system',
        senderName: 'Kinoroom',
        senderRole: 'admin',
        text: 'Комната готова. Нажмите «Источник видео», чтобы вставить свою ссылку, файл, видео с YouTube или Google Диска.',
        timestamp: Date.now(),
        type: 'system',
      },
    ],
    cleanupTimer: null,
  };

  rooms.set(roomId, newRoom);
  return newRoom;
}

function getEffectivePlayback(playback: PlaybackState): PlaybackState {
  if (!playback.isPlaying) {
    return { ...playback };
  }
  const elapsedSec = Math.max(0, (Date.now() - playback.updatedAt) / 1000) * playback.playbackRate;
  return {
    ...playback,
    currentTime: playback.currentTime + elapsedSec,
    updatedAt: Date.now(),
  };
}

function serializeRoom(room: ServerRoom): RoomState {
  return {
    roomId: room.roomId,
    title: room.title,
    adminOnlyControl: room.adminOnlyControl,
    playback: getEffectivePlayback(room.playback),
    movies: room.movies,
    participants: Array.from(room.participants.values()),
    messages: room.messages,
  };
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: ServerRoom, payload: unknown, excludeId?: string): void {
  const encoded = JSON.stringify(payload);
  for (const [id, socket] of room.sockets.entries()) {
    if (excludeId && id === excludeId) continue;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(encoded);
    }
  }
}

function appendSystemMessage(room: ServerRoom, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    senderId: 'system',
    senderName: 'Система',
    senderRole: 'admin',
    text,
    timestamp: Date.now(),
    type: 'system',
  };
  room.messages.push(msg);
  if (room.messages.length > 150) {
    room.messages = room.messages.slice(-150);
  }
  broadcastRoom(room, { type: 'chat:message', message: msg });
  return msg;
}

function scheduleRoomCleanupIfEmpty(room: ServerRoom): void {
  if (room.participants.size > 0) return;
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    if (room.participants.size === 0) {
      rooms.delete(room.roomId);
    }
  }, 15 * 60 * 1000);
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    let connectionsCount = 0;
    for (const r of rooms.values()) {
      connectionsCount += r.sockets.size;
    }
    res.json({
      status: 'ok',
      service: 'kinoroom-watch-party',
      uptimeSeconds: Math.floor(process.uptime()),
      roomsCount: rooms.size,
      connectionsCount,
      nodeVersion: process.version,
      environment: IS_PROD ? 'production' : 'development',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/speed-probe', (_req, res) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Length', String(probePayload.byteLength));
    res.send(probePayload);
  });

  // Download full website source as a ready-to-push ZIP archive
  app.get('/api/export-project', (_req, res) => {
    try {
      const entries: { name: string; data: Buffer }[] = [];
      collectProjectFiles(__dirname, __dirname, entries);
      const zipBuf = buildZipArchive(entries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="kinoroom-site.zip"');
      res.setHeader('Content-Length', String(zipBuf.length));
      res.send(zipBuf);
    } catch (err) {
      res.status(500).json({ error: 'Не удалось собрать архив проекта' });
    }
  });

  // Upload a local video file (up to 120 MB) to stream synchronously to everyone in the room
  app.post('/api/upload-video', (req, res) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    const maxBytes = 120 * 1024 * 1024;
    if (contentLength > maxBytes) {
      res.status(413).json({ error: 'Файл слишком большой (максимум 120 МБ).' });
      return;
    }

    const mediaId = crypto.randomUUID().slice(0, 12);
    const rawNameHeader = req.headers['x-file-name'];
    let title = 'Загруженное видео';
    if (typeof rawNameHeader === 'string' && rawNameHeader) {
      try {
        title = decodeURIComponent(rawNameHeader).slice(0, 64);
      } catch {
        title = rawNameHeader.slice(0, 64);
      }
    }
    const mimeType =
      typeof req.headers['content-type'] === 'string' && req.headers['content-type'].startsWith('video/')
        ? req.headers['content-type']
        : 'video/mp4';

    const filePath = path.join(UPLOAD_DIR, `${mediaId}.bin`);
    const writeStream = fs.createWriteStream(filePath);
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        aborted = true;
        writeStream.destroy();
        fs.unlink(filePath, () => {});
        if (!res.headersSent) {
          res.status(413).json({ error: 'Превышен лимит 120 МБ.' });
        }
        req.destroy();
      }
    });

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      if (aborted) return;
      uploadedMedia.set(mediaId, {
        id: mediaId,
        filePath,
        mimeType,
        size: totalBytes,
        title,
      });
      res.status(201).json({
        mediaId,
        title,
        url: `/api/media/${mediaId}`,
        size: totalBytes,
      });
    });

    writeStream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Ошибка сохранения видеофайла.' });
      }
    });
  });

  // Stream uploaded video with HTTP Range support so seeking works cleanly
  app.get('/api/media/:mediaId', (req, res) => {
    const meta = uploadedMedia.get(req.params.mediaId);
    if (!meta || !fs.existsSync(meta.filePath)) {
      res.status(404).send('Media not found');
      return;
    }

    const range = req.headers.range;
    const fileSize = meta.size;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const clampedStart = Number.isFinite(start) ? Math.max(0, start) : 0;
      const clampedEnd = Number.isFinite(end) ? Math.min(fileSize - 1, end) : fileSize - 1;
      const chunkSize = clampedEnd - clampedStart + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${clampedStart}-${clampedEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': meta.mimeType,
      });
      fs.createReadStream(meta.filePath, { start: clampedStart, end: clampedEnd }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': meta.mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(meta.filePath).pipe(res);
    }
  });

  app.post('/api/rooms', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    let code = generateRoomCode();
    while (rooms.has(code)) {
      code = generateRoomCode();
    }
    const room = getOrCreateRoom(code, title);
    res.status(201).json({
      roomId: room.roomId,
      title: room.title,
      adminToken: room.adminToken,
    });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const roomId = req.params.roomId.trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      res.json({ exists: false, roomId });
      return;
    }
    res.json({
      exists: true,
      roomId: room.roomId,
      title: room.title,
      participantCount: room.participants.size,
      currentMovieId: room.playback.movieId,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const client: ConnectedClient = {
      id: crypto.randomUUID(),
      roomId: null,
      ws,
    };

    const removeFromCurrentRoom = (reason?: string) => {
      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) {
        client.roomId = null;
        return;
      }
      const leaving = room.participants.get(client.id);
      room.participants.delete(client.id);
      room.sockets.delete(client.id);

      if (leaving) {
        const hasAdmin = Array.from(room.participants.values()).some((p) => p.role === 'admin');
        if (!hasAdmin && room.participants.size > 0) {
          const nextHost = room.participants.values().next().value;
          if (nextHost) {
            nextHost.role = 'admin';
            const nextSocket = room.sockets.get(nextHost.id);
            if (nextSocket) {
              sendJson(nextSocket, { type: 'admin:granted', adminToken: room.adminToken });
            }
            appendSystemMessage(
              room,
              `${nextHost.name} автоматически назначен администратором комнаты.`
            );
          }
        }

        broadcastRoom(room, {
          type: 'room:participants',
          participants: Array.from(room.participants.values()),
        });
        broadcastRoom(room, {
          type: 'voice:peer-left',
          peerId: leaving.id,
        });
        if (!reason) {
          appendSystemMessage(room, `${leaving.name} покинул(а) комнату.`);
        }
      }

      scheduleRoomCleanupIfEmpty(room);
      client.roomId = null;
    };

    ws.on('message', (rawData) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(String(rawData));
      } catch {
        return;
      }

      const type = data.type;
      if (typeof type !== 'string') return;

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', ts: data.ts, serverTime: Date.now() });
        return;
      }

      if (type === 'room:join') {
        const roomId = typeof data.roomId === 'string' ? data.roomId : 'KINO01';
        const rawName = typeof data.name === 'string' ? data.name.trim() : '';
        const userName = rawName.slice(0, 28) || `Гость-${client.id.slice(0, 4).toUpperCase()}`;
        const userAvatar = sanitizeAvatar(data.avatar);
        const providedToken = typeof data.adminToken === 'string' ? data.adminToken : '';

        removeFromCurrentRoom('switched');
        const room = getOrCreateRoom(roomId);
        client.roomId = room.roomId;

        const isFirst = room.participants.size === 0;
        const tokenMatches = providedToken.length > 0 && providedToken === room.adminToken;
        const role: UserRole = isFirst || tokenMatches ? 'admin' : 'member';

        const participant: Participant = {
          id: client.id,
          name: userName,
          avatar: userAvatar,
          role,
          color: AVATAR_COLORS[room.participants.size % AVATAR_COLORS.length],
          isVoiceActive: false,
          isMuted: false,
          isForceMuted: false,
          isChatMuted: false,
          isSpeaking: false,
          joinedAt: Date.now(),
        };

        room.participants.set(client.id, participant);
        room.sockets.set(client.id, ws);

        sendJson(ws, {
          type: 'room:init',
          selfId: client.id,
          adminToken: role === 'admin' ? room.adminToken : undefined,
          room: serializeRoom(room),
        });

        broadcastRoom(
          room,
          {
            type: 'room:participants',
            participants: Array.from(room.participants.values()),
          },
          client.id
        );

        appendSystemMessage(
          room,
          `${participant.name} присоединился к просмотру${role === 'admin' ? ' (Админ)' : ''}.`
        );
        return;
      }

      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) return;
      const sender = room.participants.get(client.id);
      if (!sender) return;

      if (type === 'user:rename' || type === 'user:profile') {
        const newName = typeof data.name === 'string' ? data.name.trim().slice(0, 28) : '';
        const hasAvatarField = Object.prototype.hasOwnProperty.call(data, 'avatar');
        const nextAvatar = hasAvatarField ? sanitizeAvatar(data.avatar) : sender.avatar;

        const oldName = sender.name;
        const nameChanged = Boolean(newName && newName !== sender.name);
        if (nameChanged) {
          sender.name = newName;
        }
        if (hasAvatarField) {
          sender.avatar = nextAvatar;
        }

        broadcastRoom(room, {
          type: 'room:participants',
          participants: Array.from(room.participants.values()),
        });
        if (nameChanged) {
          appendSystemMessage(room, `${oldName} сменил(а) ник на ${sender.name}.`);
        }
        return;
      }

      if (type === 'player:heartbeat') {
        sendJson(ws, {
          type: 'player:state',
          playback: getEffectivePlayback(room.playback),
          actorId: 'heartbeat',
        });
        return;
      }

      if (type === 'player:sync') {
        if (room.adminOnlyControl && sender.role !== 'admin') {
          sendJson(ws, {
            type: 'notice',
            level: 'warn',
            text: 'Управление плеером разрешено только администратору комнаты.',
          });
          sendJson(ws, {
            type: 'player:state',
            playback: getEffectivePlayback(room.playback),
            actorId: 'revert',
          });
          return;
        }

        const action = typeof data.action === 'string' ? data.action : '';
        const currentTime =
          typeof data.currentTime === 'number' && Number.isFinite(data.currentTime)
            ? Math.max(0, data.currentTime)
            : getEffectivePlayback(room.playback).currentTime;

        if (action === 'play') {
          room.playback = {
            ...room.playback,
            isPlaying: true,
            currentTime,
            updatedAt: Date.now(),
          };
        } else if (action === 'pause') {
          room.playback = {
            ...room.playback,
            isPlaying: false,
            currentTime,
            updatedAt: Date.now(),
          };
        } else if (action === 'seek') {
          room.playback = {
            ...room.playback,
            currentTime,
            updatedAt: Date.now(),
          };
        } else if (action === 'rate') {
          const rate =
            typeof data.playbackRate === 'number' && data.playbackRate >= 0.5 && data.playbackRate <= 2
              ? data.playbackRate
              : 1;
          const effective = getEffectivePlayback(room.playback);
          room.playback = {
            ...effective,
            playbackRate: rate,
            updatedAt: Date.now(),
          };
        } else if (action === 'movie') {
          const customMovie = data.customMovie as Partial<Movie> | undefined;
          let targetMovieId = typeof data.movieId === 'string' ? data.movieId : '';

          if (customMovie && typeof customMovie.title === 'string' && customMovie.sources) {
            const url = customMovie.sources['1080p'];
            const provider: VideoProvider =
              customMovie.provider === 'youtube' ||
              customMovie.provider === 'gdrive' ||
              customMovie.provider === 'uploaded' ||
              customMovie.provider === 'direct'
                ? customMovie.provider
                : 'direct';

            const isValidUrl =
              typeof url === 'string' &&
              (/^https?:\/\//i.test(url) || url.startsWith('/api/media/'));

            if (isValidUrl) {
              const createdMovie: Movie = {
                id: `src-${crypto.randomUUID().slice(0, 8)}`,
                title: customMovie.title.trim().slice(0, 64) || 'Видеопоток',
                provider,
                externalId:
                  typeof customMovie.externalId === 'string'
                    ? customMovie.externalId.slice(0, 128)
                    : undefined,
                genre:
                  provider === 'youtube'
                    ? 'YouTube'
                    : provider === 'gdrive'
                    ? 'Google Диск'
                    : provider === 'uploaded'
                    ? 'Файл участника'
                    : 'Прямая ссылка',
                durationLabel: 'Поток',
                isCustom: true,
                sources: {
                  '1440p': url,
                  '1080p': url,
                  '720p': url,
                  '480p': url,
                  '360p': url,
                },
              };
              room.movies = [createdMovie, ...room.movies.filter((m) => m.id !== createdMovie.id)].slice(0, 12);
              targetMovieId = createdMovie.id;
              broadcastRoom(room, { type: 'room:movies', movies: room.movies });
            }
          }

          const found = room.movies.find((m) => m.id === targetMovieId);
          if (!found) return;
          room.playback = {
            movieId: found.id,
            isPlaying: false,
            currentTime: 0,
            playbackRate: 1,
            updatedAt: Date.now(),
          };
          appendSystemMessage(
            room,
            `${sender.name} включил(а) источник «${found.title}» (${found.genre}).`
          );
        }

        broadcastRoom(room, {
          type: 'player:state',
          playback: getEffectivePlayback(room.playback),
          actorId: sender.id,
          actorName: sender.name,
          action,
        });
        return;
      }

      if (type === 'chat:send') {
        if (sender.isChatMuted) {
          sendJson(ws, {
            type: 'notice',
            level: 'warn',
            text: 'Администратор ограничил вам отправку сообщений в чат.',
          });
          return;
        }
        const rawText = typeof data.text === 'string' ? data.text.trim() : '';
        if (!rawText) return;
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          senderId: sender.id,
          senderName: sender.name,
          senderAvatar: sender.avatar,
          senderRole: sender.role,
          text: rawText.slice(0, 600),
          timestamp: Date.now(),
          type: 'user',
        };
        room.messages.push(msg);
        if (room.messages.length > 150) {
          room.messages = room.messages.slice(-150);
        }
        broadcastRoom(room, { type: 'chat:message', message: msg });
        return;
      }

      if (type === 'reaction:send') {
        if (sender.isChatMuted) {
          sendJson(ws, {
            type: 'notice',
            level: 'warn',
            text: 'Администратор ограничил вам отправку сообщений и реакций.',
          });
          return;
        }
        const emoji = typeof data.emoji === 'string' ? data.emoji.slice(0, 8) : '';
        if (!emoji) return;
        broadcastRoom(room, {
          type: 'reaction:burst',
          reaction: {
            id: crypto.randomUUID(),
            emoji,
            senderName: sender.name,
            offsetX: 14 + Math.random() * 72,
            createdAt: Date.now(),
          },
        });
        return;
      }

      if (type === 'voice:join') {
        sender.isVoiceActive = true;
        sender.isMuted = sender.isForceMuted;
        sender.isSpeaking = false;
        broadcastRoom(room, {
          type: 'room:participants',
          participants: Array.from(room.participants.values()),
        });
        broadcastRoom(
          room,
          {
            type: 'voice:peer-joined',
            peerId: sender.id,
          },
          sender.id
        );
        return;
      }

      if (type === 'voice:leave') {
        sender.isVoiceActive = false;
        sender.isSpeaking = false;
        broadcastRoom(room, {
          type: 'room:participants',
          participants: Array.from(room.participants.values()),
        });
        broadcastRoom(
          room,
          {
            type: 'voice:peer-left',
            peerId: sender.id,
          },
          sender.id
        );
        return;
      }

      if (type === 'voice:state') {
        const isMuted = Boolean(data.isMuted);
        const isSpeaking = Boolean(data.isSpeaking);
        sender.isMuted = sender.isForceMuted ? true : isMuted;
        sender.isSpeaking = sender.isMuted ? false : isSpeaking;
        broadcastRoom(room, {
          type: 'voice:participant-update',
          participantId: sender.id,
          isMuted: sender.isMuted,
          isSpeaking: sender.isSpeaking,
        });
        return;
      }

      if (type === 'voice:signal') {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        const targetSocket = room.sockets.get(targetId);
        if (!targetSocket) return;
        sendJson(targetSocket, {
          type: 'voice:signal',
          fromId: sender.id,
          signalType: data.signalType,
          payload: data.payload,
        });
        return;
      }

      if (type === 'admin:action') {
        if (sender.role !== 'admin') {
          sendJson(ws, {
            type: 'notice',
            level: 'warn',
            text: 'Недостаточно прав: требуется роль администратора.',
          });
          return;
        }

        const actionType = typeof data.actionType === 'string' ? data.actionType : '';
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';

        if (actionType === 'toggle-lock') {
          room.adminOnlyControl = !room.adminOnlyControl;
          broadcastRoom(room, {
            type: 'room:settings',
            title: room.title,
            adminOnlyControl: room.adminOnlyControl,
          });
          appendSystemMessage(
            room,
            room.adminOnlyControl
              ? `${sender.name} ограничил(а) управление плеером только для администраторов.`
              : `${sender.name} открыл(а) управление плеером для всех участников.`
          );
          return;
        }

        if (actionType === 'update-title') {
          const nextTitle = typeof data.value === 'string' ? data.value.trim().slice(0, 48) : '';
          if (!nextTitle) return;
          room.title = nextTitle;
          broadcastRoom(room, {
            type: 'room:settings',
            title: room.title,
            adminOnlyControl: room.adminOnlyControl,
          });
          return;
        }

        const target = room.participants.get(targetId);
        if (!target) return;

        if (actionType === 'promote') {
          target.role = 'admin';
          const targetSocket = room.sockets.get(target.id);
          if (targetSocket) {
            sendJson(targetSocket, { type: 'admin:granted', adminToken: room.adminToken });
          }
          broadcastRoom(room, {
            type: 'room:participants',
            participants: Array.from(room.participants.values()),
          });
          appendSystemMessage(room, `${sender.name} назначил(а) ${target.name} администратором.`);
          return;
        }

        if (actionType === 'demote' && target.id !== sender.id) {
          target.role = 'member';
          broadcastRoom(room, {
            type: 'room:participants',
            participants: Array.from(room.participants.values()),
          });
          appendSystemMessage(room, `${sender.name} снял(а) права администратора с ${target.name}.`);
          return;
        }

        if (actionType === 'mute-user' && target.id !== sender.id) {
          target.isForceMuted = !target.isForceMuted;
          if (target.isForceMuted) {
            target.isMuted = true;
            target.isSpeaking = false;
          }
          const targetSocket = room.sockets.get(target.id);
          if (targetSocket) {
            sendJson(targetSocket, {
              type: 'voice:force-mute',
              isForceMuted: target.isForceMuted,
            });
          }
          broadcastRoom(room, {
            type: 'room:participants',
            participants: Array.from(room.participants.values()),
          });
          appendSystemMessage(
            room,
            target.isForceMuted
              ? `${sender.name} приглушил(а) голос участника ${target.name} для всей комнаты.`
              : `${sender.name} включил(а) голос участнику ${target.name}.`
          );
          return;
        }

        if (actionType === 'chat-ban' && target.id !== sender.id) {
          target.isChatMuted = !target.isChatMuted;
          const targetSocket = room.sockets.get(target.id);
          if (targetSocket) {
            sendJson(targetSocket, {
              type: 'notice',
              level: target.isChatMuted ? 'warn' : 'info',
              text: target.isChatMuted
                ? `Администратор ${sender.name} запретил вам писать в чат.`
                : `Администратор ${sender.name} разрешил вам писать в чат.`,
            });
          }
          broadcastRoom(room, {
            type: 'room:participants',
            participants: Array.from(room.participants.values()),
          });
          appendSystemMessage(
            room,
            target.isChatMuted
              ? `${sender.name} запретил(а) ${target.name} писать в чат.`
              : `${sender.name} снял(а) запрет на чат для ${target.name}.`
          );
          return;
        }

        if (actionType === 'kick-user' && target.id !== sender.id) {
          const targetSocket = room.sockets.get(target.id);
          if (targetSocket) {
            sendJson(targetSocket, {
              type: 'admin:kicked',
              reason: `Администратор ${sender.name} удалил(а) вас из комнаты.`,
            });
            targetSocket.close(4001, 'Kicked by admin');
          }
          room.participants.delete(target.id);
          room.sockets.delete(target.id);
          broadcastRoom(room, {
            type: 'room:participants',
            participants: Array.from(room.participants.values()),
          });
          appendSystemMessage(room, `${target.name} был(а) удалён(а) из комнаты.`);
          return;
        }
      }
    });

    ws.on('close', () => {
      removeFromCurrentRoom();
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`Kinoroom server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Kinoroom server:', err);
  process.exit(1);
});
