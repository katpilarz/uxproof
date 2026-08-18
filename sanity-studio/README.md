# uxproof — Sanity Studio

The UX research CMS behind uxproof. See the [root README](../README.md)
for the full setup.

## Schemas

- `report` — quarterly UX research report per client engagement:
  SUS, task success, NPS, error rate, participants, conversion, plus
  KPIs, usability issues (with recommendations), and research insights.
- `executiveIntelligence` — extracted intelligence written back by the
  agent pipeline (summary, KPI summaries, metric signals, issue
  highlights, strategic signals).
- `slidePlan` — the planned 8-slide deck the ppt-generator renders.
- `presentation` — metadata for generated .pptx files.
- `chatSession` / `chatMessage` — persisted chat history.

## Setup

```bash
npm install
cp .env.example .env    # fill in SANITY_STUDIO_PROJECT_ID
npx sanity dataset import seed-reports.ndjson production
npm run dev             # Studio on http://localhost:3333
```

`seed-reports.ndjson` holds the fictional demo dataset — nine quarters
(Q1 2024 – Q1 2026) of UX research for the invented client "Aurelo".
