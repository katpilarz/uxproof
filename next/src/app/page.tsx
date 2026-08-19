// app/page.tsx
// Root route — new chat. Server component by convention: pages stay
// server-rendered; all client behavior lives in components/ ('use client').
// Shell (TopBar, Sidebar, Settings) comes from AppShell in app/layout.tsx.

import { ChatView } from '@/components/chat-view';

export default function Home() {
  return <ChatView />;
}
