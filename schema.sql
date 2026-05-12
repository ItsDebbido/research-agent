-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → your project → SQL Editor)

create extension if not exists "pgcrypto";

create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  topic         text not null,
  content       text not null,
  search_calls  int  not null default 0,
  model         text,
  created_at    timestamptz not null default now()
);

create index if not exists reports_created_at_idx on reports (created_at desc);
create index if not exists reports_topic_trgm_idx on reports using gin (topic gin_trgm_ops);
create extension if not exists pg_trgm;

-- Row Level Security: locked down by default.
-- This script uses the service_role key from a server, which BYPASSES RLS,
-- so we enable RLS but add no public policies. Browser clients will see nothing.
alter table reports enable row level security;
