import { useRef } from 'react';

export function useChatSession() {
  const sessionId = useRef<string>(
    `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  return sessionId.current;
}