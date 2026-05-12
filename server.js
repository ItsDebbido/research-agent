// server.js — Optional HTTP wrapper around the agent
// Run: npm run serve
// POST /research { "topic": "..." }
// GET  /reports
// GET  /reports/:id

import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const anthropic = new Anthropic();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const app = express();
app.use(express.json());

app.post('/research', async (req, res) => {
  const topic = (req.body?.topic || '').trim();
  if (!topic) return res.status(400).json({ error: 'topic required' });

  try {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: `Research "${topic}" using the web. Return a markdown report with sections: Executive Summary, Key Findings (bullets with [n] citations), Analysis, Sources (numbered with URLs).` }],
    });

    const content = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim();
    const searchCalls = r.content.filter(b => b.type === 'server_tool_use').length;

    const { data, error } = await supabase
      .from('reports')
      .insert({ topic, content, search_calls: searchCalls, model: MODEL })
      .select().single();
    if (error) throw error;

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/reports', async (_, res) => {
  const { data, error } = await supabase
    .from('reports')
    .select('id, topic, search_calls, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/reports/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('reports').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'not found' });
  res.json(data);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✓ Research agent listening on :${port}`));
