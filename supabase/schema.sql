-- Supabase SQL Editor에서 그대로 실행한다.

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),

  briefing_date date not null unique,

  knowledge_items jsonb not null,
  news_items jsonb not null,

  one_liner text not null,

  generated_at timestamptz not null default now(),

  model text,
  prompt_version text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefings_date_desc_idx
  on briefings (briefing_date desc);

create table if not exists generation_logs (
  id uuid primary key default gen_random_uuid(),

  briefing_date date not null,

  -- running | success | failed
  status text not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  input_tokens integer,
  output_tokens integer,
  web_search_calls integer,

  error_message text,

  created_at timestamptz not null default now()
);

create index if not exists generation_logs_date_idx
  on generation_logs (briefing_date desc);

-- MVP는 서버(Service Role Key)에서만 접근한다.
-- RLS를 켜고 정책을 두지 않으면 anon key로는 아무것도 읽거나 쓸 수 없다.
alter table briefings enable row level security;
alter table generation_logs enable row level security;
