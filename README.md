# uxproof

**Upload the research, talk to it, get the deck.**

uxproof is a chat-first tool for UX research. You upload research files, ask
questions about them in plain language, and get a client-ready PowerPoint
deck built from your own data.

It's a self-initiated project by Katarzyna Pilarz, designed and built end to
end: the interaction design and design system, the React front end, a Python
service for the AI pipeline, and the deck renderer.

## What it does

- **Upload research.** CSV, JSON, PDF, TXT and Markdown files go in through
  the chat. Structured data is read as it is. Prose documents are turned
  into structured reports by a local language model.
- **Ask questions.** "Analyse Q3 2025", "Compare Q2 vs Q3", "Generate the
  2025 presentation". Answers come only from the research you uploaded.
- **Generate a deck.** One click builds a PowerPoint presentation from a
  fixed template. Its length follows the data: a slide only appears when the
  data behind it exists.
- **Keep research private.** The model runs locally, so research data never
  leaves the machine.

## How it stays reliable

The model can pick out findings, write the narrative and turn prose into
structured data. It never supplies the numbers, the structure of the deck or
its styling. Numbers the model extracts are checked against the source
document, and model steps have rule-based fallbacks, so a slow or unreliable
model doesn't stop the product working.

## Architecture

| Part | Stack | Role |
|---|---|---|
| [next/](next/) | Next.js, React, TypeScript, Tailwind CSS, Zustand, pptxgenjs | Chat interface, API routes, deck rendering |
| [agent-service/](agent-service/) | Python, FastAPI, Pydantic | Analysis pipeline in three steps: context, extraction and planning |
| [sanity-studio/](sanity-studio/) | Sanity | Content store for users, reports, conversations and slide plans |
| Ollama | Local language model | Model inference on the same machine |

## Getting started

You'll need Node.js 20 or later, Python 3.12, [Ollama](https://ollama.com)
and a [Sanity](https://www.sanity.io) project.

```bash
# Local model
ollama pull qwen2.5:14b

# Next.js app (http://localhost:3000)
cd next
npm install
npm run dev

# Agent service (http://localhost:8001)
cd agent-service
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --port 8001

# Sanity Studio (http://localhost:3333)
cd sanity-studio
npm install
npm run dev
```

Each part has a `.env.example`. Copy it to `.env` (`.env.local` for the
Next.js app) and fill in your Sanity project details.

## Tests

```bash
cd next && npm test
cd agent-service && .venv/bin/python -m pytest
```

## Demo data

`sanity-studio/seed-reports.ndjson` is an entirely fictional demo dataset.
The app itself only works with the data each user uploads.

## Status

A working concept, built in 2026. It isn't a commercial product.
