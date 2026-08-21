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

// uxproof logomark — the brand mark: a flat violet tile carrying a
// document under a magnifier (research, examined). Mirrored exactly as the
// favicon in app/icon.svg and on the deck cover — keep the three in sync.
//
// Only the TILE lives here. Both call sites set the "uxproof" wordmark as
// HTML text beside it, so it inherits the app's own type and stays
// selectable; LOGO_VIOLET is the one colour that must match the tile.
export const LOGO_VIOLET = '#7E27FE';

export function UxproofMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} aria-hidden="true">
      <rect width="56" height="56" rx="12" fill={LOGO_VIOLET} />
      {/* The glyph, centred and filling ~61% of the tile. translate/scale
          are derived from its own extent (x 4–22, y 4.6–21.4) so it stays
          optically centred if the scale is ever changed again. */}
      <g transform="translate(3.3,3.3) scale(1.9)">
        <rect x="4" y="4.6"  width="17.7" height="2.1" rx="1.05" fill="#FFFFFF" />
        <rect x="4" y="10.6" width="5.6"  height="2.1" rx="1.05" fill="#FFFFFF" />
        <rect x="4" y="16.6" width="5.6"  height="2.1" rx="1.05" fill="#FFFFFF" />
        <circle cx="16" cy="14.5" r="4.9" stroke="#FFFFFF" strokeWidth="2" fill="none" />
        <line
          x1="19.47" y1="17.97" x2="22" y2="21.4"
          stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round"
        />
      </g>
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
                  <span style={{ color: LOGO_VIOLET }}>ux</span>
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
