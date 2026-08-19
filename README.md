# uxproof

**UX evidence, client-ready.** An internal tool by [PAISAK4U](https://paisak4u.com)
(Katarzyna Pilarz) that turns quarterly UX research data into branded
PowerPoint presentations — making UX data validation easy and the
hand-off to clients a one-click affair.
 
Ask in plain language — *"Analyse Q3 2025"*, *"Compare Q2 vs Q3"*,
*"Generate 2025 presentation"* — and uxproof queries the research
database, runs a multi-agent analysis, and renders a fixed 8-slide
.pptx deck in PAISAK4U branding.

> The bundled dataset is **100% fictional**: nine quarters of a UX
> research retainer for "Aurelo", an invented digital-commerce client.
> Swap in real client data by editing the Sanity documents.

## Architecture

| Directory | Stack | Role |
|---|---|---|
| [next/](next/) | Next.js 16, React 19, Tailwind 4, pptxgenjs, Zustand | Chat UI, unified agent, deck renderer, API routes |
| [sanity-studio/](sanity-studio/) | Sanity Studio v4 | UX research CMS: reports, intelligence, slide plans |
| [agent-service/](agent-service/) | FastAPI, Ollama, Pydantic | ContextAgent → ExtractionAgent → PlanningAgent pipeline |

## The 8-slide deck

Cover → Headline SUS score → Usability trend chart → 8 UX indicators →
Top usability issues → Recommendations → Research summary → Thank you.

Styling follows paisak4u.com — black/white foundation, Schibsted
Grotesk + IBM Plex Mono, hairline rules — with violet / graphite / pink
accents reserved for data. The single source of truth is
[next/src/lib/branding/brand.ts](next/src/lib/branding/brand.ts).

## Setup

1. **Sanity project**: `uxproof` (`ygdze74e`), dataset `production` —
   already created and preconfigured throughout. Create an **Editor API
   token** at [manage](https://www.sanity.io/manage/project/ygdze74e)
   → API → Tokens.
2. **Fill in env files** (all have `.env.example` templates):
   - `next/.env.local` — `SANITY_API_TOKEN`
   - `agent-service/.env` — `SANITY_API_TOKEN`
   - `sanity-studio/.env` — no token needed (Studio uses your login)
3. **Demo data** is already imported. To re-seed or run the Studio:
   ```bash
   cd sanity-studio
   npm install
   npx sanity dataset import seed-reports.ndjson production --replace
   npm run dev          # Studio on http://localhost:3333
   ```
4. **Start the agent service** (needs [Ollama](https://ollama.com) with
   `qwen2.5:14b` pulled — decks still generate without it via
   deterministic fallbacks):
   ```bash
   cd agent-service
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --port 8001
   ```
5. **Run the app**:
   ```bash
   cd next
   npm install
   npm run dev          # http://localhost:3000
   ```

For pixel-perfect decks, install the two Google Fonts locally so
PowerPoint can render them: [Schibsted Grotesk](https://fonts.google.com/specimen/Schibsted+Grotesk)
and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono).
