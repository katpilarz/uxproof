import { StateCreator } from 'zustand';
import type { AppStore } from '../index';
import { Message } from '@/types';

export function makeMsgId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
export function makeTimestamp() {
  return new Date().toISOString();
}

// No more @sanity/client in the browser — go through our API routes

async function fetchSessionMessages(sessionId: string): Promise<Message[]> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('[session-slice] fetchSessionMessages bad status:', res.status);
      return [];
    }
    const { messages } = await res.json();
    if (!messages?.length) return [];
    return (messages as any[]).map(m => ({
      id:        m.messageId || makeMsgId(),
      role:      m.role as 'user' | 'assistant',
      content:   m.content || '',
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      // Presentation metadata — restores the preview card in history.
      // No downloadUrl is stored, so the card renders in idle state with
      // the manual "Generate & download" button (autoStart stays off for
      // old timestamps).
      ...(m.showPresentation ? {
        showPresentation:  true,
        presentationScope: m.presentationScope,
        year:              m.year,
        quarter:           m.quarter,
        contextRef:        m.contextQuarter
          ? { project: 'UX Research Report', quarter: m.contextQuarter }
          : undefined,
      } : {}),
    } as Message));
  } catch (e) {
    console.warn('[session-slice] fetchSessionMessages error:', e);
    return [];
  }
}

async function fetchChatSessions(): Promise<ChatSession[]> {
  try {
    const res = await fetch('/api/sessions', { cache: 'no-store' });
    if (!res.ok) {
      console.warn('[session-slice] fetchChatSessions bad status:', res.status);
      return [];
    }
    const { sessions } = await res.json();
    return sessions || [];
  } catch (e) {
    console.warn('[session-slice] fetchChatSessions error:', e);
    return [];
  }
}
// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatSession {
  id:            string;
  sessionId:     string;
  title:         string;
  /** The user's own name for the conversation, when they've set one.
   *  Undefined means the sidebar falls back to the last message text. */
  customTitle?:  string;
  quarter?:      string;
  createdAt:     string;
  preview?:      string;
  messageCount?: number;
}

export interface SessionSliceState {
  activeSessionId: string;
  sessions:        ChatSession[];
  sessionsLoading: boolean;
  historyOpen:     boolean;
  settingsOpen:    boolean;
  restoring:       boolean;
  isNewSession:    boolean;
}

export interface SessionSliceActions {
  initSession:   () => void;
  newSession:    () => void;
  selectSession: (id: string) => Promise<void>;
  loadSessions:  () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<boolean>;
  openHistory:   () => void;
  closeHistory:  () => void;
  openSettings:  () => void;
  closeSettings: () => void;
}

export interface SessionSlice extends SessionSliceState, SessionSliceActions {}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const initialState: SessionSliceState = {
  activeSessionId: generateSessionId(),
  sessions:        [],
  sessionsLoading: false,
  historyOpen:     false,
  settingsOpen:    false,
  restoring:       false,
  isNewSession:    true,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

export const createSessionSlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  SessionSlice
> = (set, get) => ({
  ...initialState,

  initSession: () => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/') return;
    const newId = generateSessionId();
    set(s => {
      s.activeSessionId = newId;
      s.messages        = [];
      s.isNewSession    = true;
      s.restoring       = false;
    });
    fetchChatSessions().then(sessions => {
      set(s => { s.sessions = sessions; });
    }).catch(() => {});
  },

  newSession: () => {
    const newId = generateSessionId();
    set(s => {
      s.activeSessionId = newId;
      s.messages        = [];
      s.isNewSession    = true;
      s.restoring       = false;
      s.error           = null;
      s.loading.chat    = false;
    });
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  },

  selectSession: async (id: string) => {
    if (id === get().activeSessionId && !get().isNewSession) return;

    set(s => {
      s.activeSessionId = id;
      s.restoring       = true;
      s.messages        = [];
      s.isNewSession    = false;
      s.loading.chat    = false;
    });

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/chat/${id}`);
    }

    const messages = await fetchSessionMessages(id);
    set(s => {
      s.messages  = messages;
      s.restoring = false;
    });
  },

  loadSessions: async () => {
    set(s => { s.sessionsLoading = true; });
    const sessions = await fetchChatSessions();
    set(s => {
      s.sessions        = sessions;
      s.sessionsLoading = false;
    });
  },

  deleteSession: async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        get().showToast(data.error || 'Could not delete the conversation', { variant: 'error' });
        return;
      }
      set(s => {
        s.sessions = s.sessions.filter(x => x.sessionId !== id);
      });
      // If the open conversation was deleted, land on a fresh chat.
      if (get().activeSessionId === id) {
        get().newSession();
      }
      get().showToast('Conversation deleted', { variant: 'success' });
    } catch (e) {
      console.warn('[session-slice] deleteSession error:', e);
      get().showToast('Could not delete the conversation', { variant: 'error' });
    }
  },

  renameSession: async (id: string, title: string) => {
    const trimmed = title.trim().replace(/\s+/g, ' ');
    const previous = get().sessions.find(x => x.sessionId === id)?.customTitle;
    if (trimmed === (previous ?? '')) return true;

    // Optimistic — the sidebar row swaps to the new name immediately and
    // rolls back if the server refuses.
    set(s => {
      const row = s.sessions.find(x => x.sessionId === id);
      if (row) row.customTitle = trimmed || undefined;
    });

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set(s => {
          const row = s.sessions.find(x => x.sessionId === id);
          if (row) row.customTitle = previous;
        });
        get().showToast(data.error || 'Could not rename the conversation', { variant: 'error' });
        return false;
      }
      get().showToast(trimmed ? 'Conversation renamed' : 'Name cleared', { variant: 'success' });
      return true;
    } catch (e) {
      console.warn('[session-slice] renameSession error:', e);
      set(s => {
        const row = s.sessions.find(x => x.sessionId === id);
        if (row) row.customTitle = previous;
      });
      get().showToast('Could not rename the conversation', { variant: 'error' });
      return false;
    }
  },

  openHistory:   () => set(s => { s.historyOpen  = true;  }),
  closeHistory:  () => set(s => { s.historyOpen  = false; }),
  openSettings:  () => set(s => { s.settingsOpen = true;  }),
  closeSettings: () => set(s => { s.settingsOpen = false; }),
});