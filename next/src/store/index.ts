/**
 * store/index.ts
 * Added: useStreamSteps selector for AIThinkingPanel live step updates
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { createChatSlice, ChatSlice } from './slices/chat-slice';
import { createSessionSlice, SessionSlice } from './slices/session-slice';
import { createAuthSlice, AuthSlice } from './slices/auth-slice';
import { createToastSlice, ToastSlice } from './slices/toast-slice';

export type AppStore = ChatSlice & SessionSlice & AuthSlice & ToastSlice;

export const useStore = create<AppStore>()(
  devtools(
    immer((...a) => ({
      ...createChatSlice(...a),
      ...createSessionSlice(...a),
      ...createAuthSlice(...a),
      ...createToastSlice(...a),
    })),
    { name: 'UxproofStore' }
  )
);

// ── Chat selectors ─────────────────────────────────────────────────────────────

export const useMessages         = () => useStore(s => s.messages);
export const useIsProcessing     = () => useStore(s => s.loading.chat);
export const useCurrentView      = () => useStore(s => s.currentView);
export const useAIContext        = () => useStore(s => s.aiContext);
export const useError            = () => useStore(s => s.error);
// Live step state from SSE stream — used by AIThinkingPanel
export const useStreamSteps      = () => useStore(s => s.streamSteps);

// ── Chat actions ───────────────────────────────────────────────────────────────

export const useSendMessage          = () => useStore(s => s.sendMessage);
export const useUploadFile           = () => useStore(s => s.uploadFile);
export const usePendingPrompt        = () => useStore(s => s.pendingPrompt);
export const useSetPendingPrompt     = () => useStore(s => s.setPendingPrompt);
export const useResetChat            = () => useStore(s => s.resetChat);
export const useSetMessages          = () => useStore(s => s.setMessages);
export const useSetView              = () => useStore(s => s.setView);
export const useSetLoading           = () => useStore(s => s.setLoading);
export const useSetError             = () => useStore(s => s.setError);
export const useSetAIContext         = () => useStore(s => s.setAIContext);
export const useSetSelectedProjectId = () => useStore(s => s.setSelectedProjectId);

// ── Session selectors ──────────────────────────────────────────────────────────

export const useActiveSessionId = () => useStore(s => s.activeSessionId);
export const useSessions        = () => useStore(s => s.sessions);
export const useSessionsLoading = () => useStore(s => s.sessionsLoading);
export const useHistoryOpen     = () => useStore(s => s.historyOpen);
export const useRestoring       = () => useStore(s => s.restoring);
export const useIsNewSession    = () => useStore(s => s.isNewSession);
export const useSettingsOpen    = () => useStore(s => s.settingsOpen);

// ── Session actions ────────────────────────────────────────────────────────────

// ── Auth ───────────────────────────────────────────────────────────────────────

export const useAuthUser       = () => useStore(s => s.user);
export const useAuthLoading    = () => useStore(s => s.authLoading);
export const useLoginPending   = () => useStore(s => s.loginPending);
export const useCheckAuth      = () => useStore(s => s.checkAuth);
export const useLogin          = () => useStore(s => s.login);
export const useRegister       = () => useStore(s => s.register);
export const useLogout         = () => useStore(s => s.logout);

// ── Profile (account dialog under the avatar) ─────────────────────────────────

export const useProfileOpen    = () => useStore(s => s.profileOpen);
export const useProfilePending = () => useStore(s => s.profilePending);
export const useOpenProfile    = () => useStore(s => s.openProfile);
export const useCloseProfile   = () => useStore(s => s.closeProfile);
export const useUpdateProfile  = () => useStore(s => s.updateProfile);
export const useChangePassword = () => useStore(s => s.changePassword);

// ── Toasts ─────────────────────────────────────────────────────────────────────

export const useToasts       = () => useStore(s => s.toasts);
export const useShowToast    = () => useStore(s => s.showToast);
export const useDismissToast = () => useStore(s => s.dismissToast);

export const useNewSession    = () => useStore(s => s.newSession);
// useInitSession: called once on app mount — seeds session + loads sidebar history
// Does NOT push to '/' (we're already there at boot)
export const useInitSession   = () => useStore(s => s.initSession);
export const useSelectSession = () => useStore(s => s.selectSession);
export const useLoadSessions  = () => useStore(s => s.loadSessions);
export const useDeleteSession = () => useStore(s => s.deleteSession);
export const useRenameSession = () => useStore(s => s.renameSession);
export const useOpenHistory   = () => useStore(s => s.openHistory);
export const useCloseHistory  = () => useStore(s => s.closeHistory);
export const useOpenSettings  = () => useStore(s => s.openSettings);
export const useCloseSettings = () => useStore(s => s.closeSettings);