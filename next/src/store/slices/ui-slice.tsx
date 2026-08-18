/**
 * store/slices/ui-slice.ts
 *
 * Fix: openHistory no longer calls loadSessions() synchronously inside
 * the set() callback — that caused the sidebar's historyOpen = true to
 * sometimes be swallowed by the concurrent sessionsLoading state change.
 *
 * The sidebar component itself triggers loadSessions() via useEffect
 * when it sees historyOpen flip to true, which is the correct React pattern.
 */

import { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export interface UISliceState {
  settingsOpen: boolean;
  historyOpen:  boolean;
}

export interface UISliceActions {
  openSettings:  () => void;
  closeSettings: () => void;
  toggleSettings:() => void;
  openHistory:   () => void;
  closeHistory:  () => void;
  toggleHistory: () => void;
}

export interface UISlice extends UISliceState, UISliceActions {}

const initialState: UISliceState = {
  settingsOpen: false,
  historyOpen:  false,
};

export const createUISlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  UISlice
> = (set) => ({
  ...initialState,

  openSettings:   () => set((s) => { s.settingsOpen = true;  }),
  closeSettings:  () => set((s) => { s.settingsOpen = false; }),
  toggleSettings: () => set((s) => { s.settingsOpen = !s.settingsOpen; }),

  // Just flip the flag — the sidebar's useEffect handles loadSessions
  openHistory:   () => set((s) => { s.historyOpen = true;  }),
  closeHistory:  () => set((s) => { s.historyOpen = false; }),
  toggleHistory: () => set((s) => { s.historyOpen = !s.historyOpen; }),
});