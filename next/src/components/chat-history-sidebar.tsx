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
 */

import { useEffect, useMemo } from 'react';
import { X, MessageSquare, Plus, Loader2, Trash2 } from 'lucide-react';
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
  const sessions      = useSessions();
  const loading       = useSessionsLoading();
  const open          = useHistoryOpen();
  const activeId      = useActiveSessionId();
  const closeHistory  = useCloseHistory();
  const loadSessions  = useLoadSessions();
  const selectSession = useSelectSession();
  const newSession    = useNewSession();
  const deleteSession = useDeleteSession();

  // Load sessions whenever sidebar opens
  useEffect(() => {
    if (open) {
      loadSessions();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the sidebar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHistory();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeHistory]);

  const handleSelect = async (sessionId: string) => {
    closeHistory();
    if (sessionId === activeId) return;
    await selectSession(sessionId);
  };

  const handleNew = () => {
    closeHistory();
    newSession();
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
                    const isActive = s.sessionId === activeId;
                    // Previews are raw message text — strip markdown markers
                    // so titles read as plain sentences.
                    const title =
                      s.preview?.replace(/[*_`#]/g, '').trim() ||
                      s.quarter ||
                      'New conversation';
                    const when     = formatDistanceToNowStrict(new Date(s.createdAt), { addSuffix: true });

                    return (
                      // Wrapper div, not nested <button>s — the delete
                      // action is an absolutely-positioned sibling of the
                      // row button so the markup stays valid.
                      <div key={s.sessionId} className="relative group">
                        <button
                          onClick={() => handleSelect(s.sessionId)}
                          aria-current={isActive ? 'true' : undefined}
                          className={cn(
                            'w-full max-w-full text-left pl-2.5 pr-8 py-2 rounded-lg border transition-colors duration-150 overflow-hidden',
                            isActive
                              ? 'bg-muted border-foreground/30'
                              : 'bg-transparent border-transparent hover:bg-muted/60',
                          )}
                        >
                          {/* Primary line: what the conversation was about */}
                          <p
                            className={cn(
                              'text-xs truncate leading-snug',
                              isActive
                                ? 'text-foreground font-medium'
                                : 'text-foreground',
                            )}
                          >
                            {title}
                          </p>
                          {/* Metadata line: quarter tag + relative time */}
                          <p className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground/60 truncate">
                            {s.quarter && (
                              <span className="font-mono uppercase tracking-wide">{s.quarter}</span>
                            )}
                            {s.quarter && <span aria-hidden="true">·</span>}
                            <span>{when}</span>
                          </p>
                        </button>

                        {/* Delete conversation — removes it from Sanity too;
                            confirmed via toast (session slice). */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s.sessionId);
                          }}
                          aria-label={`Delete conversation “${title}”`}
                          title="Delete conversation"
                          className={cn(
                            'absolute right-1.5 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-md',
                            'text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors',
                            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                          )}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
