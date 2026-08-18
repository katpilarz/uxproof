'use client';
 
// app/presentations/page.tsx
// /presentations — uses the same shell as /. Replaces the old
// `currentView === 'dashboard'` toggle so the URL is the source of truth.
 
import { useRouter } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';
import { motion } from 'framer-motion';
import { useNewSession } from '@/store';
 
export default function PresentationsPage() {
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
 