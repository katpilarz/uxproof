'use client';

// components/chat-view.tsx
// Client view for the root route (new chat). Pages stay server components
// per the project convention — all client behavior (animation, store) lives
// here in components/.

import { motion } from 'framer-motion';
import { ChatInterface } from '@/components/chat-interface';

export function ChatView() {
  return (
    <motion.div
      key="chat-root"
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
      className="h-full w-full"
    >
      <ChatInterface />
    </motion.div>
  );
}
