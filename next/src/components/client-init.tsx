'use client';

/**
 * components/client-init.tsx
 *
 * Runs once on app mount (via layout.tsx).
 * - Calls newSession() to set up a fresh session ID
 * - Resolves the signed-in user from the session cookie (checkAuth)
 * - Loads the chat history sidebar only once a user is confirmed —
 *   the sessions API is per-user and returns 401 for anonymous visitors
 */

import { useEffect } from 'react';
import { useStore } from '@/store';

export function ClientInit() {
  const newSession   = useStore(s => s.newSession);
  const loadSessions = useStore(s => s.loadSessions);
  const checkAuth    = useStore(s => s.checkAuth);

  useEffect(() => {
    newSession();
    checkAuth().then(signedIn => {
      if (signedIn) loadSessions();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — run exactly once on mount

  return null;
}
