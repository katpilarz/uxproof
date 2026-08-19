# uxproof — project rules for Claude

## Project context

uxproof is an internal tool by Katarzyna Pilarz that turns quarterly UX
research data into client-ready, monochrome 8-slide PowerPoint decks. The user
asks in plain language ("Analyse Q3 2025", "Compare Q2 vs Q3"); the system queries the
research database, runs a multi-agent analysis, and renders a fixed .pptx deck.
The bundled dataset (client "Aurelo") is 100% fictional demo data.

### Architecture (monorepo, three services)

| Directory | Stack | Role |
|---|---|---|
| `next/` | Next.js 16, React 19, Tailwind 4, Zustand, pptxgenjs | Chat UI, unified agent, deck renderer, API routes |
| `sanity-studio/` | Sanity Studio v4 | UX research CMS: reports, intelligence, slide plans (project `ygdze74e`, dataset `production`) |
| `agent-service/` | FastAPI, Pydantic, Ollama (`qwen2.5:14b`) | ContextAgent → ExtractionAgent → PlanningAgent pipeline, hand-rolled orchestration in `orchestration/pipeline.py` |

Data flow: Next.js chat → FastAPI pipeline → Sanity (GROQ) → slide plan → pptxgenjs
render. The agent service runs on port 8001 (`AGENT_SERVICE_URL`); Ollama is local at
`OLLAMA_BASE_URL`; an optional LM Studio endpoint serves the Next.js side.

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
  is a fixed 8-slide template (Cover → SUS headline → trend chart → 8 indicators →
  top issues → recommendations → summary → thank-you). Don't make slide structure or
  styling model-driven.
- **Single template source of truth:** `next/src/lib/branding/brand.ts` — strictly
  monochrome (black / white / gray only, NO accent colours, NO logos or company
  branding anywhere in app or decks; Space Grotesk + DM Sans + DM Mono, hairline
  rules). Never hardcode template values elsewhere; never reintroduce logos, red,
  or accent colours. ONE deliberate exception: the cover photograph
  (`ASSETS.COVER_IMAGE` in `next/src/lib/ppt-assets.ts`) stays in full colour —
  do not convert it to grayscale.
- **Lightweight per-user auth.** Signing in is claiming an email identity (no
  password — internal tool): `/api/auth/*` + `next/src/lib/auth.ts` set an
  HMAC-signed httpOnly cookie, users live in Sanity as `user` documents, and
  chat sessions / presentations carry an owner reference. Every data API route
  resolves the user server-side via `getCurrentUser()` and scopes queries to it.
  Don't add cloud auth providers; keep it cookie + Sanity only.
- **All research data is user-uploaded — there is no global dataset.** Users add
  files via the chat **+** button (`/api/files`): CSV/JSON rows carrying
  `quarter` + `year` + `susScore` are parsed into user-owned `report` documents
  (numbers come from the parse, never the model); TXT/Markdown files are stored
  as `userFile` reference context with an AI-or-fallback summary. All report
  queries (`next/src/lib/services/report-query.ts`) filter on `user._ref`; a
  user with no data is asked to upload, not shown someone else's numbers.
  `npm run purge:global-data` (from `next/`) removes unowned seed docs. Known
  caveat: the FastAPI agent-service still queries reports globally for deep
  analysis and slide plans — acceptable single-machine, scope it before any
  multi-user deployment.
- **Local-only inference is a product feature.** Client research data never leaves the
  machine. Do not introduce cloud LLM calls or send research data to external services.
- **No orchestration frameworks.** The pipeline is deliberately hand-rolled (AutoGen
  was removed as an unused dependency). Don't reintroduce agent frameworks.

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
