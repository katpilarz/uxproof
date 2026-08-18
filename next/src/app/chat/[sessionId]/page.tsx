'use client';

// app/chat/[sessionId]/page.tsx
// Restores the session in the store, then renders the chat content.
// All chrome (TopBar, sidebar, settings) is provided by AppShell in
// app/layout.tsx — this page is content-only, matching app/page.tsx.

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChatInterface } from '@/components/chat-interface';
import { useStore } from '@/store';

export default function ChatSessionPage() {
  const params    = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId as string;

  const selectSession   = useStore(s => s.selectSession);
  const activeSessionId = useStore(s => s.activeSessionId);

  useEffect(() => {
    if (sessionId && sessionId !== activeSessionId) {
      selectSession(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <motion.div
      key={`chat-${sessionId}`}
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
      className="h-full w-full"
    >
      <ChatInterface />
    </motion.div>
  );
}