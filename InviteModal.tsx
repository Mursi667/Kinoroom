import React, { useState } from 'react';
import { Check, Copy, Link2, PlusCircle, X } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  roomId: string;
  roomTitle: string;
  onClose: () => void;
  onJoinByCode: (code: string) => void;
  onCreateNewRoom: (title?: string) => Promise<string | null>;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  roomId,
  roomTitle,
  onClose,
  onJoinByCode,
  onCreateNewRoom,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;

  const copyText = async (text: string, which: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'link') {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinByCode(joinCode);
    setJoinCode('');
    onClose();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    await onCreateNewRoom(newRoomTitle.trim() || undefined);
    setIsCreating(false);
    setNewRoomTitle('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      <div className="liquid-glass-elevated w-full max-w-lg rounded-3xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="invite-modal-title"
              className="font-display text-xl font-bold text-slate-900 dark:text-white"
            >
              Приглашение в кинозал
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {roomTitle} · Отправьте ссылку друзьям для мгновенного подключения
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно приглашения"
            className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-900/8 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shareable Invite Link */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Прямая ссылка на комнату
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3 py-2.5">
              <Link2 className="h-4 w-4 text-sky-500 shrink-0" />
              <input
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.target.select()}
                className="w-full bg-transparent text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => copyText(inviteUrl, 'link')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copiedLink ? 'Скопировано' : 'Копировать'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Код комнаты:{' '}
              <strong className="font-mono text-slate-900 dark:text-white tracking-wider">
                {roomId}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => copyText(roomId, 'code')}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              {copiedCode ? 'Код скопирован' : 'Копировать код'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-900/8 dark:border-white/10 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Join existing room */}
          <form onSubmit={handleJoin} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Войти по коду комнаты
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="KINO01"
                maxLength={24}
                className="flex-1 min-w-0 rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-3 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Войти
              </button>
            </div>
          </form>

          {/* Create new room */}
          <form onSubmit={handleCreate} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Создать новую (стать Админом)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRoomTitle}
                onChange={(e) => setNewRoomTitle(e.target.value)}
                placeholder="Вечер кино"
                maxLength={48}
                className="flex-1 min-w-0 rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-semibold text-white whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Создать</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
