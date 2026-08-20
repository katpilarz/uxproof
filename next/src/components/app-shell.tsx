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
 * Sidebar icon (left of the logo) → opens the chat history sidebar.
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
          <div className="flex-1 min-w-0">
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