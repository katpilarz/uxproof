'use client';

// components/presentations-view.tsx
// Client view for /presentations. The page stays a server component; the
// router/store interactions and entry animation live here.

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Dashboard } from '@/components/dashboard';
import { useNewSession } from '@/store';

export function PresentationsView() {
  const router     = useRouter();
  const newSession = useNewSession();

  // "Generate New Presentation" card → fresh session + navigate to root
  const handleChatClick = () => {
    newSession();
    router.push('/');
  };

  return (
    <motion.div
      key="presentations"
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
      className="h-full w-full"
    >
      <Dashboard onChatClick={handleChatClick} />
    </motion.div>
  );
}
