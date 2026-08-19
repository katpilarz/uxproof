---
document: setup-guide
version: v01
date: 2026-08-19
agent: project-initializer
scope: initial guide — Next.js app, FastAPI agent-service, Sanity Studio, Ollama prerequisite
---

# 🚀 Local Development Startup Guide

## Quick Start

There is **no root-level command** (no root `package.json`, no Docker Compose, no Turborepo). Each service starts in its own terminal:

```bash
# Terminal 1 — Ollama (prerequisite, if not already running as a service)
ollama serve

# Terminal 2 — FastAPI agent service
cd agent-service && source .venv/bin/activate && uvicorn main:app --port 8001

# Terminal 3 — Next.js app
cd next && npm run dev

# Terminal 4 — Sanity Studio (optional, only for editing CMS content)
cd sanity-studio && npm run dev
```

Then open `http://localhost:3000`.

---

## 0. Ollama (prerequisite)

**Folder:** none (system-level service)

**Command:**

```bash
ollama serve
```

(Skip if Ollama already runs as a system service — check with `curl http://localhost:11434/api/tags`.)

**URL:**

```text
http://localhost:11434
```

**Start first?** Yes — before the agent service and the Next.js app if you want LLM features.

**Notes:**

- Both the agent service and the Next.js app expect the model `qwen2.5:14b`. If it is not pulled yet: `ollama pull qwen2.5:14b`.
- **Not a hard dependency:** every LLM step has a deterministic fallback. Decks still generate with Ollama down; the `/health` endpoint just reports `degraded`.

---

## 1. API — FastAPI agent service

**Folder:**

```text
agent-service/
```

**Command (normal startup — venv `.venv` already exists with dependencies installed):**

```bash
cd agent-service
source .venv/bin/activate
uvicorn main:app --port 8001
```

**First time / dependencies missing only:**

```bash
cd agent-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

**URL:**

```text
http://localhost:8001
```

**Health endpoint:**

```text
http://localhost:8001/health
```

(Reports Ollama reachability and Sanity env configuration — `"status": "ok"` means both are fine, `"degraded"` means a fallback path will be used.)

**Start first?** Yes — start it before the Next.js app so deep analysis and year-scope slide plans work.

**Notes:**

- Reads `agent-service/.env` (already exists). CORS is preconfigured for `http://localhost:3000` and `:3001`.
- On startup it prints the Ollama URL and Sanity project ID it picked up.

---

## 2. Sanity Studio

**Folder:**

```text
sanity-studio/
```

**Command:**

```bash
cd sanity-studio
npm run dev
```

(`npm run dev` runs `sanity dev`. Dependencies are already installed; only run `npm install` if `node_modules/` is missing.)

**URL:**

```text
http://localhost:3333
```

**Start first?** No — fully independent. Only needed when you want to inspect or edit CMS content (reports, intelligence, slide plans).

**Notes:**

- **Authentication required:** first launch opens a browser login to your sanity.io account with access to project `ygdze74e`.
- Do NOT run `sanity init` — the project already exists (project `ygdze74e`, dataset `production`, configured in `sanity.config.ts` / `sanity.cli.ts` and `sanity-studio/.env`).
- Optional re-seed of demo data (only useful for inspecting the schema; the app ignores unowned seed docs):
  ```bash
  npx sanity dataset import seed-reports.ndjson production --replace
  ```

---

## 3. Next.js app

**Folder:**

```text
next/
```

**Command:**

```bash
cd next
npm run dev
```

(`npm run dev` runs `next dev`. Dependencies are already installed; only run `npm install` if `node_modules/` is missing.)

**URL:**

```text
http://localhost:3000
```

**Depends on:**

- **agent-service** at `http://localhost:8001` (`AGENT_SERVICE_URL` / `ORCHESTRATOR_URL`) — needed for the deep-analysis pipeline and on-demand slide-plan builds; the app itself starts fine without it.
- **Ollama** at `http://localhost:11434` — for conversational answers, upload summaries, and prose-document conversion; deterministic fallbacks cover it if down.
- **Sanity (cloud)** — data lives in the hosted dataset; the Studio does NOT need to be running for the app to work.
- **LM Studio (optional)** at `http://localhost:1234/v1` (`NEXT_PUBLIC_LM_STUDIO_URL`) — only if you want the LM Studio path; not required.

---

## 4. Complete Startup Sequence

### Terminal 1 — Ollama (skip if already running as a service)

```bash
ollama serve
```

> Verify with `curl http://localhost:11434/api/tags`.

### Terminal 2 — Agent service

```bash
cd agent-service
source .venv/bin/activate
uvicorn main:app --port 8001
```

> Wait for `✅  uxproof agent service started`. Check `http://localhost:8001/health`.

### Terminal 3 — Next.js

```bash
cd next
npm run dev
```

> When Next.js reports "Ready", open **`http://localhost:3000`** in the browser. Sign in by entering an email (lightweight cookie auth, no password), then upload research data via the chat **+** button.

### Terminal 4 — Sanity Studio (optional)

```bash
cd sanity-studio
npm run dev
```

> Open `http://localhost:3333` and log in with your sanity.io account when prompted.

---

## 5. Environment Variables

**All required env files already exist — no additional setup is needed to start.**

| File | Exists? | Purpose |
|---|---|---|
| `next/.env.local` | Yes | `SANITY_API_TOKEN` (required for data reads/writes), `AGENT_SERVICE_URL` / `ORCHESTRATOR_URL` (`http://localhost:8001`), `OLLAMA_BASE_URL` / `OLLAMA_MODEL`, `AUTH_SECRET` (optional — has a dev fallback), optional LM Studio vars |
| `agent-service/.env` | Yes | `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| `sanity-studio/.env` | Yes | `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET` (no token needed — Studio uses your browser login) |

If you ever need to recreate one, each folder has a `.env.example` template. The only value that must be provided manually is the **Sanity Editor API token** (create at sanity.io/manage, project `ygdze74e` → API → Tokens) in `next/.env.local` and `agent-service/.env`.

---

## 6. Troubleshooting

- **`/health` shows `"ollama": "unreachable"`** — Ollama is not running or not at `http://localhost:11434`. Start it (`ollama serve`) and make sure `qwen2.5:14b` is pulled. The app still works via deterministic fallbacks.
- **`/health` shows `"sanity": "missing env vars"`** — `SANITY_PROJECT_ID` or `SANITY_API_TOKEN` missing in `agent-service/.env`.
- **Deck generation for year scope / missing quarters does nothing** — agent service on port 8001 is not running, or `ORCHESTRATOR_URL` is unset in `next/.env.local` (the `/api/presentations` route then intentionally skips the on-demand build).
- **Port already in use** — defaults are 3000 (Next.js), 8001 (agent service), 3333 (Studio), 11434 (Ollama). If Next.js falls back to 3001, that's fine — agent-service CORS also allows `:3001`.
- **Sanity Studio asks for login** — expected on first run; log in with the sanity.io account that has access to project `ygdze74e`.
- **App shows no research data** — expected for a fresh user: all data is user-uploaded and user-scoped. Upload CSV/JSON/PDF/TXT/Markdown via the chat **+** button. Seeded demo reports have no owner and are ignored by the app.
- **`uvicorn: command not found`** — you forgot `source .venv/bin/activate` in `agent-service/`.
