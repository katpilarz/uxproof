'use client';

import { useEffect } from 'react';
import { X, MessageSquare, Clock, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { Button }     from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn }         from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import {
  useSessions,
  useSessionsLoading,
  useHistoryOpen,
  useActiveSessionId,
  useCloseHistory,
  useLoadSessions,
  useSelectSession,
  useNewSession,
} from '@/store';

export function ChatHistorySidebar() {
  const sessions      = useSessions();
  const loading       = useSessionsLoading();
  const open          = useHistoryOpen();
  const activeId      = useActiveSessionId();
  const closeHistory  = useCloseHistory();
  const loadSessions  = useLoadSessions();
  const selectSession = useSelectSession();
  const newSession    = useNewSession();

  // Load sessions whenever sidebar opens
  useEffect(() => {
    if (open) {
      loadSessions();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = async (sessionId: string) => {
    if (sessionId === activeId) return;
    await selectSession(sessionId);
  };

  const handleNew = () => {
    newSession();
  };

  const listVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      filter: 'blur(4px)',
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div
      aria-label="Chat history"
      className={cn(
        'fixed top-14 left-0 z-30 h-[calc(100%-56px)] w-72',
        'bg-background/95 backdrop-blur-md border-r border-border',
        'shadow-[4px_0_24px_-4px_rgba(0,0,0,0.12)]',
        'transition-transform duration-300 ease-in-out will-change-transform',
        'overflow-hidden', // ← prevent any child overflow leaking outside sidebar
        open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pl-4 pr-2 h-12 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-muted-foreground truncate">
            Previous Chats
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={handleNew}>
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>New chat</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" onClick={closeHistory}>
                <X className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Close</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Session list — w-full + min-w-0 keep children bounded to sidebar width */}
      <ScrollArea className="h-[calc(100%-48px)] w-full">
        <div className="p-2 space-y-1 w-72 min-w-0">

          {(() => {
            const visibleSessions = sessions.filter(s => (s.messageCount ?? 0) > 0);

            return (
              <>
                {loading && (
                  <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="text-xs">Loading sessions…</span>
                  </div>
                )}

                {!loading && visibleSessions.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                    <MessageSquare className="size-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No previous sessions</p>
                    <Button variant="outline" size="sm" className="mt-2 text-xs h-7" onClick={handleNew}>
                      <Plus className="size-3 mr-1" />
                      Start new chat
                    </Button>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  <motion.div
                    variants={listVariants}
                    initial="hidden"
                    animate="visible"
                    className="space-y-1 w-full min-w-0"
                  >
                    {visibleSessions.map((s) => {
                      const isActive = s.sessionId === activeId;

                return (
                  <motion.div
                    key={s.sessionId}
                    variants={itemVariants}
                    layout
                    exit="exit"
                    className="w-full min-w-0"
                  >
                    <button
                      onClick={() => handleSelect(s.sessionId)}
                      className={cn(
                        'w-full max-w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150 group',
                        'overflow-hidden', // ← guarantees nothing inside escapes
                        isActive
                          ? 'bg-violet-500/10 border-violet-500/40 shadow-sm'
                          : 'bg-transparent border-transparent hover:bg-muted/60 hover:border-border/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 w-full min-w-0">
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                            <span
                              className={cn(
                                'text-xs font-medium truncate',
                                isActive
                                  ? 'text-violet-600 dark:text-violet-400'
                                  : 'text-foreground',
                              )}
                            >
                              {s.quarter || 'General'}
                            </span>

                            <span className="text-xs text-muted-foreground/60 shrink-0">
                              · {s.messageCount ?? 0} msg
                              {(s.messageCount ?? 0) !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {s.preview && (
                            <p className="text-xs text-muted-foreground truncate leading-snug">
                              {s.preview}
                            </p>
                          )}

                          <div className="flex items-center gap-1 mt-1 min-w-0">
                            <Clock className="size-2.5 text-muted-foreground/40 shrink-0" />

                            <span className="text-xs text-muted-foreground/40 truncate">
                              {new Date(s.createdAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>

                        <ChevronRight
                          className={cn(
                            'size-3 shrink-0 mt-1 transition-opacity',
                            isActive
                              ? 'text-violet-500 opacity-100'
                              : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100',
                          )}
                        />
                      </div>
                    </button>
                  </motion.div>
                );
                    })}
                  </motion.div>
                </AnimatePresence>
              </>
            );
          })()}
        </div>
      </ScrollArea>
    </div>
    </TooltipProvider>
  );
}