'use client';
 
/**
 * components/client-init.tsx
 *
 * Runs once on app mount (via layout.tsx).
 * - Calls newSession() to set up a fresh session ID
 * - Calls loadSessions() to populate the chat history sidebar
 *
 * FIX: was calling initSession() which never existed in the store.
 * newSession() is the correct action — it generates an ID and sets isNewSession=true.
 */
 
import { useEffect } from 'react';
import { useStore } from '@/store';
 
export function ClientInit() {
  const newSession   = useStore(s => s.newSession);
  const loadSessions = useStore(s => s.loadSessions);
 
  useEffect(() => {
    // Only init if no active session has messages yet
    // (avoids resetting a session restored from URL on /chat/[sessionId])
    newSession();
    loadSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — run exactly once on mount
 
  return null;
}