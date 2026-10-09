-- 기존 운영 DB에는 이 파일만 Supabase SQL Editor에서 실행한다.
-- briefings.news_items는 jsonb라서 뉴스 evidence에는 별도 열 변경이 필요 없다.
alter table generation_logs
  add column if not exists audit jsonb;
