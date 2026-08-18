# uxproof — Next.js app

The front of house for uxproof: chat over UX research data, preview the
deck, download the .pptx. See the [root README](../README.md) for the
full setup.

```bash
npm install
npm run dev     # http://localhost:3000
```

Requires `.env.local` (template: `.env.example`) pointing at your
Sanity project, and optionally the FastAPI agent service from
`../agent-service` for deep analysis and on-demand slide-plan generation.

## Key modules

- `src/lib/branding/brand.ts` — PAISAK4U brand system (colors, fonts,
  slide themes). Single source of truth for deck styling.
- `src/lib/ppt-generator.ts` — renders the fixed 8-slide deck with
  pptxgenjs from a Sanity slidePlan.
- `src/lib/ppt-assets.ts` — embedded wordmark variants + default cover
  photo as data URIs.
- `src/lib/agents/unified-agent.ts` — routes chat queries: precise
  metric answers, comparisons, year overviews, presentation CTAs.
- `src/lib/services/report-query.ts` — GROQ data layer + period-intent
  parsing.
- `src/app/api/presentations/route.ts` — builds decks, triggering the
  orchestrator when no slide plan exists yet.
