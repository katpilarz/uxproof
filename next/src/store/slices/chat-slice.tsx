/**
 * store/slices/chat-slice.ts — v2 (scope forwarding)
 *
 * CHANGES OVER v1:
 *   Both `messages.push` blocks (SSE branch + JSON branch) now also
 *   carry three new fields onto the assistant message:
 *     - presentationScope
 *     - year
 *     - quarter
 *
 *   These come from the chat route's response (chat_route.ts v2). The
 *   chat-interface render reads them and forwards them to
 *   PresentationPreview, which uses them to build the right body for
 *   POST /api/presentations.
 *
 *   Without these the year-scope chat reply ("Generate 2025
 *   presentation") loses its scope between API and UI, the preview
 *   has nothing to disambiguate, and the user gets the empty Q1 2026
 *   default deck.
 *
 * v1 behaviour retained — SSE step events update streamSteps for the
 * AIThinkingPanel, JSON response is parsed and pushed directly.
 */

import { StateCreator } from 'zustand';
import { Message, AIContext } from '@/types';
import type { AppStore } from '../index';
import { makeMsgId, makeTimestamp } from './session-slice';

export interface ChatSliceState {
  messages:          Message[];
  currentView:       'chat' | 'dashboard';
  showDemo:          boolean;
  aiContext:         AIContext;
  loading: {
    chat:         boolean;
    presentation: boolean;
    initialData:  boolean;
  };
  error:             string | null;
  selectedProjectId: string | null;
  streamSteps:       Record<string, { status: string; duration_ms?: number }>;
}

export interface ChatSliceActions {
  sendMessage:          (message: string, sessionId: string, context?: Partial<AIContext>) => Promise<void>;
  resetChat:            () => void;
  setMessages:          (messages: Message[]) => void;
  setView:              (view: 'chat' | 'dashboard') => void;
  setShowDemo:          (show: boolean) => void;
  setAIContext:         (context: AIContext) => void;
  setSelectedProjectId: (id: string | null) => void;
  setLoading:           (type: keyof ChatSliceState['loading'], isLoading: boolean) => void;
  setError:             (error: string | null) => void;
}

export interface ChatSlice extends ChatSliceState, ChatSliceActions {}

export const defaultAIContext: AIContext = {
  projectId: 'UX Research Report',
  quarter:   'Q1 2026',
  year:      new Date().getFullYear(),
};

const initialState: ChatSliceState = {
  messages:          [],
  currentView:       'chat',
  showDemo:          true,
  aiContext:         defaultAIContext,
  loading: {
    chat:         false,
    presentation: false,
    initialData:  true,
  },
  error:             null,
  selectedProjectId: null,
  streamSteps:       {},
};

// ─── SSE stream reader ────────────────────────────────────────────────────────

async function readSSEStream(
  response: Response,
  onStep:  (steps: Record<string, any>) => void,
): Promise<{
  content:            string;
  slidePlan:          any;
  intelligence:       any;
  downloadUrl:        string | null;
  showPresentation:   boolean;
  elapsed:            string;
  contextRef?:        { project: string; quarter: string };
  presentationScope?: 'quarter' | 'year';
  year?:              number;
  quarter?:           string;
  isError:            boolean;
}> {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: ')) continue;
      if (!line.startsWith('data: '))  continue;

      try {
        const raw   = line.slice(6);
        const event = JSON.parse(raw);

        if (event.event === 'step' || event.event === 'tool_start' || event.event === 'tool_done') {
          onStep(event.steps || {});
        }

        if (event.event === 'done') {
          return {
            content:           event.content          || '',
            slidePlan:         event.slidePlan         ?? null,
            intelligence:      event.intelligence      ?? null,
            downloadUrl:       event.downloadUrl       ?? null,
            showPresentation:  event.showPresentation  ?? false,
            elapsed:           event.elapsed           || '—',
            contextRef:        event.contextRef,
            presentationScope: event.presentationScope,
            year:              event.year,
            quarter:           event.quarter,
            isError:           false,
          };
        }

        if (event.event === 'error') {
          return {
            content:          event.message || 'The AI pipeline encountered an error.',
            slidePlan:        null,
            intelligence:     null,
            downloadUrl:      null,
            showPresentation: false,
            elapsed:          '—',
            isError:          true,
          };
        }
      } catch { /* malformed line */ }
    }
  }

  return {
    content:          'The pipeline completed but returned no content. Please try again.',
    slidePlan:        null,
    intelligence:     null,
    downloadUrl:      null,
    showPresentation: false,
    elapsed:          '—',
    isError:          true,
  };
}

// ─── Slice ────────────────────────────────────────────────────────────────────

export const createChatSlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  ChatSlice
> = (set, get) => ({
  ...initialState,

  sendMessage: async (message, sessionId, context = {}) => {
    const isNew = get().isNewSession;

    // Snapshot the last few turns BEFORE pushing the new user message —
    // sent to the chat route so the LLM layer can handle follow-ups
    // ("and how does that compare to last quarter?").
    const history = get().messages.slice(-6).map(m => ({
      role:    m.role,
      content: (m.content || '').slice(0, 500),
    }));

    set(s => {
      s.loading.chat = true;
      s.error        = null;
      s.streamSteps  = {};
      s.messages.push({
        id:        makeMsgId(),
        role:      'user',
        content:   message,
        timestamp: new Date(makeTimestamp()),
      });
    });

    if (isNew) {
      set(s => { s.isNewSession = false; });
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', `/chat/${sessionId}`);
      }
    }

    const aiContext = get().aiContext;

    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message,
          context:      { ...aiContext, ...context },
          sessionId,
          isNewSession: isNew,
          history,
        }),
        signal: AbortSignal.timeout(200_000),
      });

      const contentType = response.headers.get('content-type') || '';

      // ── SSE stream response ────────────────────────────────────────────────
      if (contentType.includes('text/event-stream')) {
        const result = await readSSEStream(response, (steps) => {
          set(s => { s.streamSteps = steps; });
        });

        set(s => {
          s.streamSteps = {};
          // v2: cast the new fields onto the Message dict. Once the
          // Message type is updated, this cast can be removed.
          s.messages.push({
            id:               makeMsgId(),
            role:             'assistant',
            content:          result.content || 'No response received.',
            timestamp:        new Date(makeTimestamp()),
            agentInfo:        { agent: 'Agent Pipeline', processingTime: result.elapsed },
            processingType:   result.showPresentation ? 'presentation' : 'analysis',
            showPresentation: result.showPresentation,
            downloadUrl:      result.downloadUrl ?? undefined,
            slidePlan:        result.slidePlan   ?? undefined,
            intelligence:     result.intelligence ?? undefined,
            contextRef:       result.contextRef ?? {
              project: aiContext.projectId,
              quarter: aiContext.quarter,
            },
            isError:   result.isError,
            isTimeout: false,
            // v2: new fields
            presentationScope: result.presentationScope,
            year:              result.year,
            quarter:           result.quarter,
          } as Message);
        });
        return;
      }

      // ── JSON response ──────────────────────────────────────────────────────
      const data = await response.json();

      set(s => {
        s.messages.push({
          id:               makeMsgId(),
          role:             'assistant',
          content:          data.content || 'No response received.',
          timestamp:        new Date(makeTimestamp()),
          agentInfo:        data.agentInfo,
          processingType:   data.processingType,
          showPresentation: data.showPresentation ?? false,
          downloadUrl:      data.downloadUrl   ?? undefined,
          slidePlan:        data.slidePlan     ?? undefined,
          intelligence:     data.intelligence  ?? undefined,
          contextRef:       data.contextRef ?? {
            project: aiContext.projectId,
            quarter: aiContext.quarter,
          },
          isError:   data.isError   ?? false,
          isTimeout: data.isTimeout ?? false,
          // v2: scope + year + quarter from chat route v2 response.
          presentationScope: data.presentationScope,
          year:              data.year,
          quarter:           data.quarter,
        } as Message);
      });

    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');

      set(s => {
        s.streamSteps = {};
        s.messages.push({
          id:        makeMsgId(),
          role:      'assistant',
          content:   isTimeout
            ? 'The request timed out. The AI pipeline may be slow — please try again.'
            : 'Failed to generate the requested content. Please try again.',
          timestamp: new Date(makeTimestamp()),
          isError:   true,
          isTimeout,
        });
        s.error = error instanceof Error ? error.message : 'An error occurred';
      });
    } finally {
      set(s => {
        s.loading.chat = false;
        s.streamSteps  = {};
      });
    }
  },

  resetChat: () => set(s => {
    s.messages     = [];
    s.currentView  = 'chat';
    s.aiContext     = defaultAIContext;
    s.error         = null;
    s.loading.chat  = false;
    s.streamSteps   = {};
  }),

  setMessages:          (messages) => set(s => { s.messages = messages; }),
  setView:              (view)     => set(s => { s.currentView = view; }),
  setShowDemo:          (show)     => set(s => { s.showDemo = show; }),
  setAIContext:         (ctx)      => set(s => {
    s.aiContext         = ctx;
    s.selectedProjectId = ctx.projectId;
  }),
  setSelectedProjectId: (id) => set(s => { s.selectedProjectId = id; }),
  setLoading: (type, val)    => set(s => { s.loading[type] = val; }),
  setError:   (error)        => set(s => { s.error = error; }),
});