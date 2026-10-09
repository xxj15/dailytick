-- Supabase SQL Editor에서 그대로 실행한다.

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),

  briefing_date date not null unique,

  knowledge_items jsonb not null,
  news_items jsonb not null,

  -- 지면 맨 위에 거는 오늘의 키워드 (string[])
  today_keywords jsonb not null default '[]'::jsonb,

  -- 키워드 아래 붙는 한 줄. 키워드 도입 이전 row에는 없으므로 nullable.
  one_liner text,

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

  -- 생성을 몇 번 시도했는가. 2면 첫 응답이 검증을 통과하지 못한 것이다.
  attempts integer,

  -- 검증에 걸린 사례. [{ attempt, code, message }]
  -- 재시도로 성공한 1차 위반도 남는다. 성공만 보면 무엇을 고쳐야 할지 알 수 없다.
  violations jsonb,

  -- 실제 검색 기록, 근거 문장·출처 hash, 탈락 이유, 의미 검토 결과
  audit jsonb,

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

-- 2026-08-26 · 지면 맨 위를 키워드 + 한 줄로 바꾼다
--
-- 한 줄(one_liner)은 그대로 쓰되, 키워드가 앞에 서고
-- 한 줄은 그 키워드들이 왜 중요한지를 짧게 받쳐주는 자리로 바뀌었다.
-- 키워드 이전에 저장된 row에는 today_keywords가 없으므로 기본값을 둔다.
alter table briefings
  add column if not exists today_keywords jsonb not null default '[]'::jsonb;

alter table briefings
  alter column one_liner drop not null;

-- 2026-09-17 · 검증에 걸린 사례를 기록한다
--
-- 재시도로 성공하면 1차 위반이 어디에도 남지 않았다.
-- 무엇이 재시도를 가장 많이 유발하는지 알아야 기준을 고칠 수 있다.
--
--   select v->>'code' as code, count(*)
--   from generation_logs, jsonb_array_elements(violations) v
--   group by 1 order by 2 desc;
alter table generation_logs
  add column if not exists attempts integer;

alter table generation_logs
  add column if not exists violations jsonb;

-- 2026-10-09 · 뉴스 근거 추적
alter table generation_logs
  add column if not exists audit jsonb;
