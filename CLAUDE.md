# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Erklärbär** – a German-language AI explainer tool. Users enter a topic or upload a PDF and get explanations at 5 difficulty levels (Kind → Einstein) via the Anthropic API.

## Running locally

No build step. The frontend is a single `index.html` that can be opened directly in a browser.

For the API (`api/explain.js`) to work locally, use the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

Then set `ANTHROPIC_API_KEY` in a `.env.local` file or via `vercel env pull`.

## Deployment

Hosted on Vercel. The only required environment variable is `ANTHROPIC_API_KEY`. Deploy by pushing to the connected GitHub repo.

## Architecture

The project has two parts that communicate via one HTTP endpoint:

**Frontend (`index.html`)** — pure vanilla JS, no framework, no build tooling. All state lives in module-level `let` variables (`mode`, `selectedLevel`, `allMode`, `pdfB64`). PDF files are read with `FileReader` and sent as base64 strings. The fetch call targets `/api/explain` with a JSON body containing `{ levels, mode, topic, passage, pdf }`.

**Backend (`api/explain.js`)** — Vercel Serverless Function (ESM). It reads `ANTHROPIC_API_KEY` from `process.env`, constructs per-level prompts from the `LEVEL_PROMPTS` map, then fires all level requests in parallel via `Promise.all`. Uses the Anthropic Messages API directly over `fetch` (no SDK). Model: `claude-sonnet-4-20250514`, `max_tokens: 1200`.

## Input modes

| Mode | Frontend sends | Backend uses |
|------|----------------|--------------|
| `topic` | `topic` string | Text prompt only |
| `pdf` | `pdf` (base64) + optional `passage` | Document block + text prompt |
| `marked` | `markedText` string | Simplification prompt (backend ready, frontend not yet built) |

## Planned feature (backend already done)

The `marked` mode in `api/explain.js` supports 3 simplification levels: `kinderleicht`, `deutlich_einfacher`, `etwas_einfacher`. The frontend for this (inline document viewer with text selection → "Erklären" popup) still needs to be built. See `README.md` for the exact prompt to use with Claude Code.
