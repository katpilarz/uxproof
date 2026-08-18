'use client';

/**
 * components/top-bar.tsx
 *
 * CHANGE: dropped `currentView` prop in favour of usePathname(). The URL
 * is now the source of truth for the active view — see app-shell.tsx.
 *
 * Button wiring:
 *   - Logo (Sparkles) → onLogoClick → opens chat history sidebar
 *   - "Chat" button   → onNewChatClick → navigates to / with fresh session
 *   - "Presentations" → onDashboardClick → navigates to /presentations
 */

import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Settings, Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { useTheme } from './theme-provider';

type TopBarProps = {
  onSettingsClick:  () => void;
  onDashboardClick: () => void;   // → /presentations
  onLogoClick:      () => void;   // → opens chat history sidebar
  onHistoryClick:   () => void;   // → opens chat history sidebar (same as logo)
  onNewChatClick:   () => void;   // → / with fresh session
};

export function TopBar({
  onSettingsClick,
  onDashboardClick,
  onLogoClick,
  onHistoryClick,
  onNewChatClick,
}: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const pathname            = usePathname();

  const isPresentations = pathname?.startsWith('/presentations') ?? false;
  const isChat          = !isPresentations; // / and /chat/[id] both count as chat

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background flex items-center justify-between px-6">

        {/* ── Left: PAISAK4U wordmark opens history sidebar ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={onLogoClick}
              className="flex items-center gap-3 px-2 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/paisak4u-wordmark.png"
                alt="PAISAK4U"
                width={104}
                height={16}
                priority
                className="dark:hidden"
              />
              <Image
                src="/paisak4u-wordmark-white.png"
                alt="PAISAK4U"
                width={104}
                height={16}
                priority
                className="hidden dark:block"
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                uxproof
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Previous Chats</p>
          </TooltipContent>
        </Tooltip>

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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onSettingsClick}>
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
        </div>

      </div>
    </TooltipProvider>
  );
}