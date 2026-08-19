---
document: code-audit
version: v01
date: 2026-08-19
agent: code-analyzer
scope: full next/ app — API routes, auth, Sanity layer, agents, pptx generation, Zustand store, components, Tailwind architecture, project-invariant compliance
---

# uxproof — Next.js App Production Code Audit (v01)

Audited against Next.js 16.2.6, React 19.2.4, Tailwind CSS 4, TypeScript 5.9 (strict), and the engineering invariants in `CLAUDE.md`. All paths relative to `next/` unless noted.

---

## Executive Summary

The application has a **genuinely good architectural skeleton**: the server/client convention (thin server pages → `*-view.tsx` client components) is followed 100% (43/43 components carry `'use client'`, 0 pages do), route `params`/`cookies()` are correctly awaited per Next 16, the HMAC cookie auth layer is small and correct, `report-query.ts` is exemplary (fully user-scoped, parameterised GROQ, strong types), and the deck template (`ppt-generator.ts` + `brand.ts`) is strictly monochrome as mandated. The grounding architecture — deterministic parsing first, model conversion second, numeric guardrails, deterministic fallbacks everywhere — is real, not aspirational.

However, the audit found **two Critical per-user-isolation violations** (the presentation route reads slide plans/reports globally; four agent proxy routes have no auth at all), **a leaky numeric guardrail** (substring matching lets invented numbers through), **fabricated placeholder content** in the deck generator and a dead module (`lm-studio.ts`) that returns invented metrics, plus a boot-time navigation bug (`ClientInit` → `newSession()` rewrites the URL to `/` on every deep link). There is a large volume of dead code, four duplicated Sanity clients, duplicated intent-classification logic, and **zero tests**.

### Ratings

| Area | Score |
|---|---|
| React architecture | 7/10 |
| React 19 adoption | 5/10 |
| Next.js 16 usage | 6/10 |
| Project-invariant compliance (§1b) | 4/10 |
| TypeScript quality | 6/10 |
| Tailwind architecture | 6/10 |
| Performance | 6/10 |
| Accessibility | 6/10 |
| Maintainability | 5/10 |
| Testing | 1/10 |
| **Overall engineering quality** | **5.5/10** |

### Three strongest aspects
1. **`lib/services/report-query.ts`** — parameterised GROQ, every fetcher filters on `user._ref`, `coalesce()` guards, discriminated `ParsedIntent` union, clean aggregation. This is the pattern the rest of the data layer should follow.
2. **Server/client convention discipline** — every page is a server component resolving async params; every component is `'use client'`; no server-only module (auth, write clients) leaks into client bundles; `SANITY_API_TOKEN` never crosses the boundary.
3. **Grounding design** — deterministic CSV/JSON parsing before model extraction, guardrails that verify model numbers against source text, `null`-returning LLM helpers with deterministic fallbacks (`conversationalize`, `aiDocumentSummary`, `extractReportViaModel`). The *architecture* of "LLM as enhancement" is correctly implemented; only guardrail precision needs fixing.

### Three biggest risks
1. **Per-user isolation is broken on the deck path and agent proxies** — `/api/presentations` POST and all `/agents/*` + `/api/extract` routes read data unscoped or unauthenticated, contradicting the core invariant.
2. **The deliverable can lie** — the generator falls back to invented recommendation text and a default "Q1 2026" deck instead of refusing; guardrail substring matching can pass hallucinated numbers.
3. **Zero automated tests** on a system whose whole value proposition is "the numbers are never wrong" — the guardrails, parsers, and period-intent grammar are all pure functions begging for unit tests.

---

## Critical Findings

### 🔴 C1 — `/api/presentations` builds decks from data not owned by the requesting user

- **Location:** `src/app/api/presentations/route.ts` (POST, lines 171–222) → `src/lib/sanity.ts` `getSlidePlan` (l.328), `getSlidePlanForPeriod` (l.336), `getSlidePlanForYear` (l.371), `getSlidePlanById` (l.347)
- **Problem:** The route correctly authenticates (`getCurrentUser()` at l.139), but every slide-plan lookup queries Sanity globally: `*[_type == "slidePlan" && reportId == $reportId][0]`, and `getSlidePlanForPeriod`/`getSlidePlanForYear` resolve reports with `*[_type == "report" && quarter == $quarter && year == $year][0]` — **no `user._ref` filter**. A signed-in user posting `{ quarter, year }` or `{ reportId }` gets a deck rendered from whatever report/plan exists in the dataset, including other users' uploads or unowned seed docs. Contrast with `report-query.ts`, where every fetcher takes `userId`. CLAUDE.md documents the *FastAPI* global-query caveat, but this is the Next.js route itself.
- **Impact:** Direct violation of "every data API route … scopes Sanity queries to `user._ref`". Cross-user research data can be exfiltrated into a downloadable .pptx.
- **Recommended solution:** Thread `user.id` through all slide-plan/report resolution the way `report-query.ts` does (`&& user._ref == $userId` on the report lookups; slide plans need an owner reference or must be resolved via user-owned reportIds only). If slide plans are intentionally single-tenant until the agent-service is scoped, enforce that decision in one documented place instead of silently returning global data.

### 🔴 C2 — Four unauthenticated data routes: `/agents`, `/agents/stream`, `/agents/status/[pipelineId]`, `/api/extract`

- **Location:** `src/app/agents/route.ts`, `src/app/agents/stream/route.ts`, `src/app/agents/status/[pipelineId]/route.ts`, `src/app/api/extract/route.ts`
- **Problem:** None of these call `getCurrentUser()`. They proxy straight to the FastAPI service (which queries reports globally) and return intelligence, pipeline history, and extraction results to any caller. `String(e)` internals are returned in 500 bodies. `pipelineId` is interpolated into the upstream URL without `encodeURIComponent` (l.14 of the status route), allowing path manipulation against the internal service.
- **Impact:** Violates "every data API route resolves the user server-side". Any browser/user on the network can run pipelines and read research intelligence without signing in.
- **Recommended solution:** These routes also appear to be **dead** — `useAgentStream` (the only consumer) is itself unused *and* fetches `/api/agents/stream`, a path that does not exist (the route lives at `/agents/stream`). Preferred fix: delete all four routes plus `useAgentStream`/`useChatSession`. If any is kept, add the `getCurrentUser()` gate, encode path params, and stop echoing raw errors. Note the location inconsistency: route handlers for data belong under `app/api/`, and the stream route's own header comment claims `app/api/agents/stream/route.ts`.

---

## High Findings

### 🟠 H1 — `ClientInit` calls `newSession()` on boot, rewriting the URL to `/` on every deep link

- **Location:** `src/components/client-init.tsx` (l.22) → `src/store/slices/session-slice.tsx` `newSession` (l.138–151)
- **Current pattern:** On every app mount, `newSession()` runs unconditionally and executes `window.history.pushState(null, '', '/')`. Hard-loading `/files` or `/presentations` renders the correct page but the address bar flips to `/` and `TopBar` (which derives the active tab from `usePathname()`) highlights **Chat**. Deep-linking `/chat/[id]` only survives because `ChatSessionView`'s effect happens to fire after `ClientInit`'s and pushes the URL back — an ordering-dependent accident.
- **The intended action exists and is dead:** `initSession()` (session-slice l.124) has both guards (`pathname !== '/'` early-return, no pushState) and its selector `useInitSession` is exported but never called.
- **Fix:** `ClientInit` should call `initSession()` (adjusted to load sessions only after `checkAuth()` resolves), and `newSession()` should keep its pushState only for explicit user actions. Low complexity, high correctness gain.

### 🟠 H2 — Chat/file session appends never verify session ownership (cross-user write injection)

- **Location:** `src/app/api/chat/route.ts` (l.394–407, 590–605), `src/app/api/files/route.ts` (l.471–495) → `src/lib/sanity.ts` `appendMessageToSession` (l.222)
- **Problem:** `sessionId` comes from the request body. `appendMessageToSession` does `createIfNotExists` (a no-op when the doc already exists — even if owned by someone else) and then patches `messages` unconditionally. User B who knows/guesses user A's sessionId (`session_<timestamp>_<6 chars>` — low entropy) can append messages into A's conversation; A sees them on history restore. Read (`GET /api/sessions/[id]`) and delete are correctly ownership-checked — the write path is the gap.
- **Fix:** Before patching, verify `user._ref == $userId` on the existing doc (one `count()` fetch, same pattern as the DELETE handler), or make the patch conditional in a transaction. Consider crypto-random session IDs (`crypto.randomUUID()`).

### 🟠 H3 — Numeric guardrails use substring matching; invented numbers can pass

- **Location:** `src/app/api/files/route.ts` `numberAppearsIn` (l.221–226, used by `extractReportViaModel`), `src/lib/file-analysis.ts` (l.76–85), `src/app/api/chat/route.ts` `conversationalize` (l.123–133)
- **Problem:** All three guardrails check `source.includes(num)`. A hallucinated `24` passes when the source contains `124` or `3.24`; a rounded `82` passes when the document says `82.7` (a classic model rounding hallucination that the CLAUDE.md invariant explicitly forbids — "Quote numbers exactly"). `numberAppearsIn` additionally normalises via `String(parseFloat(v))`, so model output `"72.0"` matches source `72`, but source `"72.0"` vs model `72` also matches `172` etc.
- **Why it matters:** These guardrails are the *implementation* of the "LLM never invents data" invariant. Substring matching gives false confidence.
- **Fix:** Tokenise the source once with a boundary-aware regex (e.g. `/(?<![\d.])(\d+(?:\.\d+)?)(?![\d.])/g` into a `Set`) and require exact token membership. Also drop the dead `.replace(/\.0$/, '')` (already handled by `String(Number)`), and consider rejecting model numbers that match only as a *prefix* of a decimal in source (the 82 vs 82.7 case).

### 🟠 H4 — `selectSession` race: stale fetch can overwrite the active conversation

- **Location:** `src/store/slices/session-slice.tsx` (l.153–173)
- **Current pattern:** `selectSession(id)` sets `activeSessionId`, awaits `fetchSessionMessages(id)`, then writes `s.messages = messages` with **no staleness check**. Rapidly selecting session A then B leaves both fetches in flight; whichever resolves last wins, so B can be active while A's messages render (and `restoring` is cleared by the wrong resolver).
- **Fix:** After the await: `if (get().activeSessionId !== id) return;` (two lines), or use an AbortController per selection.

### 🟠 H5 — Deck generator fabricates content when the plan is thin or missing

- **Location:** `src/lib/ppt-generator.ts` `addRecommendationsSlide` (l.570–576: hardcoded "Fix Checkout Friction" / "Simplify Onboarding" / "Accessibility Pass" rendered whenever fewer than 3 `priorityItem`s exist) and `buildDefaultSlides` (l.652: "Q1 2026\nUX Report" cover) used by `/api/presentations` when no plan resolves (route l.227–237: "render defaults so the user gets feedback rather than a 500").
- **Why it matters:** These are *plausible-looking invented deliverable content*. A client-ready deck stating recommendations nobody made is worse than a failed generation — the same reasoning the route itself applies to the year-scope fallback ("That's worse than refusing — it lies about the content", route l.185–200). KPI defaults use honest `'—'` placeholders; recommendations should too.
- **Fix:** Replace the fake recommendation defaults with `'—'`/"No recommendations in this report" placeholders, and when no slidePlan resolves at all, return a 422 with a user-facing message instead of rendering the default deck (the chat card already surfaces API errors with a Retry button).

### 🟠 H6 — Dead `lib/lm-studio.ts` returns fabricated metrics as assistant content

- **Location:** `src/lib/lm-studio.ts` — `generateFallbackResponse` (l.38–48: "SUS score is up 1.5 points to 79.4…", "NPS: +38"), `fallbackExtractedData` (l.78–89)
- **Problem:** Nothing imports this module today, but it exports helpers whose *fallbacks* violate the central invariant by inventing metric values, and it's documented as a "drop-in alternative" — one future import away from shipping hallucinated numbers. It is also the only consumer of the `axios` dependency and reads `NEXT_PUBLIC_LM_STUDIO_URL`.
- **Fix:** Delete the file (and `axios`). If an LM Studio path is ever needed, rebuild it under the same guardrail regime as the Ollama helpers.

### 🟠 H7 — App-level accent branding contradicts the documented monochrome/no-logo invariant

- **Location:** `src/components/top-bar.tsx` `UxproofMark` (l.38–56: violet gradient logomark `#8B75FF→#5B47D6`, wordmark `text-violet-600`), `src/app/globals.css` (`--primary: #5B47D6`), plus hardcoded violet/rose/emerald accents across `chat-interface.tsx`, `files-view.tsx`, `dashboard.tsx` (multicolour GRADIENTS array l.43–52), `ai-thinking-panel.tsx`, `welcome-empty-state.tsx`, `toaster.tsx`.
- **Problem:** CLAUDE.md states "strictly monochrome … NO accent colours, NO logos or company branding **anywhere in app or decks**". The **decks fully comply** (verified: `ppt-generator.ts` uses only `brand.ts` monochrome values; the colour cover photo is the documented exception). The **app UI does not** — it has a violet design system and a gradient logomark. Either the code violates the spec, or the spec's "in app" scope is stale after the PAISAK4U strip.
- **Fix (decide, then enforce):** (a) amend CLAUDE.md to scope the monochrome rule to decks and bless the violet app identity, or (b) strip app accents. Independently of that decision: stop hardcoding `violet-500/600/400` in ~10 components when `--primary` *is* that violet — use `text-primary`/`bg-primary/10` so a future palette decision is a one-line change (see Tailwind findings).

### 🟠 H8 — No React error boundaries anywhere (`error.tsx` / `global-error.tsx` absent)

- **Location:** `src/app/**` — no `error.tsx`, `loading.tsx`, or `not-found.tsx` files exist.
- **Problem:** Any render-time exception in the client tree (e.g. a malformed restored message hitting `MarkdownMessage`, a `new Date(undefined)` in the sidebar) blanks the entire app with no recovery path. The API layer is defensive but the render layer has zero containment.
- **Fix:** Add a root `app/error.tsx` (reset button + toast) and consider one around the chat message list. Low complexity.

---

## React 19 Findings

- 🟡 **No React 19 primitives are used where they'd genuinely help.** The login form (`login-screen.tsx`) is a hand-rolled `onSubmit` + `loginPending` flag — a textbook `useActionState` + `useFormStatus` case that would remove the manual pending/error state. Session deletion (`deleteSession`) would benefit from `useOptimistic` (currently the row disappears only after the server round-trip). These are recommendations, not defects; the existing code is correct. *Priority: Medium (adopt opportunistically).*
- 🟡 **`chat-interface.tsx` pendingPrompt effect can drop the prompt** (l.152–157): deps are `[pendingPrompt]` only; if the effect fires while `isProcessing || restoring`, it early-returns and never re-runs when those flags clear — the handed-over prompt from `/files` silently stalls until remount. Fix: include `isProcessing`/`restoring` in deps and only consume (`setPendingPrompt(null)`) on the send path. *Priority: Medium.*
- 🟡 **Stale `(message as any)` casts** in `chat-interface.tsx` (l.225–228): `Message` *already* declares `presentationScope`/`year`/`quarter` via `AssistantMessageMeta` (types v2). The casts and the long "lightweight bridge" comments are obsolete and hide type errors. Same for the two `as Message` pushes in `chat-slice.tsx` (l.354, 384). *Priority: Low.*
- 🟡 **Dead SSE branch in `sendMessage`** (`chat-slice.tsx` l.323–357 + `readSSEStream` l.88–168): `/api/chat` only ever returns JSON. ~80 lines of never-executed stream parsing, plus `slidePlan`/`intelligence`/`downloadUrl` response fields that are always `null` end-to-end (route l.422–424 never assigns them). Remove the branch and the phantom fields, or actually stream. *Priority: Medium (complexity + misleading).*
- 🔵 **`StreamingMessage` re-parses markdown every 12ms tick** — the typewriter effect re-renders `ReactMarkdown` (full parse) up to ~83×/s on the growing string. For long replies this is measurable main-thread work for a purely cosmetic effect (content is already complete). Throttle to ~30ms/word-chunks, or reveal plain text and swap in markdown on completion. *Priority: Low.*
- 🔵 `ai-thinking-panel.tsx` correctly hoists `NO_STREAM_STEPS` to keep the effect stable — good. But `streamSteps` prop changes rebuild `steps` each render inside `chat-interface` via `Object.fromEntries` map that is an identity transform (`mappedSteps`, l.162–167) — delete it and pass `streamSteps` directly. *Priority: Low.*
- ⚪ **Hooks hygiene is otherwise good** — no derived-state-in-effects, no gratuitous `useMemo`/`useCallback`, `toaster.tsx` deliberately moves dismissal out of the setState updater with a correct explanation.

## State Management Findings

- 🟠 **H4 (selectSession race)** — see Critical/High section.
- 🟡 **`store/slices/ui-slice.tsx` is dead** — `historyOpen`/`settingsOpen` live in the session slice; the UI slice duplicates them and is not composed into `AppStore` (`store/index.ts` l.19–24). Its header comment describes a fix that applies to the *session* slice's `openHistory`. Delete it (and move the UI flags out of the session slice if you want the separation it promises). *Priority: Medium (two sources of truth for the same names).*
- 🟡 **`types/index.ts` `ChatState`/`ChatSlice` (l.173–199) are a stale nested-shape duplicate** of the real flat `ChatSlice` in `chat-slice.tsx` — different shape, same name, exported from the types barrel. Anyone importing from `@/types` gets the wrong contract. Delete. *Priority: Medium.*
- 🔵 `showDemo`, `currentView`/`setView`, `selectedProjectId` are written but never read by any component (the app-shell comment even says "No more currentView store flag — the URL is the source of truth"). Remove. *Priority: Low.*
- ⚪ Store shape overall is sound: slices are cohesive, selectors are atomic (no object-returning selectors causing re-renders), server state is fetched per-view (files-view, dashboard) rather than globally cached — acceptable at this scale; if refetch/stale issues grow, that's the point to introduce a query cache, not before.

---

## Next.js 16 Findings

- ✅ Async `params` (`await params` in `chat/[sessionId]`, `sessions/[sessionId]`, `presentations/file/[filename]`, `agents/status`) and `await cookies()` in `lib/auth.ts` are all correct Next 16 usage. Metadata + `next/font` in `layout.tsx` are idiomatic.
- 🟠 **Route-handler placement inconsistency:** data handlers live both under `app/api/**` and bare `app/agents/**`. Consolidate under `app/api/` (see C2). *Priority: High (bundled with C2).*
- 🟡 **Mixed navigation idioms:** `router.push` (app-shell, files-view) vs `window.history.pushState` (session slice l.148–150, 164–166, chat-slice l.207, 300). The pushState shallow-routing is legitimate Next 14.1+/16 API and deliberately avoids remounting `ChatInterface` mid-conversation — keep it — but document that intent where it's used, and fix the one abuse (H1). Note `runPrompt` in `files-view.tsx` does both (`newSession()` pushState `/` then `router.push('/')`). *Priority: Low once H1 is fixed.*
- 🟡 **Error-shape inconsistency across routes:** `/api/chat` returns HTTP 200 with `isError: true` (l.631–643); everything else uses real status codes. The client (`chat-slice`) actually depends on parsing the 200 body — an intentional "errors are chat messages" design, but it means monitoring can't distinguish failures. At minimum document it; ideally return 502/500 and let the slice map non-OK JSON to an error message (it already handles both). *Priority: Medium.*
- 🟡 **`String(e)` leaks internal error details** to clients in 500 bodies: `api/sessions` (l.35), `api/sessions/[id]` (l.38, 68), `api/files` GET (l.330), `api/presentations` GET (l.132) and POST `details` (l.303), `api/extract`, `agents/*`. Return generic messages; log the detail server-side. *Priority: Medium.*
- 🟡 **`/api/presentations/file/[filename]` and `/downloads/*` are unauthenticated.** Filename validation is solid (blocks `/`, `..`, non-`.pptx`), but generated decks accumulate forever in `public/downloads` (served statically, no auth, `Date.now()` guessable names) — cross-user download of research decks by URL. Options: store decks under a non-public dir and serve only via an authenticated route with an ownership check on the `presentation` doc; add periodic cleanup. *Priority: Medium (High in any multi-user deployment).*
- 🔵 `savePresentation` uses `createOrReplace` with `_id: presentation_${Date.now()}` — collision-unlikely but `create()` + `crypto.randomUUID()` is the honest API. `quarter: quarter || reportLabel` stores mixed semantics in one field. *Priority: Low.*
- 🔵 `next.config.ts` uses JSDoc typing instead of `import type { NextConfig }`. HSTS header on localhost-only tool is harmless. *Priority: Info.*
- ⚪ No `proxy.ts` — correct, nothing here needs one.

---

## Sanity / Data-Layer Findings

- 🟠 **Four separate Sanity client instances** with identical config: `lib/sanity.ts` (`client` *and* `writeClient` — both `useCdn:false` + same token; the `let client; if (!client)` guard at l.20–30 is dead logic), `lib/services/report-query.ts` (l.16), `api/sessions/route.ts` (l.5), `api/sessions/[sessionId]/route.ts` (l.6). One shared server-only module (`import 'server-only'`) should export a single read and single write client. *Priority: Medium.*
- 🟡 **`lib/sanity.ts` carries a dead, unsafe legacy tier:** `getReports`/`getProjectData`/`getHistoricalData` build GROQ by **string interpolation** (injection-prone pattern, l.38–96), `getHistoricalData` has a year-boundary bug (compares Q1 vs previous-Q4 without adjusting year), and `getLatestReport`/`getAllReports`/`getReportsByYear`/`storeProcessedIntelligence`/`seedDemoData`/`urlFor` are unused and all unscoped. None are imported. Delete the lot — their existence invites exactly the unscoped-query mistake C1 exhibits. *Priority: Medium (High signal value).*
- 🟡 `client?.fetch(...)` optional-chaining on a client that is always constructed means every helper's return type silently includes `undefined` and callers cope with `any`. After consolidating clients, drop the `?.`. *Priority: Low.*
- 🔵 `upsertUserReport` deterministic `_id` per user+period is a good idempotency design. `createIfNotExists` for sessions with the race explanation (l.120–124) shows the team already debugged and documented a real write race — good hygiene.

## Grounding / Invariant Findings (beyond C1/C2/H3/H5/H6/H7)

- ✅ `extractReportViaModel` implements exactly the documented contract: numeric fields validated against source, `susScore` required, quarter/year fallback treated as a filing label. `conversationalize` allows history-sourced numbers with sensible allowlists (small ints, years, `/100`). The **fallback chain works with Ollama down** at every call site (verified: files POST → `deterministicSummary`; chat file-summary → stored summary → `fallbackTextSummary`; data intent → template kept).
- 🟡 **PDF page citations are number-verified but not page-verified:** `aiDocumentSummary` instructs the model to cite `[page N]`, and the guardrail only confirms N exists somewhere in the text — a fact can be attributed to the wrong page. Acceptable, but worth a docstring caveat since citations are pitched as "the trust anchor". *Priority: Low.*
- 🟡 **Duplicated intent grammar is already drifting:** `classifyMessage`/`casualReply`/`extractPeriod`/`detectScope` in `api/chat/route.ts` vs `isCasualOrMeta`/`buildCasualResponse`/`detectPresentationScope`/`parseIntent` in `unified-agent.ts`/`report-query.ts` — the two casual replies have different copy, `extractPeriod` defaults bare years to Q4 while `parseIntent` has richer rules, and both define the fallback period `Q1 2026` independently (with a stale "most recent seeded quarter" comment in the now upload-grounded product — `report-query.ts` l.352–353). Extract one `lib/intent.ts` used by both. *Priority: Medium.*
- 🟡 **`settings-dialog.tsx` is decorative:** the "Monochrome Research / Modern Minimal / Executive Dark" template picker and the model picker are unwired; "Save Changes" just closes. The template options *contradict* the fixed-template invariant. Remove the fake controls (or reduce to a read-only "Template: Monochrome Research · Model: qwen2.5:14b" info panel). *Priority: Medium (user-facing dishonesty).*
- ⚪ Local-only inference: verified — all model calls target `OLLAMA_BASE_URL`/`AGENT_SERVICE_URL` on localhost; no cloud LLM endpoints anywhere live (the dead LM Studio module is also localhost). No orchestration frameworks present.

---

## Tailwind Findings

- ✅ Tailwind 4 setup is correct and modern: CSS-first `@theme inline`, `@custom-variant dark`, `@utility` for `animate-*` and `display`, shadcn token bridge, dark palette. The `:root` font-variable workaround is documented inline.
- 🟠 **Accent colour is hardcoded instead of tokenised** (also H7): `--primary` *is* `#5B47D6`, yet components write `text-violet-600 dark:text-violet-400`, `bg-violet-500/10`, `from-violet-500 to-purple-600`, `hover:bg-violet-600`, `ring-violet-500/20` in `top-bar`, `chat-interface` (≥6 sites), `files-view`, `chat-history-sidebar`, `ai-thinking-panel`, `streaming-message`, `login-screen`, `toaster`, `dashboard`. Whatever the H7 decision, these should be `primary`-token utilities so the palette has one source of truth. *Priority: Medium.*
- 🟡 **Arbitrary hex colours duplicated:** `bg-[#23233d]/90` (chat user bubble — which is also the dark `--accent` value), `bg-[#0f0f1c]`/`text-[#0f0f1c]` ×6 in `dashboard.tsx` (which is `--sidebar` dark). Use the existing tokens. *Priority: Low.*
- 🟡 **`prose prose-sm dark:prose-invert` in `markdown-message.tsx` are no-op classes** — `@tailwindcss/typography` is not installed/imported; the component styles every element manually anyway. Remove the classes (or add the plugin deliberately). *Priority: Low.*
- 🟡 **`tailwindcss-animate` (v3 plugin) is a dependency but only `tw-animate-css` is imported** in globals.css — remove the former. *Priority: Low.*
- 🔵 `dashboard.tsx` stats `grid grid-cols-4` has no responsive variants (overflows on small screens) while the deck grid below is properly responsive — inconsistent. *Priority: Low.*
- 🔵 The multicolour `GRADIENTS` thumbnail array in `dashboard.tsx` is the loudest palette outlier in an otherwise violet/neutral app (and relevant to H7). *Priority: Low.*
- ⚪ Long classNames are generally readable; `cn()` is used correctly where conditional; no `@apply` abuse; no variant-library need at current scale.

---

## Accessibility Findings

- 🟠 **No reduced-motion handling anywhere:** `WelcomeIllustration` runs ~25 infinite SMIL animations; framer-motion animates every message, view, and toast; the thinking panel pings continuously. Nothing checks `prefers-reduced-motion` (framer's `useReducedMotion`/`MotionConfig reducedMotion="user"` would cover most of it; SMIL needs a media-query gate). WCAG 2.3.3. *Priority: High (a11y), Low complexity via `<MotionConfig>`.*
- 🟡 **Clickable `<Card>` div** ("Generate New Presentation", `dashboard.tsx` l.223–226) has `onClick` but no `role="button"`, `tabIndex`, or key handling — invisible to keyboard/SR users. Wrap content in a real `<button>`. *Priority: Medium.*
- 🟡 **Chat message stream has no live region** — new assistant replies and the "Processing request" panel are visual-only; SR users get silence during the 5–200s waits. Add `aria-live="polite"` on the message container and `role="status"` on the thinking panel (the Toaster already does this correctly). *Priority: Medium.*
- 🔵 `presentation-preview` state changes (generating → ready) are unannounced; the elapsed counter is decorative — one `role="status"` on the generating header line suffices. *Priority: Low.*
- 🔵 Theme flash (FOUC): `theme-provider` resolves theme post-mount, so dark-mode users get a white flash every load; also `theme` starts `undefined` while `useTheme()` reports `defaultTheme`, so the toggle icon can briefly lie. Standard fix: inline script in `layout.tsx` head setting the class pre-hydration. *Priority: Low/Medium.*
- ⚪ Strong points: proper `aria-expanded`/`aria-label` on top-bar and sidebar toggles, `role="alert"` on login errors, labelled inputs, `focus-visible` rings throughout, Escape + scrim on the sidebar, semantic `<aside>`, `aria-current` on active session (use value `"page"` for best SR support), toasts with `role="status"` and hover-pause.

---

## Performance Findings

- 🟡 **`ppt-assets.ts` is a 272KB TS module** (base64 cover image) imported by the server-only generator. No client-bundle impact (verified import chain), but it burdens every type-check/compile and is unreviewable. Move the image to a binary file loaded with `fs.readFile` at generation time (it already runs in Node). *Priority: Low/Medium.*
- 🟡 **Ollama guardrail work and 30s/60s model calls run inline in request handlers** — acceptable for a single-user local tool; the timeouts (`AbortSignal.timeout`) on every model/orchestrator call are correctly in place (30s summary, 60s extraction, 200s pipeline, orchestrator AbortController). Good.
- 🟡 `StreamingMessage` markdown re-parse per tick (see React findings). *Priority: Low.*
- 🔵 `presentation-preview.tsx` never revokes the generation-path blob URL (l.181; only the download path revokes). Minor leak per generated deck on Vercel-style responses. *Priority: Low.*
- 🔵 Sequential awaits where parallel is safe: `/api/files` POST runs `upsertUserReport` per report serially (fine for ≤4 rows), and the chat no-data gate already parallelises counts with `Promise.all` — consistent enough. *Priority: Info.*
- ⚪ No premature memoisation anywhere — appropriate; lists are small; no virtualisation needed.

---

## TypeScript Findings

- 🟡 **`any` clusters:** `lib/sanity.ts` (`savePresentation(data: any)`, `logSlidePlanShape(plan: any)`, `report: any`, `yearPlan: any`), `api/presentations/route.ts` (`plan: any`, `slide_plan?: any`), `ppt-generator.ts` (`pptx: any`, `s: any` — pptxgenjs ships types), `api/chat/route.ts` (`slidePlan: any`, `intelligence: any`, `formatIntelligence(Record<string, any>)`), `chat-slice` `readSSEStream` returns `any` members. A shared `SlidePlan`/`SanitySlide` type (it half-exists in `ppt-generator.ts`) would type the whole deck path. *Priority: Medium.*
- 🟡 **Duplicate/conflicting types:** `SlideConfig` defined in both `types/index.ts` (`content?: any[]`) and `ppt-generator.ts` (properly typed `ContentBlock[]`); `PresentationSlide` duplicates `SlideConfig`; `KPI` in `types/index.ts` (`trend: 'up'|'down'`) vs `report-query.ts` (`'up'|'down'|'stable'`) — the types-barrel versions are the weaker, mostly-unused ones. Consolidate on the data-layer types. *Priority: Medium.*
- 🔵 `process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!` non-null assertion in `report-query.ts` while every other module uses `|| ''` — pick one strategy (fail-fast validation at module load is better than either). *Priority: Low.*
- 🔵 Store slice files use `.tsx` with no JSX (`chat-slice.tsx`, etc.). Rename to `.ts`. *Priority: Low.*
- ⚪ `strict: true` is on and honoured; discriminated unions (`ParsedIntent`, `GenState`, block `_type`s) are used well where they exist.

---

## Code Smells / Dead Code Inventory

Delete (all verified unreferenced):
- `src/lib/lm-studio.ts` (+ `axios` dep) — H6
- `src/hooks/useAgentStream.ts` (fetches nonexistent `/api/agents/stream`), `src/hooks/useChatSession.ts`
- `src/store/slices/ui-slice.tsx`
- `src/components/pipeline-status.tsx`, `src/components/ai-processing-state.tsx`, `src/components/presentation-download-button.tsx`
- `src/components/ui/chart.tsx` (+ `recharts` dep — heavy, unused)
- `app/agents/**` + `app/api/extract` (with C2), or auth them if genuinely needed
- `lib/sanity.ts` legacy tier (see Sanity findings), `useStreamSteps` selector (unused; `chat-interface` reads the store directly), `types/index.ts` stale `ChatState`/`ChatSlice`/`PresentationSlide`/`ExecutiveInsight`/`DataSource`/`ProcessingStep`/`UserSettings` (verify each — most have no consumers), SSE branch in `chat-slice.sendMessage`

Dependencies to prune from `package.json`: `axios`, `recharts`, `uuid` (no imports), `tailwindcss-animate` (superseded by `tw-animate-css`), `shadcn` (CLI does not belong in runtime `dependencies`), `@sanity/image-url` (only used by the unused `urlFor`).

Other smells:
- Versioned changelog headers ("v2 — CHANGES OVER v1") in ~10 files duplicate git history and are already stale (e.g. `chat-interface.tsx` claims casts that types v2 made unnecessary). Trim to *current-behaviour* docs. *Low.*
- `layout.tsx`/`globals.css` comments still say "mirrors paisak4u.com" after the branding strip. *Low.*
- Magic period `Q1 2026` appears in 4 places (`extractPeriod`, `parseIntent`, `defaultAIContext`, `buildDefaultSlides` cover). *Low.*
- `QUICK_ACTIONS` in chat-interface hardcode "2025"/"Q1 2026" periods that an upload-grounded user may not have — the no-data gate copes, but consider deriving suggestions from the user's actual uploaded periods. *Info.*
- Simulated pipeline steps + `MIN_GENERATING_MS = 5200` artificial delay in `presentation-preview`/`ai-thinking-panel` are deliberate UX theatre; note that the steps do not reflect real progress. *Info.*

---

## Security Summary

- ✅ HMAC-signed httpOnly cookie with `timingSafeEqual`; token never in JS-accessible storage; `SANITY_API_TOKEN` server-only; react-markdown without `rehype-raw` (no XSS vector); pptx filename traversal blocked; avatar upload type/size-validated; passwordless auth is a documented product decision, not a defect.
- 🔴/🟠 See C1, C2, H2 (cross-user read/write), Medium `/downloads` exposure, `String(e)` leakage.
- 🔵 `AUTH_SECRET` dev fallback `'uxproof-local-dev-secret'` means forgeable cookies if deployed without env config — the comment says as much; consider refusing to start in production without it (`if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) throw`). *Low (internal), High if ever deployed.*
- 🔵 Session tokens have no embedded expiry (cookie `maxAge` only) — a captured cookie value is valid forever. Embed an issued-at and verify age. *Low for a local tool.*

---

## Testing Gaps

There are **no tests** (no runner configured, no test files). Highest-value additions, in order:

1. **Guardrail unit tests** (pure functions, trivial to test): `numberAppearsIn`, the `conversationalize` number check, `aiDocumentSummary` guardrail — including the substring bypass cases from H3 (write them failing first).
2. **Parser tests:** `parseCsvReports`/`parseJsonReports`/`toReport`/`canonicalize` (alias mapping, quoted CSV, malformed rows) and `parseIntent`/`resolveQuarter` (the period grammar is the router for everything).
3. **Route integration tests** (with a mocked Sanity client): per-user scoping of `/api/sessions`, `/api/files`, `/api/chat` no-data gate; ownership rejection on session append (H2 regression test); 401s when unauthenticated.
4. **Deck generation smoke test:** `loadSlidesFromPlan` + `generatePowerPoint` with a fixture slidePlan → asserts 8 slides, no fabricated defaults when plan is complete (H5 regression).
5. **Store tests:** `selectSession` race guard (H4), `uploadFile`/`sendMessage` error paths.
6. One Playwright happy path: login → upload CSV → ask "Analyse Qx" → generate deck (with Ollama mocked/down to prove the deterministic path).

Suggested stack: Vitest + Testing Library (unit/component), Playwright (E2E). No accessibility of the invariant story is credible without at least tier 1–2.

---

# Refactoring Roadmap

### Phase 1 — Immediate (before further feature work)

| # | Action | Benefit | Complexity | Depends on |
|---|---|---|---|---|
| 1.1 | Scope `/api/presentations` plan/report lookups to `user._ref` (C1) | Restores core isolation invariant | Medium (slide plans may need owner refs) | — |
| 1.2 | Delete or auth `app/agents/**` + `/api/extract` (C2) | Removes unauthenticated data surface | Low (they're dead) | — |
| 1.3 | Ownership check in `appendMessageToSession` callers (H2) | Stops cross-user session injection | Low | — |
| 1.4 | Boundary-aware number matching in all three guardrails (H3) + failing-first unit tests | Makes "never invents data" actually enforced | Low | — |
| 1.5 | `ClientInit` → `initSession()`; keep pushState for user actions only (H1) | Fixes deep-link URL desync | Low | — |
| 1.6 | Delete `lm-studio.ts` (+`axios`) (H6) | Removes invariant hazard | Low | — |
| 1.7 | Staleness guard in `selectSession` (H4) | Fixes wrong-conversation render race | Low | — |

### Phase 2 — High Value

| # | Action | Benefit | Complexity | Depends on |
|---|---|---|---|---|
| 2.1 | Replace fabricated deck defaults with honest placeholders / 422 (H5) | Deliverable never lies | Low–Medium | 1.1 |
| 2.2 | Add `app/error.tsx` (+ chat-list boundary) (H8) | Recovery path for render crashes | Low | — |
| 2.3 | Consolidate to one shared Sanity read/write client module with `server-only` | Single config point; kills 4 duplicates | Low | — |
| 2.4 | Delete dead-code inventory + prune 6 dependencies | Smaller surface, honest package.json | Low | 1.2, 1.6 |
| 2.5 | Test tiers 1–3 (guardrails, parsers, route scoping) | Regression safety on the invariants | Medium | 1.3, 1.4 |
| 2.6 | Resolve H7: amend CLAUDE.md scope *or* strip app accents; either way migrate hardcoded `violet-*` to `primary` tokens | One source of truth for palette | Low–Medium | decision |
| 2.7 | Sanitise error responses (drop `String(e)`), unify status-code contract incl. `/api/chat` | Consistent, non-leaky API | Low | — |

### Phase 3 — Structural Improvements

| # | Action | Benefit | Complexity | Depends on |
|---|---|---|---|---|
| 3.1 | Extract shared `lib/intent.ts` (classify/period/scope/casual) used by chat route + unified-agent | Ends grammar drift; one place to test | Medium | 2.5 |
| 3.2 | Shared `SlidePlan`/`ContentBlock` types across sanity.ts ↔ ppt-generator ↔ presentations route; remove `any` tier | Typed contract for the deck path | Medium | 2.3 |
| 3.3 | Authenticated deck download (non-public storage + ownership check) with cleanup job | Closes `/downloads` exposure | Medium | 1.1 |
| 3.4 | Remove dead SSE branch from `sendMessage` (or implement real streaming from `/api/chat`) | −100 lines or a real feature | Low / High | decision |
| 3.5 | Move `ppt-assets` base64 to a binary asset read at runtime | Reviewable source, faster tooling | Low | — |
| 3.6 | Wire or remove settings dialog controls | Honest UI; kills phantom template picker | Low | — |

### Phase 4 — Optional Polish

| # | Action | Benefit | Complexity |
|---|---|---|---|
| 4.1 | `MotionConfig reducedMotion="user"` + SMIL media-query gate | WCAG 2.3.3 | Low |
| 4.2 | Pre-hydration theme script (kill FOUC); fix toggle's undefined window | Perceived quality | Low |
| 4.3 | `useActionState` for login; `useOptimistic` for session delete | Modern form/mutation ergonomics | Low |
| 4.4 | Keyboardable "Generate New Presentation" card; `aria-live` on chat stream; `aria-current="page"` | A11y completeness | Low |
| 4.5 | Throttle typewriter markdown parsing; revoke generation blob URLs | Minor perf/leak | Low |
| 4.6 | Rename slice files to `.ts`; strip stale "vN CHANGES" headers and paisak4u comments; tokenise `#23233d`/`#0f0f1c` | Hygiene | Low |
| 4.7 | Derive chat quick-action suggestions from the user's uploaded periods | Upload-grounded UX consistency | Low–Medium |
