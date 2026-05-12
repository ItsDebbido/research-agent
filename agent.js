// agent.js — Agentic research assistant
//
// Usage:
//   node agent.js "your research topic"
//   node agent.js --list
//   node agent.js --show <id>
//   node agent.js --export <id>

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const required = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const anthropic = new Anthropic();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const prompt = (topic) => `You are a meticulous research analyst. Research the topic below by searching the web for authoritative, current sources, then synthesize a tight report.

TOPIC: "${topic}"

Search broadly (3–5 searches with varied angles). Then return ONLY a markdown report in this structure:

# ${topic}

## Executive Summary
Two to three sentences capturing the heart of the matter.

## Key Findings
- 6–8 specific, substantive bullets with dates, figures, named actors
- Cite sources inline as [1], [2], etc.

## Analysis
Two short paragraphs of synthesis: what it means, what's contested, what to watch.

## Sources
Numbered list. For each: title — publisher — URL — one-line note on what it contributed.

Be specific. No filler. Do not say "I searched" — deliver the report.`;

async function research(topic) {
  console.log(`\n→ Researching: ${topic}`);
  console.log(`  Model: ${MODEL}\n`);

  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: prompt(topic) }],
  });

  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n\n')
    .trim();

  const searchCalls = response.content.filter(b => b.type === 'server_tool_use').length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`✓ Synthesized in ${elapsed}s (${searchCalls} web searches)\n`);

  const { data, error } = await supabase
    .from('reports')
    .insert({ topic, content, search_calls: searchCalls, model: MODEL })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);

  console.log(`✓ Filed as ${data.id}\n`);
  console.log('─'.repeat(60));
  console.log(content);
  console.log('─'.repeat(60));
  return data;
}

async function list() {
  const { data, error } = await supabase
    .from('reports')
    .select('id, topic, search_calls, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  if (!data.length) return console.log('Archive is empty.');
  console.log(`\n${data.length} report${data.length === 1 ? '' : 's'}:\n`);
  for (const r of data) {
    const date = new Date(r.created_at).toISOString().slice(0, 10);
    console.log(`  ${date}  ${r.id.slice(0, 8)}  ${r.topic}`);
  }
  console.log();
}

async function show(idPrefix) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .ilike('id', `${idPrefix}%`)
    .limit(1)
    .single();
  if (error) throw new Error(`Not found: ${idPrefix}`);
  console.log(`\n[${data.id}]  ${new Date(data.created_at).toLocaleString()}\n`);
  console.log(data.content);
}

async function exportReport(idPrefix) {
  const { data, error } = await supabase
    .from('reports').select('*').ilike('id', `${idPrefix}%`).limit(1).single();
  if (error) throw new Error(`Not found: ${idPrefix}`);
  const slug = data.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const filename = `${slug || 'report'}.md`;
  const frontmatter = `---\ntopic: "${data.topic.replace(/"/g, '\\"')}"\ngenerated: ${data.created_at}\nmodel: ${data.model}\nsearches: ${data.search_calls}\n---\n\n`;
  writeFileSync(filename, frontmatter + data.content);
  console.log(`✓ Wrote ${filename}`);
}

// CLI dispatch
const args = process.argv.slice(2);
try {
  if (args[0] === '--list') await list();
  else if (args[0] === '--show') await show(args[1]);
  else if (args[0] === '--export') await exportReport(args[1]);
  else if (args.length && !args[0].startsWith('--')) await research(args.join(' '));
  else {
    console.log(`Usage:
  node agent.js "your research topic"
  node agent.js --list
  node agent.js --show <id-prefix>
  node agent.js --export <id-prefix>`);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
