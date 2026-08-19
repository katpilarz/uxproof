'use client';

/**
 * components/chat-interface.tsx — v2 (scope forwarding)
 *
 * CHANGES OVER v1:
 *   The <PresentationPreview> render site was only forwarding `period`
 *   and `downloadUrl`. For year-scope messages that meant the preview
 *   received period="Full Year 2025" with no way to tell the route
 *   which scope to use — route fell through to defaults and produced
 *   the empty Q1 2026 deck.
 *
 *   v2 forwards three more props from the message:
 *     - scope    (from message.presentationScope)
 *     - year     (from message.year)
 *     - quarter  (from message.quarter)
 *
 *   Source chain:
 *     chat_route.ts v2 emits these on the response →
 *     chat-slice.ts v2 stores them on Message →
 *     this file reads them (typed on Message via AssistantMessageMeta) →
 *     PresentationPreview v2 builds the right body for /api/presentations.
 *
 * v1 fixes retained:
 *   1. shouldStream condition: removed !isProcessing gate.
 *   2. MarkdownMessage fallback for empty content.
 *   3. StreamingMessage only for the last unread assistant message.
 */

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence }   from 'framer-motion';
import { Send, Sparkles, FileText, TrendingUp, BarChart3, AlertCircle, Plus } from 'lucide-react';
import { Button }              from '@/components/ui/button';
import { Badge }               from '@/components/ui/badge';
import { Textarea }            from '@/components/ui/textarea';
import { PresentationPreview } from './presentation-preview';
import { WelcomeEmptyState }   from './welcome-empty-state';
import { MessageContextTag }   from './message-context-tag';
import { MarkdownMessage }     from './markdown-message';
import { StreamingMessage }    from './streaming-message';
import { AIThinkingPanel }     from './ai-thinking-panel';

import {
  useMessages,
  useIsProcessing,
  useActiveSessionId,
  useSendMessage,
  useUploadFile,
  useRestoring,
  useIsNewSession,
  usePendingPrompt,
  useSetPendingPrompt,
  useStore,
} from '@/store';

// Kept in sync with /api/files SUPPORTED
const UPLOAD_ACCEPT = '.txt,.md,.markdown,.csv,.json,.pdf';

function getQueryType(msg: string): string {
  const q = msg.toLowerCase();
  if (/\bpresentation|pptx|slides|deck\b/.test(q)) return 'presentation';
  if (/\bvs\.?|versus|compare\b/.test(q))          return 'comparison';
  return 'analysis';
}

const msgVariants = {
  hidden: (role: string) => ({
    opacity: 0, y: role === 'user' ? -4 : 4, x: role === 'user' ? 4 : -4,
  }),
  visible: {
    opacity: 1, y: 0, x: 0,
    transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const panelVariants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

const QUICK_ACTIONS = [
  { icon: Sparkles,   label: 'Generate 2025 presentation',    color: 'text-violet-600 dark:text-violet-400' },
  { icon: BarChart3,    label: 'Compare Q3 vs Q4 2025',         color: 'text-rose-600 dark:text-rose-400' },
  { icon: TrendingUp, label: 'Generate Q1 2026 presentation', color: 'text-emerald-600 dark:text-emerald-400' },
];

export function ChatInterface() {
  const messages        = useMessages();
  const isProcessing    = useIsProcessing();
  const activeSessionId = useActiveSessionId();
  const sendMessage     = useSendMessage();
  const uploadFile      = useUploadFile();
  const restoring       = useRestoring();
  const isNewSession    = useIsNewSession();
  const streamSteps     = useStore(s => s.streamSteps);

  const [input,       setInput]       = useState('');
  const [lastQuery,   setLastQuery]   = useState('');
  const [streamedIds, setStreamedIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file
    if (file && !isProcessing) uploadFile(file);
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  useLayoutEffect(() => {
    if (!restoring && messages.length > 0) scrollToBottom('instant');
  }, [restoring]); // eslint-disable-line

  useEffect(() => {
    if (!restoring) scrollToBottom('smooth');
  }, [messages.length, scrollToBottom]); // eslint-disable-line

  const handleSend = useCallback(async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || isProcessing) return;
    setInput('');
    setLastQuery(content);
    await sendMessage(content, activeSessionId);
  }, [input, isProcessing, activeSessionId, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Active prompts handed over from other pages (/files CTAs): consume the
  // pending prompt once and send it automatically in this fresh session.
  // The claim reads the store directly instead of the render-captured value:
  // StrictMode invokes the effect twice with the same closure, and only an
  // atomic read-then-clear keeps the second invocation from re-sending.
  const pendingPrompt    = usePendingPrompt();
  const setPendingPrompt = useSetPendingPrompt();
  useEffect(() => {
    if (!pendingPrompt || isProcessing || restoring) return;
    const claimed = useStore.getState().pendingPrompt;
    if (!claimed) return;
    setPendingPrompt(null);
    handleSend(claimed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  const queryType  = getQueryType(lastQuery);
  const lastMsgIdx = messages.length - 1;

  const mappedSteps = Object.fromEntries(
    Object.entries(streamSteps).map(([key, step]) => [
      key,
      { status: step.status, duration_ms: step.duration_ms }
    ])
  );

  const renderThinkingBubble = () => (
    <motion.div
      key="thinking"
      variants={panelVariants}
      initial="hidden" animate="visible" exit="exit"
      className="flex gap-4 justify-start"
    >
      <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="size-4 text-white" />
      </div>
      <div className="rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-xs bg-muted/50 border border-border overflow-hidden">
        <AIThinkingPanel
          queryType={queryType}
          isStreaming={Object.keys(mappedSteps).length > 0}
          streamSteps={mappedSteps}
        />
      </div>
    </motion.div>
  );

  const renderMessages = () => {
    if (restoring) {
      return (
        <motion.div key="restoring" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center justify-center h-full gap-2 text-muted-foreground">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          <span className="text-sm">Loading session…</span>
        </motion.div>
      );
    }

    if (isNewSession && messages.length === 0) {
      return (
        <motion.div key="welcome" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}>
          <WelcomeEmptyState />
        </motion.div>
      );
    }

    if (messages.length > 0 || isProcessing) {
      return (
        <motion.div
          key="messages"
          className="max-w-3xl mx-auto space-y-6"
          variants={containerVariants} initial="hidden" animate="visible"
        >
          {messages.map((message, idx) => {
            const isLastAssistant = idx === lastMsgIdx && message.role === 'assistant';
            const shouldStream = isLastAssistant
              && !streamedIds.has(message.id)
              && !message.isError;

            const presentationScope = message.presentationScope;
            const messageYear       = message.year;
            const messageQuarter    = message.quarter;

            return (
              <motion.div
                key={message.id}
                custom={message.role}
                variants={msgVariants}
                layout
                className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="size-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="size-4 text-white" />
                  </div>
                )}

                <div className={`flex flex-col gap-2 max-w-[85%] ${
                  message.role === 'user' ? 'items-end w-auto' : 'items-start w-full'
                }`}>
                  <div className={`px-3 py-2 w-full ${
                    message.role === 'user'
                      ? 'rounded-tl-xl rounded-tr-xl rounded-br-xs rounded-bl-xl bg-[#23233d]/90 text-white dark:bg-[#fafafa] dark:text-black'
                      : message.isError
                      ? 'rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-xs border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30'
                      : 'rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-xs bg-muted/50 border border-border'
                  }`}>

                    {message.isError ? (
                      <div className="flex items-start gap-2">
                        <AlertCircle className="size-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-rose-700 dark:text-rose-300 leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                    ) : message.role === 'assistant' ? (
                      shouldStream ? (
                        <StreamingMessage
                          content={message.content}
                          isStreaming={true}
                          onComplete={() =>
                            setStreamedIds(prev => new Set([...prev, message.id]))
                          }
                        />
                      ) : (
                        <MarkdownMessage content={message.content || '…'} />
                      )
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    )}

                    {message.attachments?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.attachments.map((file, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            <FileText className="size-3 mr-1" />{file.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {message.showPresentation && !message.isError && (
                      <div className="mt-3">
                        <PresentationPreview
                          downloadUrl={message.downloadUrl}
                          slidePlan={message.slidePlan}
                          intelligence={message.intelligence}
                          period={message.contextRef?.quarter}
                          // v2: scope/year/quarter forwarded from the
                          // chat response so the preview can build the
                          // right /api/presentations body. Without these
                          // year-scope messages produce the empty Q1
                          // 2026 default deck.
                          scope={presentationScope}
                          year={messageYear}
                          quarter={messageQuarter}
                          // Auto-start generation only for a message that
                          // just arrived (fresh timestamp) — restored
                          // history must never fire background generations,
                          // and upload follow-ups wait for the user's click
                          // (presentationAutoStart === false).
                          autoStart={
                            isLastAssistant &&
                            !message.downloadUrl &&
                            message.presentationAutoStart !== false &&
                            Date.now() - new Date(message.timestamp).getTime() < 60_000
                          }
                          messageId={message.id}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap px-1 w-full">
                    {message.role === 'assistant' && message.contextRef && !message.isError && (
                      <MessageContextTag
                        project={message.contextRef.project}
                        quarter={message.contextRef.quarter}
                      />
                    )}
                    {message.agentInfo?.processingTime &&
                     !['0.0s', '—', '0s'].includes(message.agentInfo.processingTime) && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        ⚡ {message.agentInfo.processingTime}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}

          <AnimatePresence>
            {isProcessing && renderThinkingBubble()}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </motion.div>
      );
    }

    return (
      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No messages found for this session.</p>
      </motion.div>
    );
  };

  const showQuickActions = isNewSession && messages.length === 0 && !restoring;

  return (
    <div className="flex flex-col h-full w-full">
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-6 py-6 mb-26">
        <AnimatePresence mode="wait">
          {renderMessages()}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background px-6 py-4 w-full">
        <AnimatePresence>
          {showQuickActions && (
            <motion.div
              key="quick-actions"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}
              className="max-w-3xl mx-auto flex justify-center mb-3"
            >
              <div className="flex gap-2 flex-wrap justify-center">
                {/* Data comes from what the user uploads — surface that first */}
                <motion.div
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button
                    variant="outline" size="sm"
                    className="gap-2 hover:bg-muted/60 dark:hover:bg-muted hover:border-border transition-all duration-150"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="size-3.5 text-violet-600 dark:text-violet-400" />
                    <span className="text-xs">Upload a report</span>
                  </Button>
                </motion.div>
                {QUICK_ACTIONS.map((action, i) => (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (i + 1) * 0.05, duration: 0.2 }}
                  >
                    <Button
                      variant="outline" size="sm"
                      className="gap-2 hover:bg-muted/60 dark:hover:bg-muted hover:border-border transition-all duration-150"
                      onClick={() => handleSend(action.label)}
                    >
                      <action.icon className={`size-3.5 ${action.color}`} />
                      <span className="text-xs">{action.label}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-3xl mx-auto mb-4">
          {/* Pill input: fully rounded container, + for file upload on the
              left, circular send button on the right. */}
          <div className="relative flex items-center gap-2 p-2 pl-2.5 bg-muted/50 border border-border/50 rounded-full backdrop-blur focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 transition-all duration-300">
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              className="hidden"
              onChange={handleFileChosen}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              aria-label="Upload a research file or report"
              title="Upload a report (CSV, JSON, TXT, Markdown, PDF)"
              className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4" />
            </Button>
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your uploaded reports, or request a presentation…"
              className="min-h-[40px] max-h-[120px] resize-none !bg-transparent border-0 focus-visible:ring-0 text-sm leading-relaxed"
            />
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || isProcessing}
              aria-label="Send message"
              className={`shrink-0 rounded-full transition-all duration-200 ${
                !input.trim() || isProcessing
                  ? 'opacity-50 cursor-not-allowed'
                  : 'bg-primary hover:bg-violet-600 shadow-md'
              }`}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}