-- Supabase SQL Editor에서 그대로 실행한다.

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),

  briefing_date date not null unique,

  knowledge_items jsonb not null,
  news_items jsonb not null,

  -- 지면 맨 위에 거는 오늘의 키워드 (string[])
  today_keywords jsonb not null default '[]'::jsonb,

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

-- 오늘의 학습 기록. 브리핑 하루당 최대 한 행.
create table if not exists study_logs (
  briefing_date date primary key,

  completed_at timestamptz,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table study_logs enable row level security;

-- ------------------------------------------------------------------
-- 마이그레이션
--
-- create table if not exists는 기존 테이블을 바꾸지 않는다.
-- 이미 briefings 테이블이 있는 DB에서는 아래를 한 번 실행한다.
-- ------------------------------------------------------------------

-- 2026-08-26 · 오늘 기억할 한 줄(one_liner) -> 오늘의 키워드(today_keywords)
alter table briefings
  add column if not exists today_keywords jsonb not null default '[]'::jsonb;

alter table briefings
  alter column one_liner drop not null;

-- one_liner 컬럼은 과거 브리핑 데이터를 남겨두기 위해 지우지 않는다.
-- 더 이상 읽지도 쓰지도 않으므로, 과거 문장이 필요 없어지면 그때 지운다.
--   alter table briefings drop column one_liner;
