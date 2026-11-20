import React from 'react';
import { UserPlus } from 'lucide-react';

export type NavSection = 'cinema' | 'participants';

interface HeaderProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onOpenInvite: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onNavigate,
  onOpenInvite,
}) => {
  const navItems: { id: NavSection; label: string }[] = [
    { id: 'cinema', label: 'Кинозал' },
    { id: 'participants', label: 'Участники' },
  ];

  return (
    <header className="sticky top-0 z-40 px-4 sm:px-6 pt-3">
      <div className="mx-auto max-w-[1440px] liquid-glass rounded-2xl px-5 py-3 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('cinema')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-md cursor-pointer"
        >
          Kinoroom
        </button>

        {/* Zone 2: Only Кинозал and Участники */}
        <nav
          aria-label="Основная навигация"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded ${
                  isActive
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-sky-500 transition-transform duration-150 origin-left ${
                    isActive ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenInvite}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-[0.98] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Пригласить</span>
          </button>
        </div>
      </div>
    </header>
  );
};
