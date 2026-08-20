# uxproof — project rules for Claude

## Project context

uxproof is an internal tool by Katarzyna Pilarz that turns quarterly UX
research data into client-ready PowerPoint decks (the Dossier template). The user
asks in plain language ("Analyse Q3 2025", "Compare Q2 vs Q3"); the system queries the
research database, runs a multi-agent analysis, and renders a .pptx deck whose
length follows the data available.
The bundled dataset (client "Aurelo") is 100% fictional demo data.

### Architecture (monorepo, three services)

| Directory | Stack | Role |
|---|---|---|
| `next/` | Next.js 16, React 19, Tailwind 4, Zustand, pptxgenjs | Chat UI, unified agent, deck renderer, API routes |
| `sanity-studio/` | Sanity Studio v5 | UX research CMS: reports, intelligence, slide plans (project `ygdze74e`, dataset `production`) |
| `agent-service/` | FastAPI, Pydantic, Ollama (`qwen2.5:14b`) | ContextAgent → ExtractionAgent → PlanningAgent pipeline, hand-rolled orchestration in `orchestration/pipeline.py` |

Data flow: Next.js chat → FastAPI pipeline → Sanity (GROQ) → slide plan → pptxgenjs
render. The agent service runs on port 8001 (`AGENT_SERVICE_URL`); Ollama is local at
`OLLAMA_BASE_URL`; the Next.js side calls the same local Ollama instance.

### Engineering principles (uphold these in every change)

- **The LLM never invents data.** Every number in a deck (SUS scores, trends, UX
  indicators) is read from Sanity, never generated. The LLM selects and narrates only.
  Do not write code that lets model output supply metric values.
- **LLM as enhancement, not dependency.** Every LLM step has a deterministic fallback;
  decks must still generate with Ollama down. Never add a hard dependency on model
  availability or on well-formed model output.
- **Typed contracts between agents.** Agents hand off Pydantic-validated objects
  (`agent-service/schemas/`), not free text. A bad LLM response should fail validation
  loudly, not corrupt the deck silently. Keep schemas in sync with the GROQ
  projections and TypeScript types (`next/src/types/`).
- **The deliverable is deterministic; only content selection is intelligent.** The deck
  is the Dossier template — a LIBRARY of slide types, not a fixed running order.
  Which slides appear is decided by `next/src/lib/ppt/deck-data.ts`, purely as a
  function of the data: a slide is emitted if and only if the figures behind it
  exist, and the deck is never padded to reach a slide count. Same data in, same
  deck out. The model still selects and phrases the content ON a slide; it never
  decides the deck's structure or styling.
  - The slide plan is NOT evidence. Asked about a period whose report has an empty
    issues array, the planning agent still emits `issueItem` blocks — so the deck is
    clipped to what the source report actually recorded (`fetchReportGrounding` →
    `Grounding`). Keep that ceiling in place; without it the deck grows a Findings
    section out of content the research never contained.
- **Single template source of truth:** `next/src/lib/branding/brand.ts` — the
  generated DECKS follow the Dossier build spec: ground `#F3F2F2` (never pure
  white), ink `#201E1D`, violet accent `#6D4AF5` with deep/pale variants and four
  flat ink tints; Schibsted Grotesk (ExtraBold / SemiBold / Regular) for everything
  and IBM Plex Mono for uppercase chrome only. NO logos or company branding
  anywhere in app or decks. Never hardcode a colour, face, size or margin outside
  `brand.ts`.
  - The slide is defined at **13.333 × 7.5 in** (a custom pptxgenjs layout), which
    is the size the spec is drawn for, so every position in the spec is used
    verbatim. Don't reintroduce a rescaling step.
  - House rules from the spec, enforced at every call site: corner radius 0 on
    every rectangle, chip and card; no shadows or gradients; text flush left
    (only the footer credit and axis labels are centred); charts drawn with
    rectangles, never a live chart object; and **at most one violet figure per
    slide** — violet marks the problem, so if everything is violet nothing is.
  - Weights are addressed by family name (`Schibsted Grotesk ExtraBold`), because
    pptxgenjs only exposes bold on/off. Both families must be installed locally or
    the deck reflows.
- **The app UI has its own violet, distinct from the deck's.** The web app's
  identity is `--primary: #5B47D6` (light) / `#7060e0` (dark) plus the
  violet-tinted neutrals in `next/src/app/globals.css`, the violet logomark
  gradient in `top-bar.tsx` / `app/icon.svg`, and violet/emerald/rose status
  accents across chrome components. The deck's violet is `#6D4AF5` and lives in
  `brand.ts`. They are separate systems — don't unify them, and don't let deck
  tokens leak into the app or vice versa.
- **Lightweight per-user auth, password-protected.** Accounts are email +
  password: `/api/auth/*` + `next/src/lib/auth.ts` hash the password with
  scrypt (`node:crypto` — no bcrypt/argon dependency, no external service) and
  set an HMAC-signed httpOnly cookie. Users live in Sanity as `user` documents
  and chat sessions / files / presentations carry an owner reference. Every
  data API route resolves the user server-side via `getCurrentUser()` and
  scopes queries to it. Rules that must hold:
  - The scrypt digest lives only in `user.passwordHash` and never leaves the
    server — `toAuthUser()` is the only shape a client may receive.
  - `/api/auth/register` creates accounts; `/api/auth/login` only verifies
    them. Login must never auto-create, so an email typo is refused rather
    than answered with an empty workspace.
  - Sign-in failures return one message for "no such account" and "wrong
    password" alike — don't make the route an account-enumeration oracle.
  - Accounts predating passwords have no `passwordHash` and adopt one on
    their next sign-in. Keep that migration path working.
  - Changing a password requires the current one even with a valid session.
  - Email is not editable: it derives the deterministic user `_id`.
  Don't add cloud auth providers; keep it cookie + Sanity only.
- **All research data is user-uploaded — there is no global dataset.** Users add
  files via the chat **+** button (`/api/files`): CSV/JSON rows carrying
  `quarter` + `year` + `susScore` are parsed deterministically into user-owned
  `report` documents; for prose documents (PDF/TXT/Markdown — PDF text via
  `unpdf`, local pdf.js) the local model CONVERTS the document into the report
  shape automatically. Conversion is not generation: every numeric field the
  model extracts is validated to appear literally in the document text and is
  dropped otherwise (`extractReportViaModel` guardrail); only the filing
  period may default to the current quarter when the document names none.
  Every upload also gets a detailed AI-or-fallback summary and a follow-up
  message carrying the presentation card (user-click generation, no
  auto-start). All report
  queries (`next/src/lib/services/report-query.ts`) filter on `user._ref`; a
  user with no data is asked to upload, not shown someone else's numbers.
  `npm run purge:global-data` (from `next/`) removes unowned seed docs. The
  FastAPI agent-service is user-scoped too: every pipeline request from the
  app carries a `user_id`, report fetches filter on it, and persisted
  intelligence / slide plans carry an owner reference plus per-user year-scope
  `_id`s (`slideplan_year_<year>_<userSuffix>`). Direct service calls without
  a `user_id` fall back to global queries — keep the app side always passing
  it.
- **Users own their data, including removing it.** Conversations can be renamed
  and deleted, uploaded files and generated presentations deleted, all from the
  UI. Every one of those routes verifies the document's `user._ref` against
  `getCurrentUser()` FIRST and answers 404 otherwise — never trust an id from
  the client. Deleting a file also deletes the `report` documents it created,
  minus any period another upload still supplies
  (`orphanedPeriodsForFile`): the app is upload-grounded, so a report with no
  source file would keep feeding decks numbers that nothing stands behind.
  Deleting a presentation also unlinks its rendered `.pptx`. Destructive
  actions are confirmed in the UI before they run.

- **Local-only inference is a product feature.** Client research data never leaves the
  machine. Do not introduce cloud LLM calls or send research data to external services.
- **No orchestration frameworks.** The pipeline is deliberately hand-rolled (AutoGen
  was removed as an unused dependency). Don't reintroduce agent frameworks.
- **Confirmations appear beneath the profile avatar.** The toast stack
  (`components/toaster.tsx`) is anchored top-right under the avatar — not
  top-centre — so every confirmation lands in the same column as the account
  menu, the profile panel and the settings panel. Route all action feedback
  through `showToast` rather than inventing per-view banners.

- **Next.js server/client convention:** every file under `next/src/app/` that is a
  page or layout stays a **server component** (no `'use client'` — SSR is the
  default); every component under `next/src/components/` carries `'use client'`.
  Pages are thin: resolve async `params` and render a `*-view.tsx` client
  component — all hooks, store access, and animation live in `components/`.

### Dev workflow

- Next.js app: `cd next && npm run dev`. Agent service: `cd agent-service &&
  uvicorn main:app --port 8001` (venv `.venv`, `requirements.txt`). Studio:
  `cd sanity-studio && npm run dev` (port 3333).
- Re-seed demo data: `npx sanity dataset import seed-reports.ndjson production
  --replace` from `sanity-studio/`. Note: seeded reports have no owner, so the
  app (per-user, upload-grounded) ignores them — they are only useful for
  inspecting the schema in Studio or for the agent-service pipeline.
- Sanity project ID (`ygdze74e`) is public and committed as a fallback; API tokens are
  env-only.

## Git & GitHub policy

- **Never commit, push, or open PRs without explicit user permission.** This applies every time — a granted permission covers that one action only and does not carry over to later commits or pushes. Staging files (`git add`) to show a proposed change is fine; creating commits is not.
- **Never credit Claude as a contributor.** Do not add `Co-Authored-By: Claude ...` trailers to commit messages, do not append "Generated with Claude Code" (or similar) to commit messages or PR descriptions, and do not list Claude/AI as an author or contributor anywhere in the repo (README, package.json, docs). Commits are authored solely by the user.
- Never commit real secrets or tokens. Real values live in gitignored env files (`next/.env.local`, `agent-service/.env`, `sanity-studio/.env`); the `.env.example` files keep placeholders only.
