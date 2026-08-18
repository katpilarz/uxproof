# uxproof — Product Brief

**Owner:** Katarzyna Pilarz · PAISAK4U (paisak4u.com)
**Status:** internal tool, demo dataset

---

## What it is

uxproof turns quarterly UX research data into client-ready PowerPoint
presentations. Research metrics, usability issues, and insights live in
Sanity CMS; a multi-agent pipeline (FastAPI + Ollama) extracts
intelligence and plans a fixed 8-slide deck; the Next.js app chats over
the data and renders the .pptx with pptxgenjs in PAISAK4U branding.

**The aim: make UX data validation easy — evidence in, deck out.**

## Who it's for

PAISAK4U's clients. Each engagement accumulates quarterly research
reports (usability testing, heuristic reviews, analytics audits,
surveys, accessibility audits) across websites, mobile apps, SaaS
platforms, design systems, and internal tools. uxproof lets the
researcher query that history in plain language and hand the client a
polished deck in minutes.

## The 8-slide deck

1. **Cover** — period + default cover photo
2. **Headline Score** — hero SUS value, 4 headline KPI cards
3. **Usability Trend** — SUS / task-success line chart across quarters
4. **Key UX Indicators** — 8 KPI cards (SUS, task success, NPS, error
   rate, participants, conversion, time on task, findings resolved)
5. **Top Usability Issues** — 3 numbered columns, severity-ranked
6. **Recommendations** — 3 numbered columns of actions
7. **Research Summary** — editorial narrative
8. **Thank You**

## Branding

Follows paisak4u.com: black/white foundation, Schibsted Grotesk +
IBM Plex Mono, hairline rules, uppercase mono labels. Decks add three
accents used sparingly: **violet** (primary), **graphite** (dark
neutral surface), **pink** (secondary). See
`src/lib/branding/brand.ts`.

## Demo dataset

All data is 100% fictional: nine quarters (Q1 2024 – Q1 2026) of a
research retainer for "Aurelo", an invented European digital-commerce
client. The arc shows usability compounding as findings get fixed:
SUS 68.2 → 82.9, task success 71.4% → 88.9%, NPS +12 → +46.
Human-readable versions of each quarter live in `data/reports/`.

## Architecture

- **next/** — Next.js app: chat UI, unified agent, GROQ data layer,
  pptxgenjs deck renderer, API routes
- **sanity-studio/** — Sanity Studio: report / intelligence / slidePlan
  / presentation / chatSession schemas + seed data
- **autogen/** — FastAPI multi-agent pipeline: ContextAgent →
  ExtractionAgent → PlanningAgent, backed by Ollama
