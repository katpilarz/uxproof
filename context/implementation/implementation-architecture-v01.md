---
document: implementation-architecture
version: v01
date: 2026-08-19
agent: documentator
scope: initial full-architecture documentation, including the uncommitted working-tree state (file-upload + summarization feature, chat route v3, unified-agent updates, /files page)
---

# uxproof — Implementation Architecture (v01)

> This document describes the code **as it exists on disk on 2026-08-19**, including
> uncommitted working-tree changes (notably the file-upload/summarization feature:
> `next/src/app/api/files/route.ts`, `next/src/lib/file-analysis.ts`,
> `next/src/components/files-view.tsx`, `next/src/app/files/page.tsx`, plus updates to
> the chat route, unified agent, chat slice, and types). Every claim cites the file it
> was read from.

---

## 1. Overview

uxproof is a single-user-machine internal tool (author: Katarzyna Pilarz) that turns
quarterly UX research data into client-ready, monochrome 8-slide PowerPoint decks.

The workflow is chat-first and **upload-grounded**: a signed-in user uploads research
files through the chat's **+** button; structured data (quarter + year + SUS score) is
parsed — or, for prose documents, extracted by a local LLM under a strict literal-value
guardrail — into user-owned `report` documents in Sanity. The user then asks questions
in plain language ("Analyse Q3 2025", "Compare Q2 vs Q3", "Generate 2025 presentation")
and the system answers from *their* data only, and renders fixed-template `.pptx` decks
on demand.

Two invariants shape everything: **the LLM never invents data** (every number is read
from Sanity or validated to appear literally in an uploaded document), and **every LLM
step has a deterministic fallback** (the product works with Ollama down). Inference is
local-only (Ollama, default `qwen2.5:14b`); research data never leaves the machine.

The bundled demo dataset (client "Aurelo", `sanity-studio/seed-reports.ndjson`) is
fictional and — because seeded reports carry no owner — is ignored by the per-user app
(`next/scripts/purge-global-data.mjs` removes it entirely).

---

## 2. Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │                Browser (React 19)             │
                        │  Zustand store: chat/session/auth/toast slices│
                        │  components/* ('use client'), pages are SSR   │
                        └───────┬───────────────────────────┬──────────┘
                                │ fetch (cookie auth)       │ SSE
                                ▼                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  next/  — Next.js 16 (port 3000)                                          │
│                                                                           │
│  /api/auth/*        HMAC cookie sign-in, user upsert                      │
│  /api/chat          intent routing → unified-agent │ agent pipeline       │
│  /api/files         upload → parse/extract → report + userFile + summary  │
│  /api/sessions*     per-user chat history                                 │
│  /api/presentations slidePlan fetch → (on-demand pipeline) → pptxgenjs    │
│  /agents, /agents/stream, /agents/status/*   proxies to FastAPI           │
│                                                                           │
│  lib/agents/unified-agent.ts   deterministic answer builder               │
│  lib/services/report-query.ts  user-scoped GROQ + intent parsing          │
│  lib/file-analysis.ts          grounded AI summaries + fallback           │
│  lib/ppt-generator.ts + lib/branding/brand.ts   monochrome deck renderer  │
└──────────┬───────────────────────────────┬────────────────┬──────────────┘
           │ GROQ / mutations              │ HTTP            │ /api/chat &
           ▼                               ▼                 ▼ /api/files
┌────────────────────────┐   ┌──────────────────────────┐  ┌───────────────┐
│  Sanity (ygdze74e /    │◄──│ agent-service/ — FastAPI │  │ Ollama        │
│  production)           │   │ (port 8001)              │──►  localhost:   │
│  user, report,         │   │ Coordinator →            │  │  11434        │
│  userFile, chatSession,│   │  Context → Extraction →  │  │  qwen2.5:14b  │
│  presentation,         │   │  Planning (hand-rolled)  │  └───────────────┘
│  executiveIntelligence,│   │ /api/agents/run[/stream] │
│  slidePlan             │   │ /pipeline/run            │
└────────────────────────┘   └──────────────────────────┘

sanity-studio/ (port 3333) — Studio for inspecting/editing the same dataset.
```

---

## 3. Services

### 3.1 `next/` — application, API, deck renderer

| | |
|---|---|
| Stack | Next.js 16.2.6, React 19.2.4, Tailwind 4, Zustand 5, framer-motion, pptxgenjs 4, `unpdf`, `@sanity/client` (`next/package.json`) |
| Start | `cd next && npm run dev` (default port 3000) |
| Entry | `next/src/app/layout.tsx` (wraps every route in `AppShell`), `next/src/app/page.tsx` (root = new chat) |

Key directories:

- `src/app/` — pages and API routes. **Convention (per `CLAUDE.md`, upheld in code):**
  every page/layout is a server component; pages are thin and render a `*-view.tsx`
  client component (`app/page.tsx`, `app/files/page.tsx`, `app/chat/[sessionId]/page.tsx`,
  `app/presentations/page.tsx` all follow this; `app/chat/page.tsx` just redirects to `/`).
- `src/components/` — all `'use client'` components: `app-shell.tsx` (auth gate + chrome),
  `chat-interface.tsx` (messages, pill input, **+** upload button, quick actions),
  `presentation-preview.tsx` (deck card + generation trigger), `files-view.tsx`,
  `presentations-view.tsx`, `chat-history-sidebar.tsx`, `login-screen.tsx`, plus `ui/` primitives.
- `src/store/` — Zustand store composed of four slices (`store/index.ts`):
  `chat-slice.tsx` (messages, `sendMessage`, `uploadFile`, `pendingPrompt` handoff),
  `session-slice.tsx` (active session, history restore via `/api/sessions/*`),
  `auth-slice.tsx`, `toast-slice.tsx`.
- `src/lib/` — `sanity.ts` (clients + all GROQ helpers), `services/report-query.ts`
  (user-scoped report fetch + period-intent parsing), `agents/unified-agent.ts`
  (deterministic response builder), `file-analysis.ts` (grounded summaries),
  `auth.ts` (cookie/session helpers), `ppt-generator.ts` + `ppt-assets.ts` +
  `branding/brand.ts` (deck rendering), `lm-studio.ts` (optional, **not wired into the
  main pipeline** — kept as a drop-in alternative per its header comment).
- `scripts/purge-global-data.mjs` — deletes unowned seed reports/presentations and all
  derived `slidePlan` / intelligence docs (`npm run purge:global-data`).

### 3.2 `agent-service/` — FastAPI multi-agent pipeline

| | |
|---|---|
| Stack | FastAPI, Pydantic v2, httpx, sse-starlette, python-dotenv (`agent-service/requirements.txt`) |
| Start | `cd agent-service && uvicorn main:app --port 8001` (venv `.venv`) |
| Entry | `agent-service/main.py` |

Layout: `agents/` (`coordinator_agent.py`, `context_agent.py`, `extraction_agent.py`,
`planning_agent.py`), `orchestration/` (`pipeline.py` thin wrapper, `tools.py`,
`state.py`), `schemas/` (`intelligence.py`, `slide_plan.py`, `pipeline_state.py`),
`services/` (`sanity_service.py`, `ollama_service.py`), `pipeline_routes.py`
(mounted at `/pipeline` for the Next.js on-demand trigger).

Orchestration is deliberately **hand-rolled**: `CoordinatorAgent.run_pipeline()` drives
the fixed Context → Extraction → Planning sequence in plain Python
(`agents/coordinator_agent.py`); there is no agent framework in `requirements.txt`.

### 3.3 `sanity-studio/` — CMS

| | |
|---|---|
| Stack | Sanity Studio, `sanity` ^5.25.1 (`sanity-studio/package.json`) — note: `CLAUDE.md` says "v4"; the installed package is v5 (see §11) |
| Start | `cd sanity-studio && npm run dev` (port 3333) |
| Config | `sanity.config.ts` — project `ygdze74e`, dataset `production` (committed public fallback; overridable via `SANITY_STUDIO_PROJECT_ID/DATASET`) |

Schema types are registered in `schemaTypes/index.ts`: `report`, `presentation`,
`chatSession`, `chatMessage` (object), `executiveIntelligence`, `slidePlan`, `user`,
`userFile`.

---

## 4. Data Model

All persistent data lives in the single Sanity dataset. Ownership is by `reference` to
a `user` document.

| Type | Defined in | Written by | Owner ref | Purpose / notes |
|---|---|---|---|---|
| `user` | `sanity-studio/schemaTypes/user.ts` | `next/src/app/api/auth/login/route.ts` | — | `_id = user_<sha256(email)[:24]>` (`userIdForEmail` in `next/src/lib/auth.ts`), so repeat logins map to the same doc. Email, name, avatar image, timestamps. |
| `report` | `schemaTypes/report.ts` | `upsertUserReport` in `next/src/lib/sanity.ts` (from `/api/files`) | yes (`user`) | Quarterly research record: quarter, year, client/product/platform/methods, `susScore`, `susChange`, `taskSuccessRate`, `npsScore`, `participants`, `errorRate`, `conversionRate`, plus `kpis[]`, `issues[]`, `insights[]`. `_id = report_<userHash>_<qn>_<year>` — deterministic per user+period so re-uploads replace, not duplicate. |
| `userFile` | `schemaTypes/userFile.ts` | `createUserFile` (`/api/files`) | yes (required) | The user's file directory: filename, mime, size, stored `summary`, extracted `textContent` (truncated to 30 000 chars, `MAX_STORED_TEXT` in `/api/files`), `reportsCreated[]` period labels, `sessionId`, `uploadedAt`. |
| `chatSession` | `schemaTypes/chatSession.ts` | `createChatSession` / `appendMessageToSession` (`next/src/lib/sanity.ts`) | yes (`user`) | `_id = chatSession_<sessionId>`; `messages[]` of `chatMessage` objects. Created via `createIfNotExists` (never `createOrReplace`) to avoid wiping already-appended messages. |
| `chatMessage` | `schemaTypes/chatMessage.ts` (object) | `appendMessageToSession` | — | Declared fields: messageId, role, content, timestamp. The app **also writes** `showPresentation`, `presentationScope`, `year`, `quarter`, `contextQuarter` (for history-restore of presentation cards) — these are *not declared in the Studio schema* (see §11). |
| `presentation` | `schemaTypes/presentation.ts` | `savePresentation` (`/api/presentations`) | yes (`user`) | Deck metadata: title, slidesCount, status, downloadUrl, generatedDate. The route also writes a `quarter` label not declared in the schema (see §11). |
| `executiveIntelligence` | `schemaTypes/executiveIntelligence.ts` | agent-service `extraction_agent._persist` via `services/sanity_service.py` | **no** | Pipeline artefact: executiveSummary, confidenceScore, kpiSummaries[], metricSignals[] (`deltaPct` camelCase), issueHighlights[], strategicSignals[] (`{signal}` objects). |
| `slidePlan` | `schemaTypes/slidePlan.ts` | agent-service `planning_agent._persist` | **no** | The 8-slide plan the deck renderer reads. `slides[].content[]` is an array of **named object types** — `subtitleBlock`, `kpiItem`, `chartBlock` (nested `chartData[]` series), `issueItem`, `priorityItem` — plus legacy `bullets[]`. ID conventions: quarter plans `slideplan_<reportId>`, year plans `slideplan_year_<year>` (enforced in `planning_agent.py`; depended on by `getSlidePlanForYear` in `next/src/lib/sanity.ts`). |

### Schema synchronisation (three parallel definitions)

The `report` shape exists three times and must stay in sync:

1. Sanity: `sanity-studio/schemaTypes/report.ts`
2. TypeScript: `SanityReport` / `KPI` / `Issue` / `Insight` in
   `next/src/lib/services/report-query.ts` (GROQ `REPORT_FRAGMENT` mirrors it;
   `coalesce(..., [])` guards uploads that carry no kpis/issues/insights)
3. Python: `NormalisedReport` dataclasses in `agent-service/agents/context_agent.py`

Similarly, `slidePlan.content[]` block types are mirrored in the Sanity schema, the
GROQ projection `SLIDE_PLAN_PROJECTION` in `next/src/lib/sanity.ts` (which uses `...`
spreads — a documented GROQ nuance for multi-type arrays), `ContentBlock` in
`next/src/lib/ppt-generator.ts`, and `ContentBlock` in
`agent-service/schemas/slide_plan.py` (which additionally accepts short LLM aliases,
normalised to Sanity names by `_TYPE_ALIASES` in `services/sanity_service.py` and
`agents/planning_agent.py`).

---

## 5. Data Flow — main user journeys

### 5.1 Sign-in

1. `LoginScreen` (`next/src/components/login-screen.tsx`) posts multipart
   `{email, name?, avatar?}` to `POST /api/auth/login`.
2. The route (`app/api/auth/login/route.ts`) validates the email, upserts the
   deterministic `user` doc (`createIfNotExists` + patch of `lastLoginAt`/name/avatar,
   avatar uploaded as a Sanity image asset), then sets the `uxproof_session` httpOnly
   cookie (`signSessionToken` — HMAC-SHA256 over base64url(email), `lib/auth.ts`).
3. On boot, `AppShell` (`components/app-shell.tsx`) gates on the auth slice's
   `checkAuth` (`GET /api/auth/me`) and shows either `LoginScreen` or the app.

### 5.2 File upload (the source of all research data)

1. The chat **+** button (`components/chat-interface.tsx`, `UPLOAD_ACCEPT =
   '.txt,.md,.markdown,.csv,.json,.pdf'`) calls the store's `uploadFile`
   (`store/slices/chat-slice.tsx`), which pushes an optimistic user message and POSTs
   multipart `{file, sessionId, isNewSession}` to `/api/files`.
2. `app/api/files/route.ts` (max 5 MB):
   - **Text extraction** — PDFs via `unpdf` (local pdf.js), each page prefixed with a
     `[page N]` marker so summaries can cite pages; other formats read as UTF-8.
   - **Structured parse (deterministic)** — JSON (`parseJsonReports`) and CSV
     (`parseCsvReports`) rows are canonicalised through `FIELD_ALIASES` and accepted
     only with valid `quarter` (Q1–Q4), `year` (2000–2100) and finite `susScore`
     (`toReport`).
   - **Model conversion (guardrailed)** — if nothing parsed, `extractReportViaModel`
     asks Ollama (temperature 0, JSON mode) to convert the prose into the report shape.
     **Guardrail:** every numeric field is checked with `numberAppearsIn` against the
     document text and dropped if not literally present; a report without a grounded
     `susScore` is rejected entirely. Only quarter/year may default to the current
     period (a filing label, not a metric).
   - **Persist** — each parsed report is `upsertUserReport`-ed (deterministic `_id`,
     owner ref); a `userFile` doc records the upload.
   - **Summary** — CSV/JSON with parsed data get a deterministic period listing
     (`deterministicSummary`); prose documents get `aiDocumentSummary`
     (`lib/file-analysis.ts`) with its own numeric guardrail (every substantial number
     in the summary must appear in the source or the summary is discarded), falling
     back to `fallbackTextSummary`. Model-extracted data is announced explicitly.
   - **Conversation** — the upload turn, the summary, and a follow-up message are
     appended to the chat session. When data was extracted the follow-up carries
     presentation-card metadata (`showPresentation`, scope, quarter, year) — the card
     renders **idle**; generation runs only when the user clicks
     (`presentationAutoStart: false` set in `chat-slice.tsx`, honoured by
     `chat-interface.tsx`'s `autoStart` computation).
3. The response's `assistantMessage` + `followUpMessage` are pushed into the store and
   a toast confirms which periods were added.

### 5.3 Chat question (`data` intent)

1. `sendMessage` (`chat-slice.tsx`) POSTs `{message, context, sessionId, isNewSession,
   history(last 6 turns)}` to `/api/chat`.
2. `app/api/chat/route.ts` resolves the user (401 if none), persists the user turn,
   then: `resolveAffirmativeFollowUp` (a bare "yes" after the upload offer becomes a
   real generation request) → `resolvePeriodFromHistory` (period-less follow-ups
   inherit the last-mentioned period) → `classifyMessage` into
   `casual | presentation | deep | data | file-summary`.
3. **No-data gate** — for any non-casual intent, if `countUserReports` and
   `countUserFiles` are both 0, the route returns an upload prompt instead of running
   any machinery.
4. For `data`, `createUnifiedAI(aiContext, user.id).processQuery()`
   (`lib/agents/unified-agent.ts`) detects intent/scope/metric, resolves a
   `ReportContext` through `resolveReportContext` (`lib/services/report-query.ts` —
   **every fetch filters `user._ref == $userId`**), and builds a deterministic markdown
   answer (precise metric, single, comparison, year, half-year, multi-quarter, or all).
5. **Conversational layer** — `conversationalize()` in the chat route optionally
   rewrites that deterministic template via Ollama to address the actual question.
   Guardrail: every substantial number in the reply must appear in the facts or the
   conversation history, else the rewrite is discarded and the template is returned
   untouched. Any Ollama failure returns null → pure enhancement, no availability cost.
6. The assistant turn is persisted with its presentation metadata, and the JSON
   response carries `contextRef`, `showPresentation`, `presentationScope`, `year`,
   `quarter` for the UI.

### 5.4 Presentation generation

1. A `presentation`-intent chat reply (or an upload follow-up, or a `/files` CTA)
   renders `PresentationPreview` (`components/presentation-preview.tsx`) with scope /
   year / quarter forwarded through `AssistantMessageMeta` (`src/types/index.ts`).
2. On click (or auto-start for fresh non-upload messages), the preview POSTs to
   `/api/presentations` with the most specific body available: `reportId` →
   `{scope:'year', year}` → `{quarter, year}` → parsed from the period label.
3. `app/api/presentations/route.ts`:
   - fetches the `slidePlan` (`getSlidePlanById` / `getSlidePlanForYear` /
     `getSlidePlan` / `getSlidePlanForPeriod` in `lib/sanity.ts`);
   - **on-demand build** — if the plan is missing (or a year request found only a
     quarter fallback), it POSTs `{mode, year, quarter, agents_requested:['planning']}`
     to `${ORCHESTRATOR_URL}/pipeline/run` (FastAPI `pipeline_routes.py`), blocks up to
     `ORCHESTRATOR_TIMEOUT_MS` (default 120 s), then re-fetches. With
     `ORCHESTRATOR_URL` unset it falls through to whatever exists (defaults if nothing);
   - converts the plan via `loadSlidesFromPlan` / `buildDefaultSlides`
     (`lib/ppt-generator.ts`), enforces exactly 8 slides numbered 1–8;
   - renders with `generatePowerPoint` (60 s race timeout) — pptxgenjs, geometry and
     palette exclusively from `lib/branding/brand.ts` (black/white/gray, Space Grotesk +
     DM Sans + DM Mono), embedded assets from `lib/ppt-assets.ts` (`ASSETS.COVER_IMAGE`
     is the one deliberate full-colour exception);
   - writes the file to `public/downloads/` (or `/tmp/downloads` on Vercel, served back
     via `GET /api/presentations/file/[filename]`), best-effort saves a `presentation`
     doc with the owner ref, and returns `{downloadUrl, slidesCount, ...}`.

### 5.5 Deep analysis (`deep` intent)

`/api/chat` calls the FastAPI service directly: `POST ${AGENT_SERVICE_URL}/api/agents/run`
with `{task, context:{quarter, year, mode:'single'}, agents:['context','extraction']}`
(`callAgentPipeline` in the chat route, 200 s timeout). The completed pipeline's
intelligence is formatted client-ready by `formatIntelligence()`.
**Note:** this path queries reports **globally**, not per-user (see §11).

### 5.6 File-summary intent and /files active prompts

`/files` (`components/files-view.tsx`) lists the user's uploads (`GET /api/files`),
shows the stored summary in an accordion, and offers two **active prompts** that open a
fresh chat and auto-send via the store's `pendingPrompt` handoff
(`setPendingPrompt` → consumed once in `chat-interface.tsx`):
- "Summarize the file "name"" → chat intent `file-summary`
  (`classifyMessage` + `extractFilename` in the chat route) → re-runs
  `aiDocumentSummary` on the stored `textContent` (page-cited for PDFs), falling back
  to the stored summary, then the deterministic one.
- "Generate <latest period> presentation" → the normal presentation flow.

### 5.7 History restore

`ChatSessionView` restores a session through `GET /api/sessions/[sessionId]`
(ownership-scoped GROQ). `fetchSessionMessages` (`store/slices/session-slice.tsx`)
rebuilds messages including presentation metadata; restored cards render idle
(no stored `downloadUrl`, `autoStart` requires a <60 s-old timestamp in
`chat-interface.tsx`), so old messages never fire background generations.

---

## 6. API Surface

### Next.js routes (`next/src/app/`)

| Route | Method | Auth | Request → Response |
|---|---|---|---|
| `/api/auth/login` | POST | none (creates session) | multipart `{email, name?, avatar?}` → `{user}` + sets `uxproof_session` cookie |
| `/api/auth/logout` | POST | — | clears cookie → `{ok:true}` |
| `/api/auth/me` | GET | cookie | always 200, `{user \| null}` |
| `/api/chat` | POST | required (401) | `{message, context?, sessionId?, isNewSession?, history?}` → `{id, role, content, agentInfo, contextRef?, showPresentation, processingType, presentationScope?, year?, quarter?, slidePlan, intelligence, downloadUrl, isError}` |
| `/api/files` | GET | required | → `{files: [{_id, filename, mimeType, size, summary, reportsCreated, uploadedAt}]}` (newest 50) |
| `/api/files` | POST | required | multipart `{file, sessionId?, isNewSession?}` → `{file, reportsCreated, assistantMessage, followUpMessage}` |
| `/api/sessions` | GET | required | → `{sessions:[{sessionId, title, quarter, createdAt, preview, messageCount}]}` (user-scoped) |
| `/api/sessions/[sessionId]` | GET | required | → `{messages[]}` incl. presentation metadata (user-scoped) |
| `/api/sessions/[sessionId]` | DELETE | required + ownership check | → `{ok}` |
| `/api/presentations` | GET | required | → `{presentations[]}` (user-scoped) |
| `/api/presentations` | POST | required | `{reportId? \| quarter+year? \| slidePlanId? \| scope:'year'+year? \| period? \| slide_plan?}` → `{downloadUrl, slidesCount, generatedDate, ...}` (binary directly on Vercel) |
| `/api/presentations/file/[filename]` | GET | **none** | serves the `.pptx` from `public/downloads` (or `/tmp/downloads`); validates filename shape only |
| `/api/extract` | POST | **none** | proxy chain: FastAPI `/api/context` → `/api/extract` → `{intelligence}` |
| `/agents` | POST/GET | **none** | proxy to FastAPI `/api/agents/run` / `/api/agents/history` (note: URL is `/agents`, not `/api/agents`) |
| `/agents/stream` | POST | **none** | SSE proxy to FastAPI `/api/agents/run/stream` (Node runtime, 5-min ceiling) |
| `/agents/status/[pipelineId]` | GET | **none** | proxy to FastAPI status endpoint |

### FastAPI endpoints (`agent-service/main.py`, `pipeline_routes.py`)

| Endpoint | Purpose |
|---|---|
| `GET /health` | status + Ollama reachability + Sanity env-var check |
| `POST /api/agents/run` | full pipeline (sync) → `{success, pipeline_id, status, summary, context, intelligence, slide_plan, steps, duration_ms, error}` |
| `POST /api/agents/run/stream` | same as SSE (`tool_start`/`tool_done`/`pipeline_complete`/`pipeline_error` events) |
| `GET /api/agents/status/{id}`, `GET /api/agents/history` | pipeline state store (`orchestration/state.py`) |
| `POST /api/context`, `/api/extract`, `/api/plan` | standalone single-agent calls |
| `POST /pipeline/run` | on-demand trigger for `/api/presentations`: `{mode:'year'\|'single', year, quarter?, agents_requested}` → `{status, pipeline_id, slide_plan_id, summary, error?}` (Pydantic-validated, `pipeline_routes.py`) |

CORS allows `localhost:3000/3001` and `*.vercel.app` via regex (`main.py`).

---

## 7. Authentication & Authorization

- **Model** (per `CLAUDE.md`, implemented in `next/src/lib/auth.ts`): signing in is
  claiming an email identity — no password, no cloud provider. Internal tool.
- **Session cookie**: `uxproof_session` = `base64url(email) + "." + HMAC-SHA256(payload,
  AUTH_SECRET)`, httpOnly, SameSite=Lax, 30 days, Secure in production. Verified with
  `timingSafeEqual`. `AUTH_SECRET` falls back to a fixed dev string when unset.
- **Resolution**: every data route calls `getCurrentUser()` server-side, which verifies
  the cookie and hydrates the `user` doc from Sanity; missing/tampered cookie or
  deleted user ⇒ null ⇒ 401.
- **Scoping**: chat sessions, presentations, files and reports carry `user` references;
  all Next.js report queries filter `user._ref == $userId`
  (`lib/services/report-query.ts`); session read/delete checks ownership in GROQ
  (`app/api/sessions/[sessionId]/route.ts`).
- **Not scoped**: the FastAPI pipeline and its Sanity queries have no user concept
  (`agent-service/services/sanity_service.py` fetches `*[_type == "report" ...]`
  globally), and the deck-file download route and `/agents*`/`/api/extract` proxies do
  no auth. Acceptable on a single machine; see §11.

---

## 8. AI / Pipeline Layer

All inference is local. Two consumers share the same Ollama instance
(`OLLAMA_BASE_URL`, default `http://localhost:11434`, model `OLLAMA_MODEL`, default
`qwen2.5:14b`):

### Next.js side (native `/api/chat` endpoint of Ollama)

| Use | File | Guardrail | Fallback |
|---|---|---|---|
| Conversational rewrite of deterministic answers | `app/api/chat/route.ts` `conversationalize()` | every substantial number must appear in the facts block or history; small ints, 100, years exempt | keep the deterministic template |
| Document summary at upload / on demand | `lib/file-analysis.ts` `aiDocumentSummary()` | every substantial number must appear in the source text; PDF summaries must cite `[page N]` sources | `fallbackTextSummary()` (word count + excerpt) |
| Prose → report conversion | `app/api/files/route.ts` `extractReportViaModel()` | every numeric field must appear **literally** in the document or is dropped; report rejected without grounded `susScore`; only quarter/year may default | file stored as reference context (no report) |

### agent-service side (Ollama OpenAI-compatible `/v1/chat/completions`,
`services/ollama_service.py`, 180 s timeout)

- **ContextAgent** (`agents/context_agent.py`) — no LLM. Fetches and normalises Sanity
  reports into an `AIContextPayload` (modes: single / year / comparison / all).
- **ExtractionAgent** (`agents/extraction_agent.py`) — Ollama → JSON →
  Pydantic-validated `ExecutiveIntelligence` (`schemas/intelligence.py`; None-coercing
  validators keep flaky model output from blocking generation). 90 s timeout guard;
  on timeout or "data unavailable" boilerplate the **rule-based fallback**
  (`_build_fallback_intelligence` / `_build_fallback_year`) synthesises intelligence
  directly from the context payload. Persists `executiveIntelligence` to Sanity.
- **PlanningAgent** (`agents/planning_agent.py`) — Ollama → validated `SlidePlan`
  (`schemas/slide_plan.py`); `_build_fallback_plan` produces a complete deterministic
  plan when the LLM fails. Enforces content rules (character clamps matching the
  generator's thresholds), guarantees 8 real KPI values on slide 4, aggregates
  year-mode anchors, and persists with the `slideplan_<reportId>` /
  `slideplan_year_<year>` ID convention.
- **Deliverable determinism**: the deck is always the fixed 8-slide template — slide
  structure/styling comes from `lib/ppt-generator.ts` + `lib/branding/brand.ts`, never
  from model output; the plan only selects/narrates content.

`lib/lm-studio.ts` is an optional LM Studio client, explicitly not wired into the main
pipeline (its `generateFallbackResponse` canned strings are dead weight unless
`callLMStudio` is invoked, which no current route does).

---

## 9. Engineering Principles & Invariants

These are the rules from `CLAUDE.md`, each verified against the code above; changes
must uphold them:

1. **The LLM never invents data** — deck/answer numbers come from Sanity
   (`report-query.ts`, `context_agent.py`) or are literal-validated against uploaded
   documents (`/api/files`, `file-analysis.ts`); guardrails discard violating output.
2. **LLM as enhancement, not dependency** — every model call has a deterministic
   fallback path (chat template, `fallbackTextSummary`, extraction/planning fallback
   builders); decks generate with Ollama down.
3. **Typed contracts between agents** — Pydantic models in `agent-service/schemas/`;
   bad model output fails validation loudly (with coercers only where a None would
   otherwise block the deterministic deliverable).
4. **Deterministic deliverable** — fixed 8-slide structure enforced in
   `/api/presentations` (pad/truncate to 8) and `ppt-generator.ts`.
5. **Single template source of truth** — `lib/branding/brand.ts`; strictly monochrome
   decks; the cover photo (`ASSETS.COVER_IMAGE`, `lib/ppt-assets.ts`) is the one
   full-colour exception.
6. **Lightweight per-user auth** — cookie + Sanity only (`lib/auth.ts`); no cloud
   providers.
7. **All research data is user-uploaded** — no global dataset in the app; empty
   workspaces get upload prompts, not someone else's numbers (chat route no-data gate;
   `resolveReportContext` returning null).
8. **Local-only inference** — all model URLs are localhost defaults; no cloud LLM calls
   anywhere in the code read.
9. **No orchestration frameworks** — hand-rolled coordinator.
10. **Server/client convention** — pages/layouts are server components; interactive
    code lives in `'use client'` components under `src/components/`.

---

## 10. Configuration

### `next/.env.local` (template: `next/.env.example`)

| Variable | Effect | Where read |
|---|---|---|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity project (fallback `''`; example ships `ygdze74e`) | `lib/sanity.ts`, `lib/services/report-query.ts`, session routes |
| `NEXT_PUBLIC_SANITY_DATASET` | dataset (default `production`) | same |
| `SANITY_API_TOKEN` | write/read token (env-only, never committed) | all Sanity clients; its absence produces an explicit config error in `unified-agent.ts` |
| `AGENT_SERVICE_URL` | FastAPI base (default `http://localhost:8001`) | `/api/chat` deep path, `/agents*` proxies, `/api/extract` |
| `ORCHESTRATOR_URL` | gates on-demand slide-plan builds in `/api/presentations`; unset ⇒ skip trigger and use whatever exists (example sets `http://localhost:8001`) | `app/api/presentations/route.ts` |
| `ORCHESTRATOR_TIMEOUT_MS` | trigger wait ceiling (default 120000) | same |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | local LLM for chat rewrites, summaries, prose extraction (defaults `http://localhost:11434`, `qwen2.5:14b`) | `/api/chat`, `/api/files`, `lib/file-analysis.ts` |
| `AUTH_SECRET` | HMAC key for the session cookie; dev fallback `uxproof-local-dev-secret` | `lib/auth.ts` |
| `NEXT_PUBLIC_LM_STUDIO_URL`, `LM_STUDIO_API_KEY` | optional LM Studio endpoint (currently unused by routes) | `lib/lm-studio.ts` |
| `VERCEL` | switches deck output to `/tmp/downloads` + binary/streamed responses | `ppt-generator.ts`, `/api/presentations*` |

### `agent-service/.env` (template: `.env.example`)

`SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN` (HTTP GROQ + mutations in
`services/sanity_service.py`; checked by `/health`), `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

### `sanity-studio/.env`

`SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET` (fallbacks committed in
`sanity.config.ts`).

---

## 11. Known Limitations & Caveats

1. **Agent-service is not user-scoped** (acknowledged in `CLAUDE.md`):
   `services/sanity_service.py` fetches reports globally, so deep analysis and
   on-demand slide plans aggregate whatever reports exist in the dataset regardless of
   owner. Likewise `slidePlan` / `executiveIntelligence` docs carry no owner, and
   `/api/presentations` resolves plans purely by period. Single-machine acceptable;
   must be scoped before any multi-user deployment.
2. **Unauthenticated surfaces**: `GET /api/presentations/file/[filename]` (guessable
   timestamped filenames), `/agents`, `/agents/stream`, `/agents/status/*`, and
   `/api/extract` perform no session check.
3. **Studio schema drift**: the app writes fields the Studio schema doesn't declare —
   `chatMessage`: `showPresentation`, `presentationScope`, `year`, `quarter`,
   `contextQuarter` (`lib/sanity.ts` `appendMessageToSession`); `presentation`:
   `quarter` (`savePresentation`). Sanity accepts them; Studio shows "unknown fields".
   `storeProcessedIntelligence` writes a legacy `executed_intelligence` type that has
   no schema (the purge script still cleans it up).
4. **`CLAUDE.md` vs code**: (a) `CLAUDE.md` says Sanity Studio **v4**; the installed
   package is `sanity` ^5.25.1 (`sanity-studio/package.json`). (b) The extraction
   agent's system prompts still read "senior UX researcher at **PAISAK4U**"
   (`agents/extraction_agent.py`) despite the branding strip — internal prompt only,
   never rendered in app or decks, but contrary to the intent. (c) The **app UI** uses
   violet/rose/emerald accents (violet-gradient `UxproofMark` logomark and avatar tiles
   in `top-bar.tsx` / `chat-interface.tsx`, quick-action icon colours, violet file tile
   in `files-view.tsx`) while the monochrome rule in `CLAUDE.md` reads "NO accent
   colours … anywhere in app or decks". The **deck pipeline itself is strictly
   monochrome** (`brand.ts`, `ppt-generator.ts`); the tension is confined to the web UI.
5. **Unscoped legacy helpers in `lib/sanity.ts`**: `getReports`, `getAllReports`,
   `getLatestReport`, `getReportsByYear`, `getHistoricalData`, and the slide-plan
   period resolvers query without a user filter (some are required by the presentation
   flow because slide plans are unowned — see caveat 1). `getReports` /
   `getProjectData` also interpolate parameters into GROQ strings instead of using
   `$params` (server-side only, but inconsistent with the rest of the file).
6. **Hardcoded default period**: with no parsable period, `extractPeriod`
   (`/api/chat`) and `parseIntent` (`report-query.ts`) fall back to Q1 2026 — a
   "most recent seeded quarter" assumption that will silently age.
7. **Type duplication**: `src/types/index.ts` still exports an older
   `ChatState`/`ChatSlice` pair that `store/slices/chat-slice.tsx` does not use (the
   slice defines its own `ChatSliceState`); `chat-interface.tsx` reads
   scope/year/quarter via `(message as any)` although `AssistantMessageMeta` now
   declares them.
8. **Model-extraction number check is string-based**: `numberAppearsIn` matches the
   plain decimal rendering; a value the document writes differently (e.g. "seventy-two"
   or "7.20") is dropped even though present — a deliberately conservative bias.
9. **`/agents*` URL space**: the FastAPI proxies live under `/agents`, not `/api/…`
   (file headers claim `app/api/agents/...` but the files are at
   `next/src/app/agents/...`). Cosmetic, but confusing when grepping.
10. **Working tree ahead of git**: this document describes uncommitted changes
    (files feature, chat route v3, `context/` docs folders replacing `docs/`);
    the last commit (`d1e98f1`) does not contain all of it.

---

## 12. Change Log

- **v01 (2026-08-19)** — Initial implementation-architecture document. No previous
  version exists in `context/implementation/`. Documents the current working-tree
  state, including the not-yet-committed file-upload/summarization feature
  (`/api/files`, `lib/file-analysis.ts`, `/files` page + `files-view.tsx`), the
  guardrailed model conversion of prose documents into reports, the conversational
  chat layer, per-user auth/data scoping, and the on-demand FastAPI slide-plan
  trigger.
