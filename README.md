# Daily Tick

증권사 취준생을 위한 개인화 데일리 금융 학습 서비스.
매일 아침 **오늘의 경제 이슈 + 오늘의 증권 상식**을 신문 형태로 발행한다.

전체 기획/규칙은 [claude.md](./claude.md)를 따른다.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Zod · Supabase · OpenAI Responses API · Vercel

## 시작하기

1. 환경변수 설정

   ```bash
   cp .env.example .env.local
   ```

   | 변수 | 설명 |
   | --- | --- |
   | `OPENAI_API_KEY` | OpenAI API Key (서버 전용) |
   | `OPENAI_MODEL` | 사용할 모델. 기본 `gpt-5.6-luna` |
   | `SUPABASE_URL` | Supabase 프로젝트 URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key (서버 전용, 절대 커밋 금지) |
   | `CRON_SECRET` | `/api/cron/daily-briefing` 보호용 시크릿 |
   | `NEXT_PUBLIC_SITE_URL` | 사이트 URL |

2. DB 테이블 생성 — Supabase SQL Editor에서 [supabase/schema.sql](./supabase/schema.sql) 실행

3. 개발 서버

   ```bash
   npm run dev
   ```

## 구조

```text
src/
├── app/                  페이지 + Route Handler (백엔드 역할)
├── components/
│   ├── briefing/         브리핑 렌더링
│   └── layout/           Masthead / Footer
├── config/app.ts         서비스 상수, USER_PROFILE
├── data/curriculum.ts    금융 개념 학습 순서 (55개)
├── lib/
│   ├── curriculum/       오늘 학습할 개념 선정
│   ├── openai/           스키마 · 프롬프트 · 생성 로직
│   ├── supabase/         DB 접근 (서버 전용)
│   ├── date.ts           KST 기준 날짜 유틸
│   └── env.ts            환경변수 검증
└── types/briefing.ts     Zod 스키마에서 파생된 타입
```

## 원칙

- 페이지 조회 시 OpenAI를 호출하지 않는다. `cron → OpenAI → DB`, `page → DB`.
- 날짜는 항상 `Asia/Seoul` 기준. `new Date().toISOString().slice(0, 10)`을 쓰지 않는다.
- OpenAI Key와 Supabase Service Role Key는 서버에서만 사용한다.
- AI 응답은 Zod 검증을 통과한 값만 저장한다.
- Production 화면에 Mock 데이터를 노출하지 않는다.

## 진행 상황

- [x] Day 1-1 프로젝트 세팅 (Next.js / Tailwind / 폴더 구조 / 환경변수)
- [x] Day 1-2 신문 UI 뼈대 + 메인 페이지 (DB 조회, 브리핑 없을 때 안내)
- [x] Day 1-3 curriculum + 개념 선정 로직
- [x] Day 1-4 Supabase 스키마 · 조회/저장 레이어
- [ ] Day 1-5 OpenAI 연동 (`collectMarketNews` → `generateDailyBriefing`)
- [ ] Day 1-6 `/api/cron/daily-briefing` + Vercel 배포
- [ ] Day 2 Cron 스케줄 · Archive · 실패 처리
- [ ] Day 3 디자인 완성 · 반응형 · Generation Log
