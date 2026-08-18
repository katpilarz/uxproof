'use client';

// app/page.tsx
// Root route — new chat. Shell (TopBar, Sidebar, Settings) lives in
// app/layout.tsx via AppShell, so this page only renders its content.

import { ChatInterface } from '@/components/chat-interface';
import { motion } from 'framer-motion';

export default function Home() {
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