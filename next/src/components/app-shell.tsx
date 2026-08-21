'use client';

/**
 * components/app-shell.tsx
 *
 * Shared chrome rendered around every route: TopBar, Sidebar, SettingsDialog.
 * Used by app/layout.tsx so it persists across navigation between
 * /, /chat/[sessionId], and /presentations.
 *
 * No more `currentView` store flag — the URL is the source of truth.
 * TopBar reads usePathname() and uses router.push() to navigate.
 *
 * Logo click → resets to a fresh chat on the welcome screen.
 * Sidebar icon (left of the logo) → toggles the chat history sidebar, which
 * is non-modal: it pushes the content aside rather than covering it, and
 * nothing behind it is dimmed or blurred.
 * Settings lives in the chat input, not the top bar.
 */

import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { TopBar }             from '@/components/top-bar';
import { SettingsDialog }     from '@/components/settings-dialog';
import { ProfileDialog }      from '@/components/profile-dialog';
import { ChatHistorySidebar } from '@/components/chat-history-sidebar';
import { LoginScreen }        from '@/components/login-screen';
import { Toaster }            from '@/components/toaster';

import {
  useSettingsOpen,
  useNewSession,
  useHistoryOpen,
  useOpenHistory,
  useCloseHistory,
  useOpenSettings,
  useCloseSettings,
  useAuthUser,
  useAuthLoading,
} from '@/store';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router       = useRouter();
  const settingsOpen = useSettingsOpen();
  const user         = useAuthUser();
  const authLoading  = useAuthLoading();

  const newSession   = useNewSession();
  const historyOpen  = useHistoryOpen();
  const openHistory  = useOpenHistory();
  const closeHistory = useCloseHistory();
  const openSettings = useOpenSettings();
  const closeSettings = useCloseSettings();

  // Sidebar icon is a toggle: open when closed, close when open.
  const toggleHistory = () => (historyOpen ? closeHistory() : openHistory());

  // Logo → always reset to the first screen (fresh chat at root).
  const handleLogoClick = () => {
    newSession();
    router.push('/');
  };

  // "Presentations" button → navigate to /presentations
  const handleDashboardClick = () => {
    router.push('/presentations');
  };

  // "Files" button → navigate to the uploaded-files directory
  const handleFilesClick = () => {
    router.push('/files');
  };

  // Auth gate: wait for the boot-time /api/auth/me check, then either show
  // the login screen or the app. The Toaster renders in every branch so
  // sign-in/out confirmations are never swallowed by the swap.
  if (authLoading) {
    return (
      <div className="h-screen w-full grid place-items-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <MotionConfig reducedMotion="user">
        <LoginScreen />
        <Toaster />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
        <Toaster />
        <TopBar
          onDashboardClick={handleDashboardClick}
          onFilesClick={handleFilesClick}
          onLogoClick={handleLogoClick}
          onHistoryClick={toggleHistory}
          historyOpen={historyOpen}
          onNewChatClick={handleLogoClick}
        />

        <div className="flex-1 flex overflow-hidden pt-14 relative">
          <ChatHistorySidebar />
          {/* The sidebar is non-modal: nothing is dimmed and the chat stays
              usable while it is open, so the content is pushed aside (in step
              with the panel's own 300ms slide) instead of covered. Below sm
              the panel is a full-width drawer, so there is nothing to push. */}
          <div
            className={`flex-1 min-w-0 transition-[margin-left] duration-300 ease-in-out ${
              historyOpen ? 'sm:ml-72' : 'ml-0'
            }`}
          >
            {children}
          </div>
        </div>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={(o) => (o ? openSettings() : closeSettings())}
        />

        {/* Account panel — reads its own open state from the auth slice. */}
        <ProfileDialog />
      </div>
    </MotionConfig>
  );
}