# Research Agent — Anthropic + Supabase

Agentic research pipeline: a single command searches the web, synthesizes a report, and files it in Supabase.

## Setup (5 min)

**1. Create a Supabase project** at https://supabase.com (free tier is fine).

**2. Run the schema.** Open the SQL Editor in the Supabase dashboard, paste in `schema.sql`, hit Run.

**3. Get your keys.**
- Anthropic: https://console.anthropic.com/settings/keys
- Supabase: Dashboard → Project Settings → API → copy the **Project URL** and the **service_role** key (NOT the anon key — service_role bypasses RLS, which is what we want server-side).

**4. Install & configure.**
```bash
cp .env.example .env       # then fill in your keys
npm install
```

## Use

```bash
# Commission a new report
node agent.js "the state of fusion energy in 2026"

# List archived reports
node agent.js --list

# Show a report by ID prefix
node agent.js --show a3f2

# Export a report as markdown (for committing to a Git repo)
node agent.js --export a3f2
```

## HTTP mode

```bash
npm run serve
curl -X POST http://localhost:3000/research \
  -H 'Content-Type: application/json' \
  -d '{"topic":"the state of fusion energy in 2026"}'
```

## Security notes

- The `service_role` key has full database access. Never ship it to a browser. Keep it on the server.
- For a public-facing app, add a row-level-security policy and use the anon key + Supabase Auth instead.
- Web search is metered by Anthropic at ~$10/1k searches; the agent uses up to 5 per report.
