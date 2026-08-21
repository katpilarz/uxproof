'use client';

/**
 * components/chat-history-sidebar.tsx — v2 (UX pass)
 *
 * CHANGES OVER v1:
 *   - Backdrop scrim: clicking anywhere outside the panel closes it
 *     (previously the sidebar could only be closed via the small X).
 *   - Escape closes the sidebar.
 *   - "New chat" is a prominent full-width button at the top of the
 *     list instead of a tiny icon hidden in the header.
 *   - Sessions are grouped by recency (Today / Yesterday / This week /
 *     Earlier) with readable relative timestamps via date-fns, so the
 *     list scans chronologically instead of as a flat wall of rows.
 *   - Row hierarchy inverted: the conversation preview is the primary
 *     line (it's what users recognise), quarter + time are metadata.
 *
 * Rows can be renamed in place: the pencil turns the title into an input
 * (Enter saves, Escape cancels). A saved name replaces the message
 * preview; clearing it falls back to the preview again.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X, MessageSquare, Plus, Loader2, Trash2, Pencil, Check } from 'lucide-react';
import { Button }     from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn }         from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNowStrict, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';

import {
  useSessions,
  useSessionsLoading,
  useHistoryOpen,
  useActiveSessionId,
  useCloseHistory,
  useLoadSessions,
  useSelectSession,
  useNewSession,
  useDeleteSession,
  useRenameSession,
} from '@/store';

type SessionRow = ReturnType<typeof useSessions>[number];

function groupLabel(date: Date): string {
  if (isToday(date))     return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (differenceInCalendarDays(new Date(), date) < 7) return 'This week';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];

export function ChatHistorySidebar() {
  const router        = useRouter();
  const pathname      = usePathname();
  const sessions      = useSessions();
  const loading       = useSessionsLoading();
  const open          = useHistoryOpen();
  const activeId      = useActiveSessionId();
  const closeHistory  = useCloseHistory();
  const loadSessions  = useLoadSessions();
  const selectSession = useSelectSession();
  const newSession    = useNewSession();
  const deleteSession = useDeleteSession();
  const renameSession = useRenameSession();

  // sessionId of the row currently being renamed, plus its draft text.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Load sessions whenever sidebar opens
  useEffect(() => {
    if (open) {
      loadSessions();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the sidebar — unless a row is being renamed, where it
  // cancels that edit first (the input's own onKeyDown does the cancel;
  // this guard just stops the sidebar closing out from under it).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !renamingId) closeHistory();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeHistory, renamingId]);

  // Focus (and select) the rename field as soon as a row enters edit mode.
  useEffect(() => {
    if (!renamingId) return;
    const input = renameInputRef.current;
    input?.focus();
    input?.select();
  }, [renamingId]);

  // Renaming is per-row state; closing the sidebar must not leave a row
  // stuck in edit mode the next time it opens. Adjusted during render
  // rather than in an effect — React re-runs this component immediately
  // instead of committing a frame with the stale edit still open.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setRenamingId(null);
  }

  const startRename = (sessionId: string, currentTitle: string) => {
    setRenamingId(sessionId);
    setDraftTitle(currentTitle);
  };

  const commitRename = async (sessionId: string) => {
    const next = draftTitle;
    setRenamingId(null);
    await renameSession(sessionId, next);
  };

  // The session slice updates the URL with a shallow pushState, which only
  // works while a chat surface is already rendered ('/' or '/chat/[id]').
  // From any other route (/files, /presentations) the page component never
  // changes, so navigate for real with the router.
  const onChatSurface = pathname === '/' || pathname.startsWith('/chat');

  const handleSelect = async (sessionId: string) => {
    closeHistory();
    if (!onChatSurface) {
      router.push(`/chat/${sessionId}`);
      return;
    }
    if (sessionId === activeId) return;
    await selectSession(sessionId);
  };

  const handleNew = () => {
    closeHistory();
    newSession();
    if (!onChatSurface) router.push('/');
  };

  const grouped = useMemo(() => {
    const visible = sessions.filter(s => (s.messageCount ?? 0) > 0);
    const groups = new Map<string, SessionRow[]>();
    for (const s of visible) {
      const label = groupLabel(new Date(s.createdAt));
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(s);
    }
    return GROUP_ORDER
      .filter(label => groups.has(label))
      .map(label => ({ label, items: groups.get(label)! }));
  }, [sessions]);

  const hasSessions = grouped.length > 0;

  return (
    <>
      {/* Scrim — click anywhere outside the panel to close */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeHistory}
            aria-hidden="true"
            className="fixed inset-0 top-14 z-20 bg-black/20 dark:bg-black/40 backdrop-blur-[1px]"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label="Chat history"
        className={cn(
          'fixed top-14 left-0 z-30 h-[calc(100%-56px)] w-72',
          'bg-background border-r border-border',
          'shadow-[4px_0_24px_-4px_rgba(0,0,0,0.12)]',
          'transition-transform duration-300 ease-in-out will-change-transform',
          'overflow-hidden flex flex-col',
          open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between pl-4 pr-2 h-12 border-b border-border/60 shrink-0">
          <span className="font-medium text-sm text-foreground">Chats</span>
          <Button
            variant="ghost" size="icon" className="size-7"
            onClick={closeHistory}
            aria-label="Close chat history"
            title="Close (Esc)"
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* New chat — the primary action, always visible */}
        <div className="p-2 shrink-0">
          <Button
            variant="outline" size="sm"
            className="w-full justify-start gap-2 h-9"
            onClick={handleNew}
          >
            <Plus className="size-3.5" />
            New chat
          </Button>
        </div>

        {/* Session list */}
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="px-2 pb-4 w-72 min-w-0">
            {loading && !hasSessions && (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span className="text-xs">Loading sessions…</span>
              </div>
            )}

            {!loading && !hasSessions && (
              <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                <MessageSquare className="size-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No previous chats yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Conversations appear here once you send a message.
                </p>
              </div>
            )}

            {grouped.map(({ label, items }) => (
              <div key={label} className="mt-2">
                <p className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
                  {label}
                </p>
                <div className="space-y-0.5">
                  {items.map((s) => {
                    const isActive   = s.sessionId === activeId;
                    const isRenaming = s.sessionId === renamingId;
                    // A name the user chose wins; otherwise fall back to the
                    // last message. Previews are raw message text — strip
                    // markdown markers so titles read as plain sentences.
                    const title =
                      s.customTitle?.trim() ||
                      s.preview?.replace(/[*_`#]/g, '').trim() ||
                      s.quarter ||
                      'New conversation';
                    const when = formatDistanceToNowStrict(new Date(s.createdAt), { addSuffix: true });

                    return (
                      // Wrapper div, not nested <button>s — the row actions
                      // are absolutely-positioned siblings of the row button
                      // so the markup stays valid.
                      <div key={s.sessionId} className="relative group">
                        <button
                          onClick={() => handleSelect(s.sessionId)}
                          aria-current={isActive ? 'true' : undefined}
                          disabled={isRenaming}
                          className={cn(
                            'w-full max-w-full text-left pl-2.5 py-2 rounded-lg border transition-colors duration-150 overflow-hidden',
                            isRenaming ? 'pr-9' : 'pr-14',
                            isActive
                              ? 'bg-violet-500/10 border-violet-500/40'
                              : 'bg-transparent border-transparent hover:bg-muted/60',
                          )}
                        >
                          {/* Primary line: the conversation's name */}
                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={() => commitRename(s.sessionId)}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitRename(s.sessionId);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setRenamingId(null);
                                }
                              }}
                              maxLength={120}
                              aria-label="Conversation name"
                              placeholder="Name this conversation"
                              className="w-full bg-transparent text-xs leading-snug text-foreground outline-none border-b border-violet-500/60 pb-0.5"
                            />
                          ) : (
                            <p
                              className={cn(
                                'text-xs truncate leading-snug',
                                isActive
                                  ? 'text-violet-700 dark:text-violet-300 font-medium'
                                  : 'text-foreground',
                              )}
                            >
                              {title}
                            </p>
                          )}
                          {/* Metadata line: quarter tag + relative time */}
                          <p className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground/60 truncate">
                            {s.quarter && (
                              <span className="font-mono uppercase tracking-wide">{s.quarter}</span>
                            )}
                            {s.quarter && <span aria-hidden="true">·</span>}
                            <span>{isRenaming ? 'Enter to save · Esc to cancel' : when}</span>
                          </p>
                        </button>

                        {/* Row actions. While renaming, the only action is
                            "save" — mousedown (not click) so it fires before
                            the input's blur tears the field down. */}
                        {isRenaming ? (
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              commitRename(s.sessionId);
                            }}
                            aria-label="Save conversation name"
                            title="Save name (Enter)"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-md text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
                          >
                            <Check className="size-3.5" />
                          </button>
                        ) : (
                          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            {/* Rename — edits in place, saved via PATCH */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(s.sessionId, s.customTitle ?? '');
                              }}
                              aria-label={`Rename conversation “${title}”`}
                              title="Rename conversation"
                              className="size-6 grid place-items-center rounded-md text-muted-foreground/50 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                            >
                              <Pencil className="size-3.5" />
                            </button>

                            {/* Delete conversation — removes it from Sanity
                                too; confirmed via toast (session slice). */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(s.sessionId);
                              }}
                              aria-label={`Delete conversation “${title}”`}
                              title="Delete conversation"
                              className="size-6 grid place-items-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
