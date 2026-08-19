'use client';

/**
 * components/top-bar.tsx
 *
 * Button wiring:
 *   - Sidebar icon (before logo) → onHistoryClick → opens chat history
 *   - "uxproof" logo → onLogoClick → resets to a fresh chat (first screen)
 *   - "Chat" button   → onNewChatClick → navigates to / with fresh session
 *   - "Presentations" → onDashboardClick → navigates to /presentations
 *
 * Settings moved into the chat input (chat-interface.tsx).
 */

import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';

// Sidebar toggle icon — like lucide's PanelLeft but with softer, more
// rounded corners (rx 5 instead of 2).
function PanelLeftRounded({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="5" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

// uxproof logomark — app-icon tile: graphite gradient, a checkmark whose
// tail rises past the tile's optical centre (evidence validated ✓) with
// a spark dot where the insight "lands". Mirrored as the favicon in
// app/icon.svg — keep the two in sync. Exported for the login screen.
export function UxproofMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="uxg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f3f46" />
          <stop offset="1" stopColor="#18181b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#uxg)" />
      <path
        d="M8.5 17.5l5 5L23 11.5"
        fill="none" stroke="white" strokeWidth="3.2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="24.2" cy="7.6" r="1.9" fill="white" opacity="0.9" />
    </svg>
  );
}
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { useTheme } from './theme-provider';
import { UserMenu } from './user-menu';

type TopBarProps = {
  onDashboardClick: () => void;   // → /presentations
  onFilesClick:     () => void;   // → /files
  onLogoClick:      () => void;   // → reset to fresh chat at /
  onHistoryClick:   () => void;   // → toggles chat history sidebar
  historyOpen:      boolean;      // ← sidebar state, for aria + tooltip
  onNewChatClick:   () => void;   // → / with fresh session
};

export function TopBar({
  onDashboardClick,
  onFilesClick,
  onLogoClick,
  onHistoryClick,
  historyOpen,
  onNewChatClick,
}: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const pathname            = usePathname();

  const isPresentations = pathname?.startsWith('/presentations') ?? false;
  const isFiles         = pathname?.startsWith('/files') ?? false;
  const isChat          = !isPresentations && !isFiles; // / and /chat/[id] both count as chat

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background flex items-center justify-between px-4">

        {/* ── Left: sidebar toggle + app name ── */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onHistoryClick}
                aria-label={historyOpen ? 'Close chat history' : 'Open chat history'}
                aria-expanded={historyOpen}
                className={historyOpen ? 'bg-muted' : undefined}
              >
                <PanelLeftRounded className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{historyOpen ? 'Close sidebar' : 'Chat history'}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={onLogoClick}
                className="flex items-center gap-2 px-2 hover:opacity-80 transition-opacity"
              >
                <UxproofMark className="size-6" />
                <span className="text-[17px] font-semibold tracking-tight lowercase leading-none">
                  <span className="text-foreground">ux</span>
                  <span className="text-foreground">proof</span>
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Start over</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Right ── */}
        <div className="flex items-center gap-2">
          <Button
            variant={isChat ? 'default' : 'ghost'}
            size="sm"
            onClick={onNewChatClick}
          >
            Chat
          </Button>

          <Button
            variant={isFiles ? 'default' : 'ghost'}
            size="sm"
            onClick={onFilesClick}
          >
            Files
          </Button>

          <Button
            variant={isPresentations ? 'default' : 'ghost'}
            size="sm"
            onClick={onDashboardClick}
          >
            Presentations
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                {theme === 'light'
                  ? <Moon className="size-4" />
                  : <Sun  className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{theme === 'light' ? 'Dark mode' : 'Light mode'}</p>
            </TooltipContent>
          </Tooltip>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Signed-in user — avatar opens the account dropdown (log out) */}
          <UserMenu />
        </div>

      </div>
    </TooltipProvider>
  );
}
