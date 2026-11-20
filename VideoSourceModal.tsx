import React, { useRef, useState } from 'react';
import {
  FileVideo,
  HardDrive,
  Link2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';

type SourceTab = 'link' | 'file' | 'youtube' | 'gdrive';

interface VideoSourceModalProps {
  isOpen: boolean;
  canControl: boolean;
  onClose: () => void;
  onSelectSource: (opts: {
    title: string;
    url: string;
    provider: 'direct' | 'youtube' | 'gdrive';
    externalId?: string;
  }) => void;
  onUploadFile: (file: File, onProgress: (pct: number) => void) => Promise<boolean>;
  onOpenLocalFile: (file: File) => void;
}

export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
      if (embedIdx !== -1 && parts[embedIdx + 1]) {
        return /^[a-zA-Z0-9_-]{11}$/.test(parts[embedIdx + 1]) ? parts[embedIdx + 1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractGoogleDriveId(input: string): string | null {
  const trimmed = input.trim();
  const matchPath = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchPath?.[1]) return matchPath[1];
  try {
    const u = new URL(trimmed);
    const id = u.searchParams.get('id');
    if (id && /^[a-zA-Z0-9_-]{10,}$/.test(id)) return id;
  } catch {
    return null;
  }
  return null;
}

export const VideoSourceModal: React.FC<VideoSourceModalProps> = ({
  isOpen,
  canControl,
  onClose,
  onSelectSource,
  onUploadFile,
  onOpenLocalFile,
}) => {
  const [tab, setTab] = useState<SourceTab>('link');
  const [directTitle, setDirectTitle] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [gdriveTitle, setGdriveTitle] = useState('');
  const [gdriveUrl, setGdriveUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const url = directUrl.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      setErrorMsg('Введите корректную ссылку, начинающуюся с https:// или http://');
      return;
    }
    onSelectSource({
      title: directTitle.trim() || 'Видео по ссылке',
      url,
      provider: 'direct',
    });
    onClose();
  };

  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const ytId = extractYouTubeId(youtubeUrl);
    if (!ytId) {
      setErrorMsg('Не удалось распознать ссылку YouTube. Пример: https://www.youtube.com/watch?v=...');
      return;
    }
    onSelectSource({
      title: youtubeTitle.trim() || `YouTube (${ytId})`,
      url: `https://www.youtube.com/watch?v=${ytId}`,
      provider: 'youtube',
      externalId: ytId,
    });
    onClose();
  };

  const handleGdriveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const fileId = extractGoogleDriveId(gdriveUrl);
    if (!fileId) {
      setErrorMsg('Не удалось распознать ссылку Google Диска. Убедитесь, что открыт доступ по ссылке.');
      return;
    }
    onSelectSource({
      title: gdriveTitle.trim() || 'Видео с Google Диска',
      url: `https://drive.google.com/file/d/${fileId}/preview`,
      provider: 'gdrive',
      externalId: fileId,
    });
    onClose();
  };

  const handleUploadToRoom = async () => {
    if (!selectedFile) return;
    setErrorMsg(null);
    setUploadProgress(1);
    const ok = await onUploadFile(selectedFile, (pct) => setUploadProgress(pct));
    setUploadProgress(null);
    if (ok) {
      setSelectedFile(null);
      onClose();
    } else {
      setErrorMsg('Не удалось загрузить файл. Проверьте размер (до 120 МБ) и формат видео.');
    }
  };

  const handleOpenLocally = () => {
    if (!selectedFile) return;
    onOpenLocalFile(selectedFile);
    setSelectedFile(null);
    onClose();
  };

  const tabs: { id: SourceTab; label: string; icon: React.ReactNode }[] = [
    { id: 'link', label: 'Своя ссылка', icon: <Link2 className="h-3.5 w-3.5" /> },
    { id: 'file', label: 'Из файлов', icon: <FileVideo className="h-3.5 w-3.5" /> },
    { id: 'youtube', label: 'YouTube', icon: <Youtube className="h-3.5 w-3.5" /> },
    { id: 'gdrive', label: 'Google Диск', icon: <HardDrive className="h-3.5 w-3.5" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-modal-title"
    >
      <div className="liquid-glass-elevated w-full max-w-xl rounded-3xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="source-modal-title"
              className="font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              Выбор источника видео
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Вставьте прямую ссылку, загрузите файл с устройства или выберите видео с YouTube / Google Диска.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть выбор источника"
            className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-900/8 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!canControl && (
          <div className="rounded-2xl bg-amber-500/12 border border-amber-500/25 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            Сейчас включён режим «Только админ управляет плеером». Вы можете открыть файл только локально у себя, либо попросите администратора сменить источник для всей комнаты.
          </div>
        )}

        {/* Source Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-900/5 dark:bg-white/6">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: Direct URL */}
        {tab === 'link' && (
          <form onSubmit={handleDirectSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Название (необязательно)
              </label>
              <input
                type="text"
                value={directTitle}
                onChange={(e) => setDirectTitle(e.target.value)}
                placeholder="Например: Вечерний фильм"
                maxLength={64}
                className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Прямая ссылка на видео (.mp4, .webm)
              </label>
              <input
                type="url"
                required
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}
            <button
              type="submit"
              disabled={!canControl}
              className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-45 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Запустить для всей комнаты
            </button>
          </form>
        )}

        {/* Tab 2: Local File */}
        {tab === 'file' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
                setErrorMsg(null);
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-2xl border border-dashed border-slate-900/20 dark:border-white/20 hover:border-sky-500/60 bg-slate-900/3 dark:bg-white/3 p-6 flex flex-col items-center gap-2 text-center transition-colors cursor-pointer"
            >
              <Upload className="h-7 w-7 text-sky-500" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {selectedFile ? selectedFile.name : 'Нажмите, чтобы выбрать видеофайл с устройства'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {selectedFile
                  ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} МБ · ${selectedFile.type || 'video'}`
                  : 'MP4, WebM, MOV · до 120 МБ для общего просмотра в комнате'}
              </div>
            </button>

            {uploadProgress !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>Загрузка видео на сервер комнаты...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-900/10 dark:bg-white/10 overflow-hidden">
                  <div
                    style={{ width: `${uploadProgress}%` }}
                    className="h-full bg-sky-500 transition-all duration-150"
                  />
                </div>
              </div>
            )}

            {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={!selectedFile || !canControl || uploadProgress !== null}
                onClick={handleUploadToRoom}
                className="rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-45 px-4 py-2.5 text-xs font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Загрузить в комнату (для всех)
              </button>
              <button
                type="button"
                disabled={!selectedFile || uploadProgress !== null}
                onClick={handleOpenLocally}
                className="rounded-xl liquid-glass-subtle hover:bg-white/80 dark:hover:bg-white/10 disabled:opacity-45 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Открыть только у себя
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: YouTube */}
        {tab === 'youtube' && (
          <form onSubmit={handleYoutubeSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Название (необязательно)
              </label>
              <input
                type="text"
                value={youtubeTitle}
                onChange={(e) => setYoutubeTitle(e.target.value)}
                placeholder="Например: Обзор / Подкаст / Фильм"
                maxLength={64}
                className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ссылка на видео с YouTube
              </label>
              <input
                type="text"
                required
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... или https://youtu.be/..."
                className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}
            <button
              type="submit"
              disabled={!canControl}
              className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-45 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Включить видео с YouTube для всех
            </button>
          </form>
        )}

        {/* Tab 4: Google Drive */}
        {tab === 'gdrive' && (
          <form onSubmit={handleGdriveSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Название (необязательно)
              </label>
              <input
                type="text"
                value={gdriveTitle}
                onChange={(e) => setGdriveTitle(e.target.value)}
                placeholder="Например: Архив с Google Диска"
                maxLength={64}
                className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ссылка на файл в Google Диске (доступ по ссылке)
              </label>
              <input
                type="url"
                required
                value={gdriveUrl}
                onChange={(e) => setGdriveUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/.../view"
                className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Откройте доступ «Все, у кого есть ссылка» в настройках файла на Google Диске, чтобы видео открывалось у всех друзей.
            </p>
            {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}
            <button
              type="submit"
              disabled={!canControl}
              className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-45 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Открыть с Google Диска для всех
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
