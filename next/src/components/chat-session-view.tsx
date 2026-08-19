'use client';

// components/chat-session-view.tsx
// Client view for /chat/[sessionId]: restores the session in the store,
// then renders the chat content. The page itself stays a server component
// and passes the resolved sessionId in as a prop.

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChatInterface } from '@/components/chat-interface';
import { useStore } from '@/store';

export function ChatSessionView({ sessionId }: { sessionId: string }) {
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
