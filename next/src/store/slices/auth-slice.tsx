/**
 * store/slices/auth-slice.tsx
 *
 * Client-side view of the signed-in user. The session itself lives in an
 * httpOnly cookie the server sets — this slice only mirrors it:
 *   - checkAuth() on boot asks /api/auth/me who the cookie belongs to
 *   - login() posts the email + optional avatar form
 *   - logout() clears the cookie and resets per-user state
 *
 * Login/logout push their confirmation toasts through the toast slice so
 * every entry point gets consistent feedback.
 */

import { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface AuthUser {
  id:         string;
  email:      string;
  name?:      string;
  avatarUrl?: string;
}

export interface AuthSliceState {
  user:         AuthUser | null;
  /** true until the first checkAuth() resolves — gates the whole shell */
  authLoading:  boolean;
  loginPending: boolean;
}

export interface AuthSliceActions {
  checkAuth: () => Promise<boolean>;
  login:     (form: FormData) => Promise<{ ok: boolean; error?: string }>;
  logout:    () => Promise<void>;
}

export interface AuthSlice extends AuthSliceState, AuthSliceActions {}

const initialState: AuthSliceState = {
  user:         null,
  authLoading:  true,
  loginPending: false,
};

export const createAuthSlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  AuthSlice
> = (set, get) => ({
  ...initialState,

  checkAuth: async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const { user } = res.ok ? await res.json() : { user: null };
      set(s => {
        s.user        = user ?? null;
        s.authLoading = false;
      });
      return !!user;
    } catch (e) {
      console.warn('[auth-slice] checkAuth failed:', e);
      set(s => { s.authLoading = false; });
      return false;
    }
  },

  login: async (form: FormData) => {
    set(s => { s.loginPending = true; });
    try {
      const res  = await fetch('/api/auth/login', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        set(s => { s.loginPending = false; });
        return { ok: false, error: data.error || 'Sign-in failed. Please try again.' };
      }
      set(s => {
        s.user         = data.user;
        s.loginPending = false;
      });
      get().showToast(`Signed in as ${data.user.email}`, { variant: 'success' });
      // Pull this user's conversations into the sidebar right away.
      get().loadSessions();
      return { ok: true };
    } catch (e) {
      console.warn('[auth-slice] login failed:', e);
      set(s => { s.loginPending = false; });
      return { ok: false, error: 'Sign-in failed. Is the server running?' };
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('[auth-slice] logout request failed:', e);
    }
    set(s => {
      s.user     = null;
      s.sessions = [];
    });
    // Fresh anonymous session so nothing of the previous user lingers.
    get().newSession();
    get().showToast('Signed out', { variant: 'info' });
  },
});
