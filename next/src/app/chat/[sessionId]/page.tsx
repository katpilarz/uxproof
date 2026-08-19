// app/chat/[sessionId]/page.tsx
// Server component by convention: resolves the async route params and
// hands the sessionId to the client view, which restores the session in
// the store. All chrome (TopBar, sidebar, settings) comes from AppShell
// in app/layout.tsx — this page is content-only, matching app/page.tsx.

import { ChatSessionView } from '@/components/chat-session-view';

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatSessionView sessionId={sessionId} />;
}
