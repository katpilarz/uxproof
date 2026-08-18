// app/api/chat/route.ts — v3
//
// CHANGES OVER v2:
//   FIXED: build error at line 238. Local `agentInfo` variable was
//   declared with `processingTime: string` (required), but the
//   `response.agentInfo` from unified-agent has `processingTime?: string`
//   (optional). Changed local declaration to match optional shape.
//
// CHANGES OVER v1:
//
//   1. PRESENTATION INTENT NOW DELEGATES TO unified-agent.
//      Previously this route called the agent service directly and ran the response
//      through formatIntelligence(), which produced the "AI Executive
//      Intelligence" markdown dump regardless of whether the user wanted
//      a presentation or an analysis. v2 routes presentation requests
//      through createUnifiedAI() — which detects the year/quarter scope
//      and emits a short summary + CTA. The actual .pptx generation
//      happens later when the user clicks the download button, via
//      POST /api/presentations.
//
//   2. YEAR-SCOPE DETECTION.
//      detectScope() classifies a presentation request as 'year' or
//      'quarter' based on whether a Qn token is present alongside the
//      year. The previous extractPeriod() always returned a quarter
//      (defaulting to Q4 for bare-year queries), which is why "Generate
//      2025 presentation" was producing a Q4 deck.
//
//   3. scope + year FORWARDED IN THE RESPONSE.
//      The response now carries `presentationScope` and `year` so the
//      front-end's "Generate & download .pptx" handler can pass them
//      through to /api/presentations.
//
//   4. DEEP path unchanged. "Deep analysis Q3 2025" still calls the agent service
//      and uses formatIntelligence() to render the full report — that's
//      what the user is actually asking for in that case.

import { NextRequest, NextResponse } from 'next/server';
import { createUnifiedAI } from '@/lib/agents/unified-agent';
import { AIContext } from '@/types';
import { createChatSession, appendMessageToSession } from '@/lib/sanity';

const AGENT_SERVICE = process.env.AGENT_SERVICE_URL || 'http://localhost:8001';

// Local LLM for conversational answers (same Ollama instance the agent
// service uses). All numbers still come from Sanity via unified-agent —
// the model only rephrases retrieved facts to address the actual question.
const OLLAMA_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'qwen2.5:14b';

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

/**
 * Rewrite a data-grounded template answer into a conversational reply that
 * actually addresses the user's question.
 *
 * Grounding contract (see CLAUDE.md "the LLM never invents data"):
 *   - The FACTS block is the unified-agent's deterministic output — every
 *     number in it came from Sanity.
 *   - The model is instructed to use only those facts.
 *   - A post-check verifies every number in the reply exists in the facts;
 *     any violation discards the rewrite.
 *
 * Returns null on ANY failure (Ollama down, timeout, guardrail) — the
 * caller then keeps the deterministic template, so this layer is a pure
 * enhancement with no availability cost.
 */
async function conversationalize(
  question: string,
  facts: string,
  history: HistoryTurn[],
): Promise<string | null> {
  try {
    const historyBlock = history.length
      ? history
          .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content.slice(0, 400)}`)
          .join('\n')
      : '(none)';

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    OLLAMA_MODEL,
        stream:   false,
        options:  { temperature: 0.3, num_predict: 400 },
        messages: [
          {
            role: 'system',
            content:
              'You are the uxproof research assistant, a UX research analyst. ' +
              'Answer the user\'s question directly and conversationally, in GitHub-flavoured markdown. ' +
              'Use ONLY the facts provided — never invent numbers, periods, findings or trends. ' +
              'Quote numbers exactly as written in the facts. ' +
              'Lead with the answer to the specific question; add at most 2-3 supporting facts that are genuinely relevant. ' +
              'Do NOT dump every metric — select what answers the question. ' +
              'If the facts do not contain what was asked, say so plainly and mention what data IS available. ' +
              'Keep it under 120 words. No greetings, no sign-offs.',
          },
          {
            role: 'user',
            content:
              `FACTS (retrieved from the research database — the only source you may use):\n${facts}\n\n` +
              `CONVERSATION SO FAR:\n${historyBlock}\n\n` +
              `QUESTION: ${question}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;
    const data  = await res.json();
    const reply = (data?.message?.content ?? '').trim();
    if (reply.length < 20) return null;

    // Guardrail: every substantial number in the reply must appear in the
    // facts OR the conversation history (earlier grounded answers are a
    // legitimate source for follow-ups). Small integers (list markers,
    // "8-slide"), years, and the SUS scale maximum (…"/ 100") are allowed.
    const allowedDigits = (facts + '\n' + history.map(h => h.content).join('\n')).replace(/,/g, '');
    for (const num of reply.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []) {
      const value = parseFloat(num);
      if (value <= 12 && Number.isInteger(value)) continue;      // small counts
      if (value === 100) continue;                               // "79.4 / 100" scale mention
      if (value >= 2020 && value <= 2030 && Number.isInteger(value)) continue; // years
      if (!allowedDigits.includes(num)) {
        console.warn('[chat/route] LLM guardrail: number not in facts:', num);
        return null;
      }
    }
    return reply;
  } catch (e) {
    console.warn('[chat/route] conversationalize unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Intent classification ────────────────────────────────────────────────────

function classifyMessage(message: string): 'casual' | 'presentation' | 'deep' | 'data' {
  const lower = message.toLowerCase().trim();
  const hasData = /\b(q[1-4]|quarter|sus|nps|task success|error rate|conversion|participant|usability|kpi|metric|issue|finding|insight|report|research|performance|compare|versus|year|annual|2[0-9]{3}|h[12]|half|analyse|analyze|analysis|overview|summary|accessib)\b/i.test(message);

  if (!hasData) {
    const isMeta =
      /^(hi|hello|hey|howdy)\b/.test(lower) ||
      /^how are you/.test(lower) ||
      /^good (morning|afternoon|evening)/.test(lower) ||
      /^(thanks|thank you)\b/.test(lower) ||
      /how (can|do) you help/.test(lower) ||
      /what can you do/.test(lower) ||
      /who are you/.test(lower) ||
      /^help\b/.test(lower) ||
      /^(ok|okay|cool|great|got it)\b/.test(lower) ||
      /^(bye|goodbye)\b/.test(lower);
    if (isMeta) return 'casual';
  }

  if (/\bpresentation|powerpoint|pptx|slides|deck\b/i.test(message)) return 'presentation';
  if (/\bdeep\s+analysis|ai\s+analysis|executive\s+summary|full\s+report|summarise|summarize\b/i.test(lower)) return 'deep';

  return 'data';
}

// ─── Casual response ──────────────────────────────────────────────────────────

function casualReply(message: string): string {
  const q = message.toLowerCase().trim();
  if (/^(hi|hello|hey)\b/.test(q) || /^good (morning|afternoon|evening)/.test(q)) {
    return `Hello! I'm the **uxproof research assistant**.\n\nI can help you with:\n\n• **Analyse a quarter** — _"Analyse Q3 2025"_ or _"What is the SUS score for Q4 2025?"_\n• **Compare periods** — _"Compare Q3 vs Q4 2025"_\n• **Full year overviews** — _"Full year 2025 overview"_\n• **Generate presentations** — _"Generate Q4 2025 presentation"_ or _"Generate 2025 presentation"_\n• **Deep AI analysis** — _"Deep analysis Q3 2025"_\n\nWhat would you like to explore?`;
  }
  if (/how (can|do) you help/.test(q) || /what can you do/.test(q) || /^help\b/.test(q)) {
    return `I'm the **uxproof research assistant** — I turn UX research data into client-ready insights and presentations.\n\n**I can:**\n\n• Query SUS, task success, NPS, error-rate and conversion data from any quarter\n• Compare two periods side by side\n• Run AI-powered deep analysis via the agent pipeline\n• Generate 8-slide .pptx research decks\n\n**Try:**\n\n• _"What is the SUS score for Q4 2025?"_\n• _"Compare Q3 vs Q4 2025"_\n• _"Generate 2025 presentation"_`;
  }
  if (/who are you/.test(q)) return `I'm the **uxproof research assistant**. Try: _"Generate Q4 2025 presentation"_ or _"Analyse Q3 2025"_`;
  if (/^how are you/.test(q)) return `Ready to help with your UX research reporting! Try: _"Analyse Q3 2025"_`;
  if (/^(thanks|thank you)/.test(q)) return `You're welcome! Let me know if you need any other analysis or a presentation.`;
  return `I can help you analyse UX research data and generate presentations. Try: _"Analyse Q3 2025"_`;
}

/**
 * Follow-up questions ("and how does that compare to last quarter?") carry
 * no explicit period, so the deterministic agent finds nothing. If the
 * message lacks a period reference, borrow the most recent one mentioned
 * in the conversation and append it, so intent + data resolution work.
 */
function resolvePeriodFromHistory(message: string, history: HistoryTurn[]): string {
  if (/\b(q[1-4]|20\d{2})\b/i.test(message)) return message;
  for (let i = history.length - 1; i >= 0; i--) {
    const m =
      history[i].content.match(/\bQ[1-4]\s*20\d{2}\b/i) ||
      history[i].content.match(/\b20\d{2}\b/);
    if (m) return `${message} (${m[0]})`;
  }
  return message;
}

// ─── Period extractor + scope detector ────────────────────────────────────────

function extractPeriod(message: string): { quarter: string; year: number } {
  const lower = message.toLowerCase();
  const explicit = lower.match(/\b(q[1-4])\s*(\d{4})\b/);
  if (explicit) return { quarter: explicit[1].toUpperCase(), year: parseInt(explicit[2]) };
  const quarterOnly = lower.match(/\b(q[1-4])\b/);
  if (quarterOnly) return { quarter: quarterOnly[1].toUpperCase(), year: new Date().getFullYear() };
  const yearOnly = lower.match(/\b(20\d{2})\b/);
  if (yearOnly) return { quarter: 'Q4', year: parseInt(yearOnly[1]) };
  return { quarter: 'Q1', year: 2026 };
}

/**
 * Classify a presentation request as year-scope or quarter-scope.
 *   "Generate 2025 presentation"      → 'year'
 *   "Full year 2025 presentation"     → 'year'
 *   "Generate Q3 2025 presentation"   → 'quarter'
 *   "Generate the latest presentation"→ 'quarter' (default)
 *
 * Rule: a bare 20XX year WITHOUT a Qn anywhere in the query is year-scope.
 * If Qn is present, it's a quarter request regardless of year format.
 */
function detectScope(message: string): 'year' | 'quarter' {
  const lower      = message.toLowerCase();
  const hasQuarter = /\bq[1-4]\b/.test(lower);
  const hasYear    = /\b20\d{2}\b/.test(lower);
  if (hasYear && !hasQuarter) return 'year';
  if (/\bfull year\b/.test(lower)) return 'year';
  return 'quarter';
}

// ─── Agent-pipeline intelligence formatter (used by 'deep' intent only) ─────────────

function formatIntelligence(
  intelligence: Record<string, any>,
  context: Record<string, any>,
  ms: number,
): string {
  const period     = context?.period    || 'Unknown Period';
  const summary    = intelligence?.executive_summary || '';
  const kpis       = intelligence?.kpi_summaries     || [];
  const signals    = intelligence?.metric_signals    || [];
  const issues     = intelligence?.issue_highlights  || [];
  const strategic  = intelligence?.strategic_signals || [];
  const confidence = intelligence?.confidence_score  || 0;

  const arw = (t: string) => t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
  const sgn = (n: number) => n >= 0 ? '+' : '';
  const sev: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };

  const kpiRows = kpis.map((k: any) =>
    `| ${k.label} | **${k.value}** | ${arw(k.trend)} ${sgn(k.change)}${k.change}% | ${k.insight || '—'} |`
  ).join('\n');

  const parts = [
    `**${period} — AI Research Intelligence**\n`,
    summary,
    '',
    '---',
    '',
    kpis.length    ? `**KPI Summary**\n| Metric | Value | Change | Insight |\n|---|---|---|---|\n${kpiRows}` : '',
    '',
    signals.length ? `**Metric Signals**\n${signals.map((s: any) => `• **${s.metric}**: ${s.narrative}`).join('\n')}` : '',
    '',
    issues.length  ? `**Issue Highlights**\n${issues.map((r: any) =>
      `• ${sev[r.severity?.toLowerCase()] || '•'} **${r.title}**\n  ${r.signal}\n  _Recommendation: ${r.recommendation}_`
    ).join('\n\n')}` : '',
    '',
    strategic.length ? `**Recommended Actions**\n${strategic.map((s: string) => `• ${s}`).join('\n')}` : '',
    '',
    '---',
    `_AI confidence: ${Math.round(confidence * 100)}% · ${(ms / 1000).toFixed(1)}s_`,
  ];

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Agent-pipeline call (deep intent only) ───────────────────────────────────

async function callAgentPipeline(message: string) {
  const { quarter, year } = extractPeriod(message);

  const t0  = Date.now();
  const res = await fetch(`${AGENT_SERVICE}/api/agents/run`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      task:    message,
      // Deep analysis uses 'single' mode — the orchestrator returns
      // intelligence for one quarter with delta vs previous quarter.
      context: { quarter, year, mode: 'single' },
      agents:  ['context', 'extraction'],
    }),
    signal: AbortSignal.timeout(200_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Agent service error (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.status !== 'completed') {
    throw new Error(data.error || 'Agent pipeline did not complete');
  }

  return {
    content:      formatIntelligence(data.intelligence || {}, data.context || {}, Date.now() - t0),
    intelligence: data.intelligence ?? null,
    elapsed:      `${((Date.now() - t0) / 1000).toFixed(1)}s`,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let message = '';

  try {
    const body = await request.json();
    message    = (body.message ?? '').trim();
    const { context, sessionId, isNewSession } = body;
    const history: HistoryTurn[] = Array.isArray(body.history)
      ? body.history
          .filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h?.content === 'string')
          .slice(-6)
      : [];

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    console.log('[chat/route] message:', message, '| sessionId:', sessionId);

    const aiContext: AIContext = {
      projectId: context?.project || 'UX Research Report',
      quarter:   context?.quarter || 'Q1 2026',
      year:      new Date().getFullYear(),
    };

    // Persist sequentially and AWAIT: previously these were fire-and-forget,
    // so createOrReplace could race in after the append and wipe the user
    // message, and the assistant append could land before the user's —
    // which is exactly the reversed/missing history users saw.
    if (sessionId) {
      try {
        if (isNewSession) {
          await createChatSession(sessionId, { quarter: aiContext.quarter });
        }
        await appendMessageToSession(sessionId, {
          messageId: `msg_${Date.now()}_user`,
          role:      'user',
          content:   message,
        });
      } catch (e) {
        console.warn('[chat/route] session persistence failed:', e);
      }
    }

    // Follow-ups inherit the last-mentioned period from history.
    const resolvedMessage     = resolvePeriodFromHistory(message, history);
    const intent              = classifyMessage(resolvedMessage);
    const { quarter, year }   = extractPeriod(resolvedMessage);
    const scope               = detectScope(resolvedMessage);

    console.log('[chat/route] intent:', intent, '| period:', quarter, year, '| scope:', scope);

    let responseContent:     string  = '';
    let processingType:      'analysis' | 'comparison' | 'presentation' = 'analysis';
    let agentInfo:           { agent: string; processingTime?: string };
    let slidePlan:           any     = null;
    let intelligence:        any     = null;
    let downloadUrl:         string | null = null;
    let showPresentation:    boolean = false;
    let presentationScope:   'quarter' | 'year' | undefined = undefined;
    let contextRefOverride:  { project: string; quarter: string } | undefined = undefined;

    if (intent === 'casual') {
      // Casual / meta — local reply, no Sanity, no agent service, no contextRef
      responseContent    = casualReply(message);
      agentInfo          = { agent: 'uxproof assistant', processingTime: '0.0s' };
      contextRefOverride = undefined; // signal "no footer" downstream

    } else if (intent === 'presentation') {
      // v2 CHANGE: presentation intent goes through unified-agent so we
      // get the short summary + CTA, not the full executive report. The
      // actual .pptx is generated later when the user clicks the
      // "Generate & download .pptx" button — that handler POSTs to
      // /api/presentations with the scope + year/quarter forwarded below.
      const unifiedAI    = createUnifiedAI(aiContext);
      const response     = await unifiedAI.processQuery(resolvedMessage);
      responseContent    = response.content ?? '';
      processingType     = 'presentation';
      showPresentation   = true;
      presentationScope  = response.presentationScope ?? scope;
      // unified-agent's contextRef carries the resolved period label
      // (e.g. "Full Year 2025"), which we honour.
      contextRefOverride = response.contextRef;
      agentInfo          = response.agentInfo || { agent: 'uxproof assistant', processingTime: '—' };

    } else if (intent === 'deep') {
      // Deep analysis still uses the agent pipeline + the full-report formatter —
      // that's what the user explicitly asked for ("deep analysis…",
      // "full report…", "executive summary…").
      const result     = await callAgentPipeline(resolvedMessage);
      responseContent  = result.content;
      intelligence     = result.intelligence;
      processingType   = 'analysis';
      agentInfo        = { agent: 'Agent Pipeline', processingTime: result.elapsed };

    } else {
      // 'data' — short factual queries: "SUS score for Q4 2025",
      // "compare Q3 vs Q4", "analyse Q3 2025", "full year 2025", etc.
      // unified-agent decides metric vs analysis vs comparison vs year.
      const unifiedAI = createUnifiedAI(aiContext);
      const response  = await unifiedAI.processQuery(resolvedMessage);

      console.log('[chat/route] unifiedAI response length:', response.content?.length ?? 0);

      responseContent    = response.content ?? '';
      processingType     = (response.processingType || 'analysis') as typeof processingType;
      agentInfo          = response.agentInfo || { agent: 'uxproof assistant', processingTime: '—' };
      showPresentation   = response.showPresentation ?? false;
      presentationScope  = response.presentationScope;
      contextRefOverride = response.contextRef;
      if (showPresentation) processingType = 'presentation';

      // Conversational layer: rephrase the deterministic template through
      // the local LLM so the reply addresses the QUESTION instead of
      // dumping the whole record. Falls back to the template untouched
      // when Ollama is unavailable or the guardrail trips.
      if (!showPresentation && responseContent.trim()) {
        const t0 = Date.now();
        const conversational = await conversationalize(message, responseContent, history);
        if (conversational) {
          responseContent = conversational;
          agentInfo = {
            agent:          `uxproof assistant · ${OLLAMA_MODEL}`,
            processingTime: `${((Date.now() - t0) / 1000).toFixed(1)}s`,
          };
        }
      }
    }

    // Hard guard — never return empty content
    if (!responseContent?.trim()) {
      console.warn('[chat/route] empty responseContent for intent:', intent, 'message:', message);
      responseContent = `I couldn't find data for that request. Available data spans **Q1 2024 – Q1 2026**.\n\nTry:\n• _"Analyse Q3 2025"_\n• _"Full year 2025"_\n• _"Compare Q3 vs Q4 2025"_\n• _"Generate 2025 presentation"_`;
    }

    // contextRef computed BEFORE persistence so the stored assistant
    // message carries the resolved period label for history restore.
    // (Declaration moved up — see contextRef rules comment below.)

    // contextRef rules:
    //   - casual messages → no footer (intent='casual' sets it to undefined)
    //   - presentation/data with year scope → label says "2025"
    //   - everything else → "Q3 2025" style label
    const contextRef = contextRefOverride !== undefined
      ? contextRefOverride
      : intent === 'casual'
        ? undefined
        : {
            project: aiContext.projectId,
            quarter: scope === 'year' ? `${year}` : `${quarter} ${year}`,
          };

    // Persist the assistant message WITH its presentation metadata so
    // history restore can re-render the presentation card.
    if (sessionId) {
      try {
        await appendMessageToSession(sessionId, {
          messageId:         `msg_${Date.now()}_assistant`,
          role:              'assistant',
          content:           responseContent,
          showPresentation,
          presentationScope,
          year:              showPresentation ? year    : undefined,
          quarter:           showPresentation ? quarter : undefined,
          contextQuarter:    contextRef?.quarter,
        });
      } catch (e) {
        console.warn('[chat/route] appendMessageToSession (assistant) failed:', e);
      }
    }

    return NextResponse.json({
      id:               Date.now().toString(),
      role:             'assistant',
      content:          responseContent,
      timestamp:        new Date(),
      agentInfo,
      contextRef,
      showPresentation,
      processingType,
      // v2: forward scope + year so the "Generate & download .pptx"
      // button can pass them to POST /api/presentations.
      presentationScope,
      year:             intent === 'presentation' || intent === 'data' ? year     : undefined,
      quarter:          intent === 'presentation' || intent === 'data' ? quarter  : undefined,
      slidePlan,
      intelligence,
      downloadUrl,
      isError:          false,
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[chat/route] ERROR:', errMsg);

    return NextResponse.json({
      id:               Date.now().toString(),
      role:             'assistant',
      content:          errMsg.includes('Agent service') || errMsg.includes('fetch')
        ? 'The AI pipeline could not be reached. Please check that the agent service is running and try again.'
        : `Failed to generate the requested content. ${errMsg}`,
      timestamp:        new Date(),
      agentInfo:        { agent: 'uxproof assistant', processingTime: '—' },
      contextRef:       { project: 'UX Research Report', quarter: extractPeriod(message).quarter },
      showPresentation: false,
      processingType:   'analysis',
      isError:          true,
    });
  }
}