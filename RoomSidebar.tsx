import React, { useEffect, useRef, useState } from 'react';
import {
  Crown,
  Headphones,
  Lock,
  MessageSquare,
  MessageSquareOff,
  Mic,
  MicOff,
  Pencil,
  PhoneOff,
  Send,
  Shield,
  ShieldOff,
  Unlock,
  UserX,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ChatMessage, Participant } from '../types';

export type SidebarTab = 'chat' | 'voice' | 'admin';

interface VoiceControlsProps {
  isJoined: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeakingLocal: boolean;
  micLevel: number;
  micError: string | null;
  peerVolumes: Record<string, number>;
  autoDuck: boolean;
  onToggleAutoDuck: () => void;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onSetPeerVolume: (peerId: string, vol: number) => void;
}

interface RoomSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  selfId: string | null;
  isAdmin: boolean;
  isChatMuted: boolean;
  roomTitle: string;
  adminOnlyControl: boolean;
  participants: Participant[];
  messages: ChatMessage[];
  onSendChat: (text: string) => void;
  onOpenProfile: () => void;
  onAdminAction: (
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
  ) => void;
  voice: VoiceControlsProps;
}

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const RoomSidebar: React.FC<RoomSidebarProps> = ({
  activeTab,
  onTabChange,
  selfId,
  isAdmin,
  isChatMuted,
  roomTitle,
  adminOnlyControl,
  participants,
  messages,
  onSendChat,
  onOpenProfile,
  onAdminAction,
  voice,
}) => {
  const [chatInput, setChatInput] = useState('');
  const [editingTitle, setEditingTitle] = useState(roomTitle);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditingTitle(roomTitle);
  }, [roomTitle]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeTab]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput);
    setChatInput('');
  };

  const voiceParticipantsCount = participants.filter((p) => p.isVoiceActive).length;

  return (
    <aside className="liquid-glass rounded-3xl flex flex-col h-[580px] lg:h-[640px] overflow-hidden">
      {/* Segmented Navigation Tabs */}
      <div className="p-2.5 border-b border-slate-900/8 dark:border-white/10">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-900/5 dark:bg-white/5">
          <button
            type="button"
            onClick={() => onTabChange('chat')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Чат</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('voice')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Headphones className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Голос</span>
            <span className="tabular-nums opacity-70">({voiceParticipantsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('admin')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isAdmin ? (
              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            ) : (
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{isAdmin ? 'Админ' : `Люди (${participants.length})`}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: REAL-TIME CHAT */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => {
              if (msg.type === 'system') {
                return (
                  <div
                    key={msg.id}
                    className="py-1 text-center text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    {msg.text}
                  </div>
                );
              }
              const isSelf = msg.senderId === selfId;
              const liveSender = participants.find((p) => p.id === msg.senderId);
              const avatarSrc = liveSender?.avatar ?? msg.senderAvatar;
              const fallbackColor = liveSender?.color ?? '#38BDF8';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-1 px-1">
                    {!isSelf && (
                      <div
                        style={{ backgroundColor: fallbackColor }}
                        className="h-4 w-4 rounded-full overflow-hidden flex items-center justify-center text-[9px] font-bold text-slate-950 shrink-0"
                      >
                        {avatarSrc ? (
                          <img
                            src={avatarSrc}
                            alt={msg.senderName}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          msg.senderName.slice(0, 1).toUpperCase()
                        )}
                      </div>
                    )}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {msg.senderName}
                    </span>
                    {msg.senderRole === 'admin' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Админ
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatMessageTime(msg.timestamp)}
                    </span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${
                      isSelf
                        ? 'bg-sky-500 text-white rounded-br-md'
                        : 'liquid-glass-subtle text-slate-800 dark:text-slate-100 rounded-bl-md'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleChatSubmit}
            className="p-3 border-t border-slate-900/8 dark:border-white/10 flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              disabled={isChatMuted}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                isChatMuted
                  ? 'Администратор запретил вам писать в чат'
                  : 'Написать в чат комнаты...'
              }
              maxLength={600}
              className="flex-1 min-w-0 rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-55 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isChatMuted || !chatInput.trim()}
              aria-label="Отправить сообщение"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: VOICE DISCUSSION (WebRTC) */}
      {activeTab === 'voice' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto">
          {/* Voice Connection Box */}
          <div className="liquid-glass-subtle rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Голосовой канал
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {voice.isJoined
                    ? 'Вы в голосовом чате · WebRTC P2P'
                    : 'Общайтесь с друзьями прямо во время просмотра'}
                </p>
              </div>
              {voice.isJoined && (
                <div className="flex items-center gap-1 h-5" aria-label="Уровень микрофона">
                  {[0.25, 0.5, 0.75, 1].map((threshold, idx) => (
                    <span
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        voice.micLevel >= threshold && !voice.isMuted
                          ? 'bg-emerald-500 h-4'
                          : 'bg-slate-400/40 h-1.5'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {voice.micError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
                {voice.micError}
              </p>
            )}

            {!voice.isJoined ? (
              <button
                type="button"
                onClick={voice.onJoinVoice}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                <Mic className="h-4 w-4" />
                <span>Войти в голосовое обсуждение</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={voice.onToggleMute}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-semibold transition-colors cursor-pointer ${
                    voice.isMuted
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                      : 'bg-slate-900/8 dark:bg-white/10 text-slate-800 dark:text-white'
                  }`}
                >
                  {voice.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span>{voice.isMuted ? 'Выкл' : 'Микро'}</span>
                </button>

                <button
                  type="button"
                  onClick={voice.onToggleDeafen}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-semibold transition-colors cursor-pointer ${
                    voice.isDeafened
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      : 'bg-slate-900/8 dark:bg-white/10 text-slate-800 dark:text-white'
                  }`}
                >
                  {voice.isDeafened ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  <span>{voice.isDeafened ? 'Без звука' : 'Звук'}</span>
                </button>

                <button
                  type="button"
                  onClick={voice.onLeaveVoice}
                  className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>Выйти</span>
                </button>
              </div>
            )}

            <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Приглушать фильм при разговоре
              </span>
              <input
                type="checkbox"
                checked={voice.autoDuck}
                onChange={voice.onToggleAutoDuck}
                className="h-4 w-4 accent-sky-500 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Active Voice Peers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Участники в голосе ({voiceParticipantsCount})
              </h4>
            </div>

            {voiceParticipantsCount === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Пока никто не подключил микрофон. Нажмите кнопку выше, чтобы начать обсуждение.
              </div>
            ) : (
              <div className="divide-y divide-slate-900/8 dark:divide-white/8">
                {participants
                  .filter((p) => p.isVoiceActive)
                  .map((p) => {
                    const isSelf = p.id === selfId;
                    const speaking = isSelf ? voice.isSpeakingLocal : p.isSpeaking;
                    const muted = isSelf ? voice.isMuted : p.isMuted;
                    const vol = voice.peerVolumes[p.id] ?? 1;

                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            style={{ backgroundColor: p.color }}
                            className={`h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-slate-950 shrink-0 transition-transform duration-150 ${
                              speaking ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-slate-900 scale-105' : ''
                            }`}
                          >
                            {p.avatar ? (
                              <img
                                src={p.avatar}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              p.name.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {p.name} {isSelf && '(Вы)'}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {muted ? 'Микрофон выкл.' : speaking ? 'Говорит' : 'Слушает'}
                            </div>
                          </div>
                        </div>

                        {!isSelf && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Volume2 className="h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={vol}
                              onChange={(e) => voice.onSetPeerVolume(p.id, Number(e.target.value))}
                              aria-label={`Громкость ${p.name}`}
                              className="w-16 h-1 accent-sky-500 cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ADMIN & PARTICIPANTS */}
      {activeTab === 'admin' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isAdmin ? (
            <div className="liquid-glass-subtle rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Панель администратора
                </span>
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  Полный доступ
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  maxLength={48}
                  aria-label="Название комнаты"
                  className="flex-1 min-w-0 rounded-xl bg-slate-900/5 dark:bg-white/6 border border-slate-900/10 dark:border-white/10 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => onAdminAction('update-title', undefined, editingTitle)}
                  className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Сохранить
                </button>
              </div>

              <button
                type="button"
                onClick={() => onAdminAction('toggle-lock')}
                className="w-full flex items-center justify-between rounded-xl bg-slate-900/5 dark:bg-white/6 hover:bg-slate-900/10 dark:hover:bg-white/10 px-3 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {adminOnlyControl ? (
                    <Lock className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  <span>Только админ управляет плеером</span>
                </span>
                <span className="font-semibold text-sky-600 dark:text-sky-400">
                  {adminOnlyControl ? 'Вкл' : 'Выкл'}
                </span>
              </button>
            </div>
          ) : (
            <div className="liquid-glass-subtle rounded-2xl p-3.5 text-xs text-slate-600 dark:text-slate-300">
              {adminOnlyControl
                ? 'Управление воспроизведением сейчас закреплено за администратором комнаты.'
                : 'Свободный режим: любой участник может ставить паузу, перематывать и выбирать фильм.'}
            </div>
          )}

          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1 mb-2">
              Участники комнаты ({participants.length})
            </h4>

            <div className="divide-y divide-slate-900/8 dark:divide-white/8">
              {participants.map((p) => {
                const isSelf = p.id === selfId;
                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        style={{ backgroundColor: p.color }}
                        className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                      >
                        {p.avatar ? (
                          <img
                            src={p.avatar}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          p.name.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {p.name} {isSelf && '(Вы)'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.role === 'admin' ? 'Админ' : 'Зритель'}
                          {p.isVoiceActive ? ' · в голосе' : ''}
                          {p.isForceMuted ? ' · голос заглушен' : ''}
                          {p.isChatMuted ? ' · чат запрещён' : ''}
                        </div>
                      </div>
                    </div>

                    {isSelf && (
                      <button
                        type="button"
                        onClick={onOpenProfile}
                        className="inline-flex items-center gap-1.5 rounded-xl liquid-glass-subtle hover:bg-white/80 dark:hover:bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Pencil className="h-3 w-3 text-sky-500" aria-hidden="true" />
                        <span>Ник и аватарка</span>
                      </button>
                    )}

                    {isAdmin && !isSelf && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onAdminAction('mute-user', p.id)}
                          title={
                            p.isForceMuted
                              ? 'Включить голос участнику'
                              : 'Приглушить голос участника у всех'
                          }
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-900/8 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          {p.isForceMuted ? (
                            <MicOff className="h-3.5 w-3.5 text-rose-500" />
                          ) : (
                            <Mic className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onAdminAction('chat-ban', p.id)}
                          title={
                            p.isChatMuted
                              ? 'Разрешить писать в чат'
                              : 'Запретить писать в чат'
                          }
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-900/8 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          {p.isChatMuted ? (
                            <MessageSquareOff className="h-3.5 w-3.5 text-rose-500" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onAdminAction(p.role === 'admin' ? 'demote' : 'promote', p.id)
                          }
                          title={
                            p.role === 'admin'
                              ? 'Снять права администратора'
                              : 'Назначить администратором'
                          }
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-900/8 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          {p.role === 'admin' ? (
                            <ShieldOff className="h-3.5 w-3.5 text-amber-500" />
                          ) : (
                            <Shield className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onAdminAction('kick-user', p.id)}
                          title="Удалить из комнаты"
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-rose-500/15 text-rose-500 cursor-pointer"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
