import React, { useEffect, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import {
  Check,
  Copy,
  Crown,
  Moon,
  Pencil,
  Radio,
  Sun,
  Users,
} from 'lucide-react';
import { Header, type NavSection } from './components/Header';
import { InviteModal } from './components/InviteModal';
import { ProfileModal } from './components/ProfileModal';
import { RoomSidebar, type SidebarTab } from './components/RoomSidebar';
import { VideoSourceModal } from './components/VideoSourceModal';
import { VideoStage } from './components/VideoStage';
import { useVoiceChat } from './hooks/useVoiceChat';
import { useWatchParty } from './hooks/useWatchParty';

type ThemeMode = 'dark' | 'light';

function getInitialTheme(): ThemeMode {
  const saved = localStorage.getItem('kinoroom_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [activeNav, setActiveNav] = useState<NavSection>('cinema');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [autoDuck, setAutoDuck] = useState(true);
  const [copiedQuickCode, setCopiedQuickCode] = useState(false);

  const party = useWatchParty();

  const voice = useVoiceChat({
    selfId: party.selfId,
    participants: party.room?.participants ?? [],
    sendRaw: party.sendRaw,
    registerVoiceSignalHandler: party.registerVoiceSignalHandler,
    onNotice: party.showNotice,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('kinoroom_theme', theme);
  }, [theme]);

  const handleNavigate = (section: NavSection) => {
    setActiveNav(section);
    if (section === 'cinema') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (section === 'participants') {
      setSidebarTab('admin');
    }
  };

  const copyQuickInvite = async () => {
    const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(party.roomId)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedQuickCode(true);
      window.setTimeout(() => setCopiedQuickCode(false), 1800);
    } catch {
      setIsInviteOpen(true);
    }
  };

  const canControlPlayer = !party.room?.adminOnlyControl || party.isAdmin;
  const participantsCount = party.room?.participants.length ?? 1;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen text-slate-900 dark:text-slate-100 transition-colors duration-200 flex flex-col">
        <Header
          activeSection={activeNav}
          onNavigate={handleNavigate}
          onOpenInvite={() => setIsInviteOpen(true)}
        />

        <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 pt-5 pb-12 space-y-5">
          {/* Workspace Control Bar */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="liquid-glass rounded-2xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                  {party.room?.title ?? `Кинозал ${party.roomId}`}
                </h1>
              </div>

              <button
                type="button"
                onClick={copyQuickInvite}
                title="Скопировать ссылку-приглашение"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <span>Комната {party.roomId}</span>
                {copiedQuickCode ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 opacity-75" />
                )}
              </button>

              <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>

              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                <Radio
                  className={`h-3.5 w-3.5 ${
                    party.connectionStatus === 'connected'
                      ? 'text-emerald-500'
                      : 'text-amber-500'
                  }`}
                  aria-hidden="true"
                />
                <span>
                  {party.connectionStatus === 'connected'
                    ? `Синхронизация · ${party.rttMs} мс`
                    : 'Переподключение...'}
                </span>
              </div>

              <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>

              {/* Participants + User Avatar & Nickname right next to it */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSidebarTab('admin')}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white tabular-nums cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{participantsCount} в зале</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsProfileOpen(true)}
                  title="Настроить ник и аватарку"
                  className="inline-flex items-center gap-2 rounded-xl liquid-glass-subtle pl-1.5 pr-3 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-white/75 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <span className="h-6 w-6 rounded-full overflow-hidden bg-sky-500/25 flex items-center justify-center text-[11px] font-bold text-slate-900 dark:text-white shrink-0">
                    {party.userAvatar ? (
                      <img
                        src={party.userAvatar}
                        alt={party.userName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      party.userName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  {party.isAdmin && (
                    <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                  )}
                  <span className="max-w-[120px] truncate">{party.userName}</span>
                  <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                    · Ник и аватарка
                  </span>
                  <Pencil className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Right Toolbar: Theme Switch */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
                title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                className="flex h-9 w-9 items-center justify-center rounded-xl liquid-glass-subtle text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4 text-slate-700" />
                )}
              </button>
            </div>
          </motion.section>

          {/* Main 2-Column Theater & Real-time Lounge */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_400px] gap-5 items-start"
          >
            <VideoStage
              movie={party.currentMovie}
              playback={party.room?.playback ?? null}
              canControl={canControlPlayer}
              adminOnlyControl={Boolean(party.room?.adminOnlyControl)}
              qualityMode={party.qualityMode}
              resolvedQuality={party.resolvedQuality}
              networkMbps={party.networkMbps}
              onChangeQuality={party.setQualityMode}
              onMeasureSpeed={party.measureSpeed}
              onPlay={party.sendPlay}
              onPause={party.sendPause}
              onSeek={party.sendSeek}
              onRateChange={party.sendRate}
              onOpenSourceModal={() => setIsSourceOpen(true)}
              reactions={party.reactions}
              onSendReaction={party.sendReaction}
              autoDuckActive={autoDuck && voice.isJoined}
              anySpeaking={voice.anySpeaking}
            />

            <RoomSidebar
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              selfId={party.selfId}
              isAdmin={party.isAdmin}
              isChatMuted={party.isChatMuted}
              roomTitle={party.room?.title ?? `Кинозал ${party.roomId}`}
              adminOnlyControl={Boolean(party.room?.adminOnlyControl)}
              participants={party.room?.participants ?? []}
              messages={party.room?.messages ?? []}
              onSendChat={party.sendChat}
              onOpenProfile={() => setIsProfileOpen(true)}
              onAdminAction={party.sendAdminAction}
              voice={{
                isJoined: voice.isJoined,
                isMuted: voice.isMuted,
                isDeafened: voice.isDeafened,
                isSpeakingLocal: voice.isSpeakingLocal,
                micLevel: voice.micLevel,
                micError: voice.micError,
                peerVolumes: voice.peerVolumes,
                autoDuck,
                onToggleAutoDuck: () => setAutoDuck((v) => !v),
                onJoinVoice: voice.joinVoice,
                onLeaveVoice: voice.leaveVoice,
                onToggleMute: voice.toggleMute,
                onToggleDeafen: () => voice.setIsDeafened((d) => !d),
                onSetPeerVolume: voice.setPeerVolume,
              }}
            />
          </motion.section>
        </main>

        <footer className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-6 border-t border-slate-900/8 dark:border-white/8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>Kinoroom · Синхронный кинозал с голосовым чатом</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Пригласить по ссылке
            </button>
          </div>
        </footer>

        {/* Live Notice Toast */}
        {party.notice && (
          <div
            role="status"
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 liquid-glass-elevated rounded-2xl px-4 py-2.5 text-xs font-medium text-slate-900 dark:text-white shadow-xl"
          >
            {party.notice.text}
          </div>
        )}

        {/* Kicked Overlay */}
        {party.kickedReason && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
            <div className="liquid-glass-elevated max-w-md w-full rounded-3xl p-6 text-center space-y-4">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Доступ к комнате завершён
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">{party.kickedReason}</p>
              <button
                type="button"
                onClick={() => party.createNewRoom('Новый кинозал')}
                className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                Создать свою комнату
              </button>
            </div>
          </div>
        )}

        <VideoSourceModal
          isOpen={isSourceOpen}
          canControl={canControlPlayer}
          onClose={() => setIsSourceOpen(false)}
          onSelectSource={party.setVideoSource}
          onUploadFile={party.uploadVideoFile}
          onOpenLocalFile={party.openLocalFileOnly}
        />

        <ProfileModal
          isOpen={isProfileOpen}
          currentName={party.userName}
          currentAvatar={party.userAvatar}
          onClose={() => setIsProfileOpen(false)}
          onSave={party.updateProfile}
        />

        <InviteModal
          isOpen={isInviteOpen}
          roomId={party.roomId}
          roomTitle={party.room?.title ?? `Кинозал ${party.roomId}`}
          onClose={() => setIsInviteOpen(false)}
          onJoinByCode={party.joinRoomByCode}
          onCreateNewRoom={party.createNewRoom}
        />
      </div>
    </MotionConfig>
  );
}
