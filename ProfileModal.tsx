import React, { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, User, X } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  currentName: string;
  currentAvatar?: string;
  onClose: () => void;
  onSave: (name: string, avatar: string | null) => void;
}

async function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 144;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/webp', 0.82));
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  currentName,
  currentAvatar,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(currentName);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(currentAvatar ?? null);
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setAvatarPreview(currentAvatar ?? null);
      setAvatarUrlInput(
        currentAvatar && currentAvatar.startsWith('http') ? currentAvatar : ''
      );
      setErrorMsg(null);
    }
  }, [isOpen, currentName, currentAvatar]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const dataUrl = await compressAvatarFile(file);
      setAvatarPreview(dataUrl);
      setAvatarUrlInput('');
    } catch {
      setErrorMsg('Не удалось обработать изображение. Выберите JPG, PNG или WebP.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) {
      setErrorMsg('Введите никнейм.');
      return;
    }
    let finalAvatar = avatarPreview;
    if (avatarUrlInput.trim()) {
      if (!/^https?:\/\/.+/i.test(avatarUrlInput.trim())) {
        setErrorMsg('Ссылка на аватарку должна начинаться с https:// или http://');
        return;
      }
      finalAvatar = avatarUrlInput.trim();
    }
    onSave(cleaned, finalAvatar);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="liquid-glass-elevated w-full max-w-md rounded-3xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="profile-modal-title"
              className="font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              Ваш профиль
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Задайте никнейм и поставьте свою аватарку — её увидят все друзья в комнате.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки профиля"
            className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-900/8 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar Upload & Preview */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 rounded-full overflow-hidden bg-sky-500/20 border border-slate-900/15 dark:border-white/15 flex items-center justify-center shrink-0">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={name || 'Аватар'}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-7 w-7 text-sky-500" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900/8 dark:bg-white/10 hover:bg-slate-900/15 dark:hover:bg-white/15 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white transition-colors cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5 text-sky-500" />
                <span>Загрузить фото</span>
              </button>

              {avatarPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPreview(null);
                    setAvatarUrlInput('');
                  }}
                  className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Убрать</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Никнейм
            </label>
            <input
              type="text"
              required
              maxLength={28}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите ваш ник"
              className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Или ссылка на картинку для аватарки (необязательно)
            </label>
            <input
              type="url"
              value={avatarUrlInput}
              onChange={(e) => {
                setAvatarUrlInput(e.target.value);
                if (e.target.value.trim()) setAvatarPreview(e.target.value.trim());
              }}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-900/6 dark:hover:bg-white/8 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="rounded-xl bg-sky-500 hover:bg-sky-400 px-5 py-2.5 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Сохранить профиль
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
