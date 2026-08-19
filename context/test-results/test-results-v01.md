---
document: test-results
version: v01
date: 2026-08-19
agent: app-tester
scope: full app — refactor regression (report-parsing/file-analysis extraction), new vitest suite, live API end-to-end (auth, isolation, upload, chat grounding, decks, sessions), agent-service pipeline, reduced-motion change, typecheck/lint/production build
---

# uxproof — Production-Readiness Assessment (v01)

Tested against the uncommitted working tree on top of commit `5c0d477`, with the live dev
stack (Next.js on :3000, agent-service on :8001, Ollama `qwen2.5:14b`, Sanity `ygdze74e/production`).
All live tests used two throwaway accounts (`qa-alpha-…` / `qa-beta-…@uxproof-tests.example`);
every Sanity document and local file they created was verified deleted afterwards
(`*[references($a) || references($b)]` → empty).

**Bottom line: the Next.js application layer is in good shape — auth, per-user isolation,
upload grounding, chat grounding, and deck rendering all passed under live attack-style
testing, and the refactor is verified behaviour-preserving. The release blocker is the
agent-service pipeline: its current code crashes on every user-uploaded report that lacks
an optional numeric field (`float(None)` in `_norm_report`), and the process actually
listening on :8001 is running yesterday's pre-user-scoping code, which today serves
foreign demo data to any user who asks for a deep analysis. Not production-ready until
both are fixed.**

---

## 1. Baseline checks

| Check | Command | Result |
|---|---|---|
| Unit tests (new) | `cd next && npm test` | **PASS — 36/36** (2 files, 344 ms) |
| Typecheck | `cd next && npx tsc --noEmit` | **PASS — 0 errors** |
| Lint | `cd next && npm run lint` | **54 problems (50 errors / 4 warnings) — exactly the known pre-existing baseline; 0 new** |
| Production build | `next build` (isolated copy, see §7) | **PASS** — compiled, TypeScript clean, 15/15 pages generated |

Lint delta detail: no lint output references the new files
(`next/src/lib/report-parsing.ts`, `next/src/lib/__tests__/*`, `next/vitest.config.mts`).
The hits in modified files are pre-existing: `chat-interface.tsx:157:5` is a react-hooks
"setState in effect" error in the `pendingPrompt` claim effect (untouched by this change);
`types/index.ts:106,113` are `any`s in a region the type cleanup didn't touch.

Two non-fatal warnings worth knowing about:

- vitest config: Vite warns `__dirname` in `vitest.config.mts:6` is unsupported by the
  future-default `configLoader: 'native'` — use `import.meta.dirname` eventually.
- production build: Turbopack advisory that `process.cwd()` in
  `src/app/api/presentations/route.ts` (via `lib/downloads.ts`) can't be statically
  analyzed. Informational; the build succeeds and the route works.

## 2. Refactor verification — behaviour preserved (PASS)

`git diff 5c0d477` review plus live retest:

- `next/src/lib/report-parsing.ts` is a **verbatim move** of the parsing/guardrail code
  deleted from `next/src/app/api/files/route.ts` — `toReport`, `parseJsonReports`,
  `parseCsvReports`, `splitCsvLine`, `numberAppearsIn`, `salvageScalarFields`,
  `SEVERITY_MAP`, `NUMERIC_FIELDS`, `FIELD_ALIASES` are character-identical logic.
  The route now imports them; only comments changed at the call sites.
- `summaryNumbersGrounded()` in `next/src/lib/file-analysis.ts` is the identical loop the
  old inline guardrail ran (same exemptions: integers ≤ 12, year-likes 1900–2100, comma
  stripping); `aiDocumentSummary` now delegates to it.
- Live behaviour identical: CSV upload → deterministic parse (§4), prose upload → model
  extraction with grounded numbers (§4), chat answers grounded (§5), deck request flow
  unchanged (§6). The new tests encode the trust-boundary semantics
  (acceptance gate, alias canonicalisation, grounding gate, salvage, severity map,
  summary guardrail incl. thousands separators and page citations).
- Other diffs verified benign: `app-shell.tsx` wraps both branches in
  `<MotionConfig reducedMotion="user">` (children unchanged), `globals.css` appends a
  standard `prefers-reduced-motion` media query, `chat-interface.tsx` replaces
  `(message as any)` casts with typed `Message` fields (tsc passes, so the fields exist
  on the type), stale `ChatState`/`ChatSlice` removed from `types/index.ts` with no
  remaining references (typecheck + build prove it), `lm-studio.ts` deleted cleanly.

Note: `next/.env.local` still carries `NEXT_PUBLIC_LM_STUDIO_URL` / `LM_STUDIO_API_KEY`
even though the module and `.env.example` entries were removed — dead local env vars,
harmless, tidy when convenient.

## 3. Live API suite — 47 PASS / 5 initial FAIL, 3 reclassified after investigation

Full scripted run (fixtures: CSV with Q3 2025 SUS 81.5 / Q2 2025 SUS 76.3, a replacement
CSV with Q3 2025 SUS 82.9, and a prose TXT with SUS 74.6, 18 participants, 83.2%, 4.7%, NPS 27).

### Auth & isolation (all PASS — airtight at the Next API layer)

- Login sets HMAC cookie; `/api/auth/me` returns the right identity; invalid email → 400.
- **Forged cookie** (valid-shape payload, bogus signature) → 401.
- **Anonymous 401 sweep**: GET/POST on `/api/sessions`, `/api/sessions/[id]` (GET+DELETE),
  `/api/files` (GET+POST), `/api/chat`, `/api/presentations` (GET+POST),
  `/api/presentations/file/x.pptx` — all 401.
- **Cross-user**: B's session/file/presentation lists exclude all of A's data; B reading
  A's session by id gets empty messages, no content; **B deleting A's session → 404 and
  A's session survives intact**; B's presentations list excludes A's freshly generated deck.
- **No-data gate**: B (empty workspace) asking "Analyse Q3 2025" is asked to upload and is
  never shown A's numbers.
- Path traversal on the deck download route (`..%2F..%2Fetc%2Fpasswd`) → 400.
- Reclassified non-failure: anonymous `/api/auth/me` returns **200 `{"user":null}`** by
  documented design (route header: "Always 200 — 'not signed in' is an expected state").
  No data exposed; every data route still 401s.

### Upload & grounding (PASS)

- CSV → both periods parsed (`reportsCreated: ["Q3 2025","Q2 2025"]`), summary carries the
  uploaded values verbatim.
- **Re-upload of the same period replaces, never duplicates**: after uploading Q3 2025 with
  82.9, chat answered 82.9 (81.5 gone), and Sanity held exactly one
  `report_<userHash>_q3_2025` doc (verified during cleanup enumeration). The deterministic
  `createOrReplace` id in `upsertUserReport` (`next/src/lib/sanity.ts:189`) is what makes
  this hold.
- Prose TXT → model extraction filed **Q1 2025** with values present in the document
  (74.6 etc.); every substantial number in the AI summary appeared literally in the source
  (checked programmatically against the fixture).
- Edge cases: `.exe` → 400 with a helpful list of supported types; empty file → 400;
  6 MB file → 400.

### Chat grounding (PASS)

- "What was the SUS score in Q3 2025?" → *"…was 81.5 / 100, which is an improvement of
  +5.2 points compared to Q2 2025."* — 81.5 and 76.3 are uploaded values; +5.2 is their
  deterministic difference; "100" is the SUS scale denominator, not data. **No ungrounded
  numbers.** (Initial automated flag on "100" reclassified after reading the answer.)
- "What was the SUS score in Q1 2019?" (period never uploaded) → honest "no data"
  answer, **zero fabricated metric values**.

### Deck generation (mixed — see §6 for the failure)

- POST `/api/presentations {quarter:"Q3", year:2025}` → 200, downloadUrl; file downloads
  with the owner's cookie, **401 anonymously**.
- **Exactly 8 slides** (`ppt/slides/slide1..8.xml`).
- **Monochrome verified**: the only colours in all 8 slide XMLs are `0A0C0D`, `212529`,
  `6A6E70`, plus true grays — precisely the palette defined in
  `next/src/lib/branding/brand.ts` (near-black/gray ink values, ≤ 3/255 channel variance,
  no accent hues). The colour cover photo is embedded media, as designed. (My initial
  strict R==G==B check flagged these; they ARE the brand's single-source-of-truth
  monochrome values — reclassified pass.)
- **FAIL — the deck was not grounded in the user's data**: see Finding C1/C2.

### Sessions (PASS)

Create (via upload/chat), list, restore (messages read back with `Uploaded reports.csv`
and follow-up metadata), delete own → 200, re-delete → 404.

### Malformed input (1 genuine defect)

- Chat with no message → 400; invalid JSON body → handled without 500; junk period on
  presentations → no 500 (but see Finding C4).
- **FAIL — `POST /api/files` with a non-multipart/empty body → 500**
  `{"error":"Upload failed. Please try again."}`. `request.formData()` throws and the
  generic catch at the bottom of `next/src/app/api/files/route.ts` maps it to 500; it
  should be a 400. Severity: **Low** (real clients always send multipart).

## 4. Finding C1 (CRITICAL, environment): the process on :8001 is running stale, pre-user-scoping code — and it serves foreign data today

**What happened.** During the E2E run, A's Q3 2025 deck came out as the *default
placeholder deck* (slide 2 headline literally `SUS —`, cover titled "Q1 2026 | UX Report").
Reproducing the orchestrator call directly
(`POST :8001/pipeline/run {mode:"single", quarter:"Q3", year:2025, user_id:<A>}`)
returned `status:"completed"` with `slide_plan_id:"slideplan_report-ux-q3-2025"` and a
summary about **"Aurelo Web Shop… SUS improving by 1.5 points… task success 85.1%"** —
the global demo report's data, not A's (82.9 / 88.0). Then, end-to-end through the app:
as user A, `POST /api/chat {"message":"Deep analysis Q3 2025"}` returned an
"AI Research Intelligence" report for **Aurelo Web Shop, SUS 79.4, 85.1%, NPS +38** —
none of it A's uploaded data.

**Root cause.** The uvicorn on :8001 (PID 82311) was started **Aug 18 23:46** without
`--reload`; the user-scoping changes to `agent-service/` (owner-filtered GROQ fetches,
`user_id` threading) landed in commit `9e76a70` on **Aug 19 11:00**. The running process
predates them and ignores `user_id` entirely, so its unscoped `[0]` report fetch grabbed
the owner-less demo report `report-ux-q3-2025`. (The process is also running from the
`executive-ai/autogen` project's venv — cwd is correct, but the interpreter is borrowed.)
The Next.js side is **not** at fault: `chat/route.ts:335` and the presentations trigger
both forward `user_id`, and the user-scoped plan re-fetch in `/api/presentations`
correctly *refused* the foreign plan — which is why the deck degraded to placeholders
instead of carrying Aurelo's numbers. The chat deep path has no such second gate, so
there the foreign data reached the user verbatim.

**Expected.** Pipeline requests carrying `user_id` only ever read that owner's reports
(CLAUDE.md per-user isolation invariant).

**Reproduction.** `ps -eo pid,lstart,cmd | grep uvicorn` (start time vs
`git log -1 -- agent-service/`); then the two calls above.

**Fix.** Restart the agent service from the repo's own venv
(`cd agent-service && .venv/bin/uvicorn main:app --port 8001`), and consider stamping a
git commit/version into `GET /health` so a stale process is detectable. In dev, run with
`--reload`.

## 5. Finding C2 (CRITICAL, code): the *current* pipeline code crashes on every user-uploaded report that lacks an optional numeric field

**What happened.** To test the current code, I started it on a scratch port
(`:8002`, stopped and cleaned up afterwards) and re-ran the same user-scoped pipeline call.
Result:

```json
{"status":"failed","pipeline_id":"pipeline_835778025284","slide_plan_id":null,
 "summary":"","error":"float() argument must be a string or a real number, not 'NoneType'"}
```

**Root cause** — `agent-service/agents/context_agent.py:96–102` (`_norm_report`):

```python
sus_change      = float(r.get("susChange", 0)),
...
conversion_rate = float(r.get("conversionRate", 0)),
```

`REPORT_FIELDS` (`agent-service/services/sanity_service.py:113`) projects `susChange`,
`conversionRate`, etc. **explicitly**, so a report without them comes back with the key
present and value `null` → `r.get(field, 0)` returns `None` (the default only applies to
*missing* keys) → `float(None)` raises. Every CSV/JSON upload that omits any optional
numeric column — which includes the app's own documented minimal format
(`quarter`+`year`+`susScore`) — produces exactly such a report. `participants
= int(r.get(...))` has the same hazard. Note the codebase already knows the correct
idiom: line 108 (`kpi.get("change") or 0`) and `extraction_agent.py:529–533` use `or 0`.

**Impact.** Once C1 is fixed by restarting the service, the product's core loop —
*upload your research → deep analysis / generated deck grounded in it* — **fails for
essentially all user uploads**: deep-analysis chat gets a failed pipeline, and deck
generation silently falls back to the 8-slide placeholder deck ("SUS —"). The degraded-mode
guarantee held (no hang, no corruption, a deck is still produced), but the deliverable is
empty of the user's data.

**Fix.** `float(r.get("susChange") or 0)` (and siblings, incl. `int(... or 0)`), plus a
pytest for `_norm_report` with a minimal report dict — this bug is precisely the shape a
unit test catches.

## 6. Finding C3 (HIGH, product behaviour): pipeline failure is masked by a silent placeholder deck

When no slide plan exists and the orchestrator fails (C1/C2, service down, timeout),
`/api/presentations` renders `buildDefaultSlides()` and returns **200 with a normal-looking
downloadUrl**. The user receives a professional-looking 8-slide deck whose SUS headline is
an em-dash and whose cover says "Q1 2026 | UX Report" regardless of the requested period.
The route's own comment about the year-scope fallback says it best: producing a deck that
misrepresents its content "is worse than refusing — it lies about the content." A clear
error (or an explicit "placeholder — no analysis available" marker on the deck/response)
would uphold the deterministic-deliverable promise better. Observed live; reproduction:
request any period for which no slidePlan exists while the orchestrator can't produce one.

## 7. Finding C4 (MEDIUM): no input validation on `/api/presentations`

`POST /api/presentations {"quarter":"Q9","year":"banana"}` → **200**, generated a
placeholder deck, and **persisted a `presentation` document with `quarter: "Q9"`** to
Sanity. Should be a 400. (The Sanity doc from this test was deleted in cleanup.)

## 8. Reduced-motion & UI shell

- Both app-shell branches compile and render: signed-out and signed-in `GET /` return
  identical, error-free SSR HTML (no `__next_error__` / "Application error" markers);
  `tsc`, dev SSR, and the production build all pass with the `MotionConfig` wrapper in
  place. The `prefers-reduced-motion` CSS block is appended correctly and is inert unless
  the OS setting is on.
- Limits of this pass: the shell is a client component (branch switching and framer-motion
  behaviour happen in the browser), and **no browser automation exists in the repo**
  (no Playwright), so in-browser console errors, hydration warnings, and the actual
  reduced-motion animation behaviour were **not** verified. An unrun test is not a passing
  test — flagged in §11.

## 9. Production build (isolated)

To avoid clobbering the live dev server's `.next/`, the build ran in a full copy
(`rsync` of `next/` + hard-linked `node_modules` on the same filesystem, deleted after).
Result: **compiled successfully (4.2 s), TypeScript pass, 15/15 pages, all routes present**
(`/`, `/chat`, `/chat/[sessionId]`, `/files`, `/presentations`, all 9 API routes).
First attempt failed only because Turbopack rejects a `node_modules` symlink pointing
outside the project root — an artifact of my isolation setup, **not** an app defect
(noted for accuracy since the failure is in the logs).

## 10. Not tested this pass (explicitly)

- **Degraded matrix (Ollama down / agent-service down / both)** — requires stopping
  services the user is actively running; skipped to avoid disrupting the shared dev stack.
  Partial incidental coverage: the orchestrator *effectively* failing (C1/C2) proved deck
  generation survives pipeline failure without hanging (falls back to placeholders), and
  the guardrail/fallback logic is unit-tested. The full matrix (chat template answers with
  Ollama stopped, upload fallback summary) remains unverified live.
- **Browser E2E / console** — no Playwright in the repo (§8).
- **SSE streaming endpoints** (`/api/agents/run/stream`) — not exercised directly.
- **PDF upload** — prose extraction was exercised via TXT; the unpdf path itself wasn't
  (scanned-PDF and corrupt-PDF rejections exist in code and are read-verified only).

## 11. Answers to the assessment questions

1. **Does the app work end-to-end (login → upload → ask → deck)?** Login, upload, and ask:
   **yes, verified live and grounded.** Deck: the rendering/download machinery works
   (8 slides, monochrome, auth-gated), but the deck's *content* pipeline is broken —
   stale service today (C1), `float(None)` crash on current code (C2) — so the deck a
   user gets today is a placeholder, or (via deep chat) foreign demo data. **End-to-end
   fails at the last step.**
2. **Grounding intact?** In the Next.js layer, **yes** — chat answers, upload summaries,
   and model extraction were all verified number-for-number against the uploads, and the
   missing-period probe refused to fabricate. The grounding breach observed came from the
   stale agent service (C1), not from model invention — the numbers it served were real
   numbers from the wrong dataset.
3. **Degraded modes?** Partially verified: pipeline failure degrades to a deck without
   hanging or corrupting (observed). Ollama-down and full matrix untested (§10).
4. **Per-user isolation airtight at the API level?** **Yes — 13/13 isolation cases passed**,
   including forged cookies, cross-user reads/deletes, and the no-data gate. The one leak
   found enters through the stale pipeline service, not the API layer.
5. **Deterministic deliverable?** **Yes** — exactly 8 slides, brand.ts monochrome palette
   only, colour cover photo as the sole exception.
6. **Production build?** **Yes** — clean compile, TS pass, all routes.
7. **Console/runtime errors in the browser?** Unverified (no browser automation); SSR HTML
   is error-free.
8. **Test infrastructure to add first?** (a) Commit the API-level smoke suite (the highest
   value per line — it found every real defect in this pass); (b) **pytest for
   `agent-service`**, starting with `_norm_report` on minimal report dicts (would have
   caught C2 before it shipped); (c) keep and grow the new vitest suite (already caught-in
   the trust boundary); (d) Playwright for the login → upload → deck journey last.
9. **Three biggest risks?** (1) C2 — the pipeline cannot process real user uploads, i.e.
   the core product promise; (2) C1-class process hygiene — a stale service silently
   serving cross-dataset numbers with no version signal on `/health`; (3) C3 — silent
   placeholder decks mask failures, so a broken pipeline looks like a successful export.
10. **Must fix before production release?**
    1. C2: `or 0` coercion in `_norm_report` (+ pytest).
    2. C1: restart agent-service from the uxproof venv on current code; add a
       version/commit stamp to `/health`.
    3. C3: surface pipeline failure instead of (or alongside) the placeholder deck.
    4. C4: validate `quarter`/`year` on `/api/presentations` (400 on junk; don't persist
       `Q9` presentation docs).
    5. Low: return 400, not 500, when `/api/files` gets an unparsable body.
    6. Run the degraded matrix (Ollama/agent down) before calling the fallbacks proven.

## 12. Test hygiene disclosure

- All QA-created Sanity docs (2 users, 3 reports, 3 userFiles, 2 presentations,
  2 chatSessions) were deleted and verified gone; the two QA-generated `.pptx` files were
  removed from `next/downloads/`; the scratch agent-service on :8002 was stopped; both
  isolated build copies were deleted.
- One piece of collateral: reproducing C1 against :8001 caused the stale service to
  regenerate `slideplan_report-ux-q3-2025` (`_updatedAt` 11:57Z → 21:04Z). It was rebuilt
  from the same global report by the same model — same kind of content, possibly different
  narration. It was not deleted because it is the user's own pre-existing document.

**Verdict: NOT production-ready** — blocked on C2 (pipeline crash on user uploads) and C1
(stale service process), with C3/C4 strongly recommended alongside. The refactor under
test is verified safe: zero behaviour change, zero new lint/type issues, 36/36 unit tests,
and the live upload/chat/grounding paths behave identically to their pre-refactor contract.

---

## Remediation (2026-08-19, post-assessment)

Added after the assessment above, which is preserved as the point-in-time record.
Every finding it raised has been addressed; none of the fixes were re-tested by a
full QA pass, so a v02 assessment is still the way to confirm the verdict has moved.

| Finding | Status | Fix |
|---|---|---|
| C1 (CRITICAL, env) — stale service serving foreign data | **Fixed** | PID 82311 (started Aug 18 23:46 from `executive-ai/autogen/.venv`, no `--reload`, predating the Aug 19 11:00 user-scoping commit) stopped; restarted as PID 675331 via `agent-service/.venv/bin/python -m uvicorn main:app --port 8001`. `/health` returns ok / ollama ok / sanity configured. |
| C2 (CRITICAL, code) — `float(None)` crash on uploads | **Fixed** | `agents/context_agent.py:96–105` now uses `float(r.get(f) or 0)` instead of a `.get` default, because the GROQ projection returns explicit nulls. Covered by `agent-service/tests/test_context_agent.py` (10 tests, all of which fail against the pre-fix code — verified by reverting). Confirmed against live data: the user's own **Q3 2026 upload** (SUS 71.0) carries nulls for `susChange`, `npsScore`, `errorRate`, `conversionRate`, `methods`, `platform` and now normalises cleanly. |
| C3 (HIGH) — pipeline failure masked by placeholder deck | **Fixed** | `/api/presentations` now returns **503 with an actionable message** instead of a 200 and an em-dash deck when no slide plan can be resolved. The UI already surfaces `data.error` in its error state. Note the scope: this is the *service* being unreachable, not the *model* being down — with Ollama offline the planning agent's rule-built fallback still produces a plan, so "decks generate with the model offline" remains true. |
| C4 (MEDIUM) — no input validation | **Fixed** | `/api/presentations` validates the period before any lookup: quarter must match `Q1–Q4`, year must be an integer 2000–2100, else **400**. `{"quarter":"Q9","year":"banana"}` is refused and nothing is persisted. |
| C5 (LOW) — 500 on unparsable body | **Fixed** | `/api/files` catches a non-multipart body and returns **400** instead of letting the throw become a 500. |

Post-fix checks: `tsc --noEmit` clean, `npm test` 36/36, `pytest` 10/10, lint still exactly
54 problems (all pre-existing, none in changed code).

Also fixed while investigating: `agent-service/.venv` was copied from
`executive-ai/autogen/.venv`, so its `pip` shebang still points at that other project —
`.venv/bin/pip install` silently installs there. Use `.venv/bin/python -m pip` instead.
(One pytest package was installed into the other project's venv before this was noticed.)
