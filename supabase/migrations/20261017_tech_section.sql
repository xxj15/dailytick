-- 기존 운영 DB에는 이 파일을 Supabase SQL Editor에서 실행한다.
-- 새 코드를 배포하기 전에 실행해야 한다. 열이 없으면 브리핑 조회가 실패한다.
-- IT 파트 도입 이전 row와 IT 생성에 실패한 날은 null이다.
alter table briefings
  add column if not exists tech_knowledge_items jsonb;

alter table briefings
  add column if not exists tech_news_items jsonb;
