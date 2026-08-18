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
 * Logo click → opens the chat history sidebar (does NOT start a new chat).
 * "New Chat" / "Presentations" toggle in TopBar handles view switching.
 */

import { useRouter } from 'next/navigation';
import { TopBar }             from '@/components/top-bar';
import { SettingsDialog }     from '@/components/settings-dialog';
import { ChatHistorySidebar } from '@/components/chat-history-sidebar';

import {
  useSettingsOpen,
  useNewSession,
  useOpenHistory,
  useOpenSettings,
  useCloseSettings,
} from '@/store';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router       = useRouter();
  const settingsOpen = useSettingsOpen();

  const newSession   = useNewSession();
  const openHistory  = useOpenHistory();
  const openSettings = useOpenSettings();
  const closeSettings = useCloseSettings();

  // Logo → open chat history sidebar.
  // We don't reset session or navigate — just reveal the sidebar so the user
  // can pick an existing chat or hit the + button there for a new one.
  const handleLogoClick = () => {
    openHistory();
  };

  // "Presentations" button → navigate to /presentations
  const handleDashboardClick = () => {
    router.push('/presentations');
  };

  // "New Chat" button (shown only when on /presentations) → fresh chat at root
  const handleNewChatClick = () => {
    newSession();
    router.push('/');
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar
        onSettingsClick={openSettings}
        onDashboardClick={handleDashboardClick}
        onLogoClick={handleLogoClick}
        onHistoryClick={openHistory}
        onNewChatClick={handleNewChatClick}
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
    </div>
  );
}