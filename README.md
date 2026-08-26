<div align="center">

# DAILY TICK

**DAILY FINANCIAL BRIEFING**

증권사 취준생을 위한 개인화 데일리 금융 학습 서비스

매일 아침, 오늘의 경제 이슈와 오늘의 증권 상식을 한 장의 신문으로 발행한다.

`Next.js 16` · `TypeScript` · `Tailwind v4` · `Zod` · `Supabase` · `OpenAI Responses API` · `Vercel`

</div>

---

## 1. 서비스 개요

### 무엇을 푸는가

증권사 취업 준비에는 두 가지 숙제가 매일 동시에 쌓인다.

| 숙제 | 현실 |
| --- | --- |
| 오늘 시장에서 무슨 일이 있었나 | 경제신문 1면을 매일 읽을 시간이 없다 |
| 금융 개념을 얼마나 아는가 | 용어집을 펴면 어디서부터인지 모르겠다 |

Daily Tick은 이 둘을 **하나의 지면에서 연결한다.**

```text
오늘 시장에서 실제로 일어난 일
              +
증권사 취업을 위해 알아야 할 금융 개념
              ↓
        매일 읽는 개인 금융 신문
```

뉴스 요약기가 아니다. 오늘의 이슈를 읽고 나면, 그 이슈를 면접에서 설명할 수 있는
개념 하나가 같이 남는 것이 목표다.

### 아침 3~5분 안에 답할 수 있어야 하는 것

```text
오늘 금융시장에서 제일 중요한 일이 뭐지?
그게 왜 중요한 거지?
주식·금리·환율에는 어떤 영향을 주지?
오늘 하나 배워가야 할 증권 개념은 뭐지?
면접에서 이걸 어떻게 물어볼 수 있지?
```

### 하루 지면 구성

```text
────────────────────────────────────────────────
                  DAILY TICK
            DAILY FINANCIAL BRIEFING
 AUGUST 26, 2026                        NO. 002
────────────────────────────────────────────────

 오늘의 키워드
 기준금리 동결 · 반도체 수출 · 엔비디아 실적

 금리 자체보다 높은 금리가 얼마나 오래 갈지가 관건이다.

 [ 오늘의 증권 상식 ]  [ 오늘의 경제 이슈 ]     학습 완료 ☑
────────────────────────────────────────────────
 01 / RATES                              │
 한국은행 금통위, 추가 인상 가능성        │   MEMO
                                         │   ────────
 무슨 일이 있었나 …                      │
 왜 중요한가 …                           │
 MARKET IMPACT  STOCKS / RATES / FX      │
 SOURCE  한국경제 · Reuters              │
────────────────────────────────────────────────
```

| 블록 | 내용 | 규칙 |
| --- | --- | --- |
| 오늘의 키워드 | 명사구 3~5개 | 10자 이내, 뉴스와 같은 순서(국내 → 글로벌) |
| 한 줄 | 키워드가 왜 중요한지 | **한 문장, 45자 이내, 주제 하나만** |
| 오늘의 증권 상식 | 금융 개념 1~2개 | 정의 · 설명 · 예시 · 증권사 연결점 · 면접 질문 |
| 오늘의 경제 이슈 | 뉴스 3~5개 | 무슨 일 → 왜 중요 → 시장 영향, 출처 URL 필수 |
| 학습 기록 | 완료 체크 + 메모 | 브리핑 하루당 한 행 |

### 페이지

| 경로 | 역할 |
| --- | --- |
| `/` | 오늘 브리핑. 없으면 발행 예정 안내 + 최신 호 링크 |
| `/archive` | 지난 브리핑 목록 (월별 신문 아카이브 형식) |
| `/archive/[date]` | 특정 날짜 브리핑 · 이전 호 / 다음 호 이동 |

페이지는 세 개면 충분하다. 더 만들지 않는다.

---

## 2. 개발 방식 — 명세를 코드보다 먼저 쓴다

이 저장소의 특징은 **[CLAUDE.md](./CLAUDE.md)가 기획서이자 개발 규칙이자 AI 프롬프트**라는 점이다.
Claude Code로 개발하며, 코드를 고치기 전에 먼저 명세를 고친다.

```text
   ┌──────────────────────────────────────────┐
   │  CLAUDE.md — 60개 절의 단일 명세         │
   │  서비스 정의 · 콘텐츠 규칙 · DB · 디자인 │
   └──────────────────────────────────────────┘
              │                    │
      사람이 읽는 기획서      에이전트가 읽는 규칙
              │                    │
              ▼                    ▼
        구현 방향 결정         코드 생성 · 리뷰
              └──────── 커밋 1개 ────────┘
```

### 작업 단위

1. **명세를 먼저 고친다.** 규칙이 바뀌면 `CLAUDE.md`의 해당 절을 수정한다.
2. **한 가지만 구현한다.** 파일이 5개 넘게 새로 생겼는데 커밋이 없으면 멈추고 커밋부터 한다.
3. **의미 단위로 커밋한다.** 여러 기능을 한 커밋에 묶지 않는다.

커밋 메시지는 무엇을 했는지가 아니라 **무엇이 달라졌는지**를 쓴다.

```text
fix:   한 줄이 한 번 읽고 이해되도록 규칙을 조인다
feat:  키워드 아래에 왜 중요한지 한 줄을 붙인다
fix:   커리큘럼 소진 후 같은 개념만 매일 반복되던 것을 고쳤다
style: 기사 레일을 왼쪽 단으로 세우고 군더더기를 걷어냈다
```

### 선택이 갈릴 때의 우선순위

```text
1. 실제 동작       ← 항상 이긴다
2. 정보 정확성
3. 코드 단순성
4. 유지보수성
5. 디자인 완성도
6. 추가 기능       ← 요청하지 않은 기능은 만들지 않는다
```

3~4일짜리 1인 프로젝트다. 그래서 **Vertical Slice를 먼저 관통시킨다.**

```text
실제 최신 뉴스 검색 → OpenAI 분석 → 브리핑 생성 → Supabase 저장 → 화면 출력 → 배포
```

이 흐름이 살아나기 전에는 Archive도, 애니메이션도, 로그인도 만들지 않았다.
별도 백엔드 서버, 상태관리 라이브러리, 과도한 추상화도 두지 않는다.

### 프롬프트도 버전 관리한다

프롬프트는 컴포넌트에 흩어 쓰지 않고 [src/lib/openai/prompts.ts](./src/lib/openai/prompts.ts) 한 곳에서 관리한다.
내용이 의미 있게 바뀌면 `PROMPT_VERSION`을 올리고(현재 `v8`), 생성된 브리핑 row에 그 버전을 함께 기록한다.
품질이 달라졌을 때 **어떤 프롬프트로 만든 지면인지 되짚을 수 있어야 하기 때문이다.**

---

## 3. 개발 내용

### 아키텍처

```text
        Vercel Cron (매일 1회)
                 │
                 ▼
    /api/cron/daily-briefing   ← CRON_SECRET 인증
                 │
                 ▼
        createDailyBriefing()
     ┌───────────┼────────────┐
     ▼           ▼            ▼
 개념 선정   OpenAI 2-step   Zod 검증
(curriculum) (web_search)   (실패 시 재시도)
                 │
                 ▼
             Supabase
                 │
     Browser ────┘   ← 페이지 조회는 DB만 읽는다
```

핵심 원칙 하나: **페이지를 열 때 OpenAI를 호출하지 않는다.**
`cron → OpenAI → DB` 와 `page → DB` 를 완전히 분리해서 조회 비용과 생성 비용을 끊어 놓았다.

### 생성 파이프라인

AI 호출을 두 단계로 나눈다. 한 번에 시키면 검색과 편집이 섞여 품질이 흔들린다.

| 단계 | 함수 | 하는 일 |
| --- | --- | --- |
| STEP 1 | `collectMarketNews()` | `web_search`로 최근 24시간 뉴스 후보 6~10개 수집 |
| STEP 2 | `generateDailyBriefing()` | 후보 + 오늘 개념 + 학습 이력으로 지면 작성 |

그 뒤 코드가 다시 손을 본다. **정렬을 프롬프트에만 맡기지 않는다.**

```text
AI 응답 → Zod 검증 → 국내(KR) 먼저 · 글로벌 뒤 → 같은 지역 안에서 영향도 순 → rank 부여
```

### 오늘의 개념 선정

AI가 매일 주제를 마음대로 고르지 않는다. [src/data/curriculum.ts](./src/data/curriculum.ts)에
**LEVEL 1~10, 91개 개념의 학습 순서**를 코드로 고정해 두었다.
17개는 `pairWith`로 묶여 하루 2개씩 나가므로 신규 콘텐츠는 74일치다.

```text
curriculum 전체
      ↓
DB에서 과거 브리핑 전체 조회   ← 행 수 제한을 두지 않는다
      ↓
이미 학습한 slug 제외
      ↓
가장 앞 순서의 미학습 개념 선택 (1~2개)
      ↓
전부 소화했다면 → 가장 오래전에 다룬 개념부터 복습 (review: true)
```

> 학습 이력 조회에 `limit`을 걸면 창 밖으로 밀려난 개념이 미학습으로 판정돼 다시 출제된다.
> 실제로 겪은 버그라 명세와 코드에 모두 못을 박아 두었다.

### 정확성을 지키는 장치

| 장치 | 내용 |
| --- | --- |
| Zod 검증 | AI 자유 텍스트를 그대로 저장하지 않는다. 실패 시 1회 재시도, 그래도 실패하면 저장하지 않는다 |
| 출처 강제 | 뉴스마다 실제 URL 1개 이상. 국내 경제지 우선, 해외 매체는 보조 |
| 최신성 | 48시간 지난 이슈는 오늘 새롭게 바뀐 점이 없으면 재사용 금지 |
| 사실 / 해석 분리 | "금리 인상으로 주가는 하락한다"(X) → "성장주 밸류에이션에 부담 요인이 될 수 있다"(O) |
| 중복 제거 | 같은 사건을 다룬 여러 매체는 한 이슈로 묶고 source만 여러 개 |
| 실패 전략 | 뉴스 3개 미만 · 국내 또는 글로벌 0개 · 필수 필드 누락이면 실패 처리. **기존 브리핑은 지우지 않는다** |
| Idempotency | `briefing_date` unique. 같은 날 두 번 호출해도 row는 하나 (`reused: true`) |
| Mock 금지 | Production 화면에 가짜 데이터를 절대 노출하지 않는다 |

### 데이터 모델

```text
briefings         하루 한 행. knowledge_items / news_items / today_keywords / one_liner
                  + model · prompt_version (어떤 모델·프롬프트가 만든 지면인지)

generation_logs   running | success | failed · 토큰 사용량 · web_search 호출 수 · 에러

study_logs        브리핑 날짜 PK. 학습 완료 시각 + 메모
```

세 테이블 모두 RLS를 켜고 정책을 두지 않는다. **브라우저는 Supabase에 직접 쓰지 않고
언제나 서버 route를 거친다.**

### 디자인

Black & White 신문 조판. "AI 서비스처럼 보이는 UI"를 의도적으로 피한다.

```text
쓰는 것     얇은 border · 큰 제목 · 여백 · 열(column) · 텍스트 계층 · 번호
안 쓰는 것  gradient · 과한 radius/shadow · glassmorphism · 색상 tag 남발 · 챗봇 UI
색          #FFFFFF / #111111 / #666666 / #D8D8D8 / #F3F3F3
```

데스크톱은 본문 + 메모 2단, 모바일은 1단으로 접힌다.

### 폴더 구조

```text
src/
├── app/
│   ├── page.tsx                     오늘 브리핑
│   ├── archive/[date]/page.tsx      날짜별 지면
│   ├── api/cron/daily-briefing/     생성 endpoint (CRON_SECRET)
│   ├── api/study-log/               학습 완료 · 메모 저장
│   └── loading · error · not-found  상태 화면
├── components/
│   ├── briefing/                    Header · Tabs · Knowledge · News · Impact · Sources · StudyNote
│   └── layout/                      Masthead · Footer
├── config/app.ts                    APP_NAME · 발행 시각 · PREFERRED_PUBLISHERS · USER_PROFILE
├── data/curriculum.ts               금융 개념 91개의 학습 순서
├── lib/
│   ├── briefing/create-daily-briefing.ts   생성 오케스트레이터 (cron은 이것만 호출)
│   ├── curriculum/select-next-concepts.ts  오늘 개념 선정 · 복습 전환
│   ├── openai/                      client · collect-news · generate-briefing · prompts · schemas
│   ├── supabase/                    briefings · generation-logs · study-logs (server-only)
│   ├── date.ts                      KST 기준 날짜 · 호수 · 발행 시각
│   └── env.ts                       환경변수 Zod 검증
└── types/briefing.ts                Zod 스키마에서 파생된 타입
```

### 날짜 처리

서버 timezone을 신뢰하지 않는다. 모든 날짜 판단은 명시적으로 `Asia/Seoul` 기준이다.

```ts
// 서버가 UTC라 한국 날짜와 어긋난다
new Date().toISOString().slice(0, 10);

// 언제나 이쪽을 쓴다
getTodayKST();
```

---

## 4. 실행하기

### 1) 환경변수

```bash
cp .env.example .env.local
```

| 변수 | 설명 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API Key — **서버 전용** |
| `OPENAI_MODEL` | 기본 `gpt-5.6-luna`. 모델 교체는 이 한 줄로 끝난다 |
| `SUPABASE_URL` | Supabase 프로젝트 URL (REST 경로 없이) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key — **서버 전용, 절대 커밋 금지** |
| `CRON_SECRET` | `/api/cron/daily-briefing` 보호용 랜덤 문자열 |
| `NEXT_PUBLIC_SITE_URL` | 사이트 URL |

[src/lib/env.ts](./src/lib/env.ts)가 Zod로 검증하므로 값이 비었거나 형식이 틀리면 바로 알려준다.

### 2) DB

Supabase SQL Editor에서 [supabase/schema.sql](./supabase/schema.sql)을 그대로 실행한다.
파일 하단에 기존 DB용 마이그레이션 구문도 함께 들어 있다.

### 3) 개발 서버

```bash
npm install
npm run dev
```

### 4) 브리핑 수동 생성

```bash
curl -X POST "http://localhost:3000/api/cron/daily-briefing" \
  -H "Authorization: Bearer $CRON_SECRET"
```

| 파라미터 | 설명 |
| --- | --- |
| `date=YYYY-MM-DD` | 생성할 날짜. 기본값은 KST 기준 오늘 |
| `force=true` | 이미 있어도 재생성. 개발용이며 production cron은 쓰지 않는다 |

같은 날짜로 다시 호출하면 기존 브리핑을 그대로 반환한다(`reused: true`).
`Authorization` 헤더가 없거나 틀리면 `401`.

### 5) 배포 / Cron

1. Vercel에 배포하고 `.env.local`과 같은 값을 Environment Variables에 등록한다.
2. [vercel.json](./vercel.json)의 cron이 매일 `30 22 * * *` UTC(= **07:30 KST**)에
   `/api/cron/daily-briefing`을 호출한다.
3. Vercel은 `CRON_SECRET`이 설정돼 있으면 `Authorization: Bearer $CRON_SECRET`을 자동으로 붙인다.

> **왜 07:30인가** — 목표 발행 시각은 08:30 KST지만 Hobby 플랜의 cron은 최대 1시간의
> 유연 창을 가진다. 한 시간 당겨 두면 늦어도 08:30 전에는 지면이 올라와 있다.
> 정시 발행이 필요해지면 외부 스케줄러가 같은 endpoint를 호출하도록 바꾸면 되고,
> **생성 로직은 건드리지 않는다.**

---

## 5. 설계 결정 기록

3~4일 안에 끝내기 위해 **의도적으로 하지 않은 것들**이다.

| 결정 | 대신 선택한 것 | 이유 |
| --- | --- | --- |
| 별도 백엔드 서버 없음 | Next.js Route Handler + Server Component | 배포 단위 하나로 충분하다 |
| 뉴스 API 없음 | OpenAI `web_search` tool | 수집 코드를 service layer로 분리해 두어 언제든 교체 가능 |
| 회원가입 · Auth 없음 | 고정 `USER_PROFILE` 하나 | 개인화의 본질은 로그인이 아니라 **학습 이력**이다 |
| RAG · Vector DB 없음 | 코드로 고정한 curriculum 순서 | 학습 순서는 검색이 아니라 커리큘럼의 문제다 |
| 상태관리 라이브러리 없음 | Server Component + 작은 Provider | 클라이언트 상태가 거의 없다 |
| 달력 UI 없음 | 월별 텍스트 리스트 | 신문 아카이브라는 은유에 맞는다 |

동시에 **개인화의 확장 여지는 데이터 구조에만 남겨 두었다.**
지금은 프로필이 하나지만 `IT/디지털` · `IB` · `WM` · `S&T` 직무별로 늘릴 수 있는 형태다.

---

## 6. 진행 상황

- [x] 프로젝트 세팅 (Next.js 16 / Tailwind v4 / 폴더 구조 / 환경변수 Zod 검증)
- [x] 신문 UI — Masthead · 오늘의 키워드 + 한 줄 · 증권 상식 · 경제 이슈 · 출처
- [x] curriculum 91개 (LEVEL 1~10) + 미학습 개념 선정 · 복습 전환
- [x] Supabase 스키마 · 조회 / 저장 · `generation_logs`
- [x] OpenAI 2-step 연동 (`collectMarketNews` → `generateDailyBriefing`) + Zod 검증
- [x] `/api/cron/daily-briefing` — 인증 · 중복 생성 방지 · 실패 시 기존 브리핑 유지
- [x] Vercel Cron 스케줄 (Hobby 유연 창을 감안해 07:30 KST)
- [x] Archive 목록 · 날짜별 상세 · 이전 호 / 다음 호 이동
- [x] 증권 상식 / 경제 이슈 탭 분리 · 왼쪽 기사 레일
- [x] 학습 완료 체크 + 메모 (`study_logs`, `/api/study-log`)
- [x] Loading / Empty / Error / Not Found state
- [x] 모바일 1단 · 데스크톱 2단 반응형
- [ ] Vercel Production 배포 (환경변수 등록 후 실제 브리핑 생성 확인)

---

## 7. 확인해야 할 것

배포 전 최소한 이 항목은 직접 확인한다.

| 항목 | 확인 내용 |
| --- | --- |
| Date | UTC 환경에서도 KST 날짜가 정확한가 |
| Curriculum | 이미 학습한 개념이 다시 선택되지 않는가 |
| Generation | 뉴스 3개 이상 · 국내 / 글로벌이 각각 존재하는가 |
| Idempotency | 같은 날짜로 두 번 호출해도 row가 하나인가 |
| Security | `CRON_SECRET` 없이 호출하면 401인가 |
| UI | 모바일에서 가로 스크롤이 생기지 않는가 |

---

## 8. 다음에 할 만한 것

Day 1~3 기능이 안정된 뒤에만 손댄다.

```text
간단한 Password Gate
직무 관심사 설정 (IT/디지털 · IB · WM · S&T)
뉴스 카테고리 필터
학습 Progress · 주간 복습
면접 질문 모아보기
onBriefingPublished() 훅으로 이메일 / 푸시 연결
```

---

<div align="center">

Generated with AI from publicly available sources.<br>
For educational purposes only. **Not investment advice.**

</div>
