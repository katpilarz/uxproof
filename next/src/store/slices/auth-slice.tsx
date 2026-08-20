/**
 * store/slices/auth-slice.tsx
 *
 * Client-side view of the signed-in user. The session itself lives in an
 * httpOnly cookie the server sets — this slice only mirrors it:
 *   - checkAuth() on boot asks /api/auth/me who the cookie belongs to
 *   - login() posts email + password
 *   - register() posts the signup form (email, password, name, avatar)
 *   - updateProfile() / changePassword() edit the account from the
 *     profile dialog
 *   - logout() clears the cookie and resets per-user state
 *
 * The password itself never lands in the store: it goes straight from the
 * form into the request body. What comes back is the AuthUser shape, which
 * the server has already stripped of the password digest.
 *
 * Every action pushes its confirmation through the toast slice so each
 * entry point gets consistent feedback.
 */

import { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface AuthUser {
  id:         string;
  email:      string;
  name?:      string;
  avatarUrl?: string;
  /** false for legacy accounts that predate passwords — they adopt one on
   *  their next sign-in, and the profile dialog skips asking for a
   *  current password until then. */
  hasPassword: boolean;
}

/** What every auth mutation resolves to — never throws at the caller. */
export interface AuthResult {
  ok:     boolean;
  error?: string;
}

export interface AuthSliceState {
  user:         AuthUser | null;
  /** true until the first checkAuth() resolves — gates the whole shell */
  authLoading:  boolean;
  loginPending: boolean;
  /** profile dialog, anchored under the avatar */
  profileOpen:  boolean;
  profilePending: boolean;
}

export interface AuthSliceActions {
  checkAuth:      () => Promise<boolean>;
  login:          (email: string, password: string) => Promise<AuthResult>;
  register:       (form: FormData) => Promise<AuthResult>;
  updateProfile:  (form: FormData) => Promise<AuthResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  logout:         () => Promise<void>;
  openProfile:    () => void;
  closeProfile:   () => void;
}

export interface AuthSlice extends AuthSliceState, AuthSliceActions {}

const initialState: AuthSliceState = {
  user:           null,
  authLoading:    true,
  loginPending:   false,
  profileOpen:    false,
  profilePending: false,
};

const NETWORK_ERROR = 'Could not reach the server. Is it running?';

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

  login: async (email: string, password: string) => {
    set(s => { s.loginPending = true; });
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        set(s => { s.loginPending = false; });
        return { ok: false, error: data.error || 'Sign-in failed. Please try again.' };
      }
      set(s => {
        s.user         = data.user;
        s.loginPending = false;
      });
      get().showToast(
        data.adoptedPassword
          ? 'Signed in — this password is now set on your account'
          : `Signed in as ${data.user.email}`,
        { variant: 'success' },
      );
      // Pull this user's conversations into the sidebar right away.
      get().loadSessions();
      return { ok: true };
    } catch (e) {
      console.warn('[auth-slice] login failed:', e);
      set(s => { s.loginPending = false; });
      return { ok: false, error: NETWORK_ERROR };
    }
  },

  register: async (form: FormData) => {
    set(s => { s.loginPending = true; });
    try {
      const res  = await fetch('/api/auth/register', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        set(s => { s.loginPending = false; });
        return { ok: false, error: data.error || 'Account creation failed. Please try again.' };
      }
      set(s => {
        s.user         = data.user;
        s.loginPending = false;
      });
      get().showToast(`Account created for ${data.user.email}`, { variant: 'success' });
      get().loadSessions();
      return { ok: true };
    } catch (e) {
      console.warn('[auth-slice] register failed:', e);
      set(s => { s.loginPending = false; });
      return { ok: false, error: NETWORK_ERROR };
    }
  },

  updateProfile: async (form: FormData) => {
    set(s => { s.profilePending = true; });
    try {
      const res  = await fetch('/api/auth/profile', { method: 'PATCH', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) {
        set(s => { s.profilePending = false; });
        return { ok: false, error: data.error || 'Could not save your profile.' };
      }
      set(s => {
        s.user           = data.user;
        s.profilePending = false;
      });
      get().showToast(
        data.changed ? 'Profile updated' : 'No changes to save',
        { variant: data.changed ? 'success' : 'info' },
      );
      return { ok: true };
    } catch (e) {
      console.warn('[auth-slice] updateProfile failed:', e);
      set(s => { s.profilePending = false; });
      return { ok: false, error: NETWORK_ERROR };
    }
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    set(s => { s.profilePending = true; });
    try {
      const res = await fetch('/api/auth/password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      set(s => { s.profilePending = false; });
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Could not change your password.' };
      }
      // The account now definitely has a password — reflect that so the
      // dialog asks for the current one next time.
      set(s => { if (s.user) s.user.hasPassword = true; });
      get().showToast('Password changed', { variant: 'success' });
      return { ok: true };
    } catch (e) {
      console.warn('[auth-slice] changePassword failed:', e);
      set(s => { s.profilePending = false; });
      return { ok: false, error: NETWORK_ERROR };
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('[auth-slice] logout request failed:', e);
    }
    set(s => {
      s.user        = null;
      s.sessions    = [];
      s.profileOpen = false;
    });
    // Fresh anonymous session so nothing of the previous user lingers.
    get().newSession();
    get().showToast('Signed out', { variant: 'info' });
  },

  openProfile:  () => set(s => { s.profileOpen = true;  }),
  closeProfile: () => set(s => { s.profileOpen = false; }),
});
