<div align="center">

# DAILY TICK

**증권사 취준생을 위한 데일리 금융 학습 서비스**

매일 아침 최신 경제 이슈와 증권 상식을 한 번에 확인할 수 있습니다.

`Next.js` · `TypeScript` · `Tailwind CSS` · `Supabase` · `OpenAI API` · `Vercel`

</div>

---

## 주요 기능

### 오늘의 경제 이슈

최근 국내·글로벌 금융 뉴스 중 주요 이슈를 선별해 제공합니다.

각 이슈는 다음 순서로 정리됩니다.

```text
무슨 일이 있었는지
→ 왜 중요한지
→ 주식 · 금리 · 환율에 어떤 영향을 줄 수 있는지
→ 관련 기사 출처
```

### 오늘의 증권 상식

미리 구성한 금융 커리큘럼을 기준으로 하루 1~2개의 개념을 제공합니다.

```text
개념 설명
→ 예시
→ 증권사 업무와의 연결점
→ 생각해볼만한 질문
```

총 91개의 금융 개념을 `LEVEL 1 ~ 10` 순서로 학습하며,
모든 개념을 학습한 뒤에는 오래전에 다룬 개념부터 복습합니다.

### 학습 기록

* 학습 완료 체크
* 날짜별 메모 저장
* 지난 브리핑 다시 보기
* 이전 호 / 다음 호 이동

---

## 화면 구성

| 경로                | 설명         |
| ----------------- | ---------- |
| `/`               | 오늘의 브리핑    |
| `/archive`        | 지난 브리핑 목록  |
| `/archive/[date]` | 날짜별 브리핑 상세 |

신문을 읽는 느낌을 살리기 위해 흑백 중심의 레이아웃으로 구성했습니다.

---

## Tech Stack

| 분류         | 기술                                  |
| ---------- | ----------------------------------- |
| Framework  | Next.js 16                          |
| Language   | TypeScript                          |
| UI         | React 19                            |
| Styling    | Tailwind CSS v4                     |
| Validation | Zod                                 |
| AI         | OpenAI Responses API + `web_search` |
| Database   | Supabase PostgreSQL                 |
| Deploy     | Vercel                              |
| Scheduler  | Vercel Cron                         |

---

## 동작 방식

브리핑은 사용자가 페이지에 접속할 때 생성하지 않습니다.

매일 Cron을 통해 미리 생성한 뒤 Supabase에 저장하고,
페이지에서는 저장된 브리핑만 조회합니다.

```text
Vercel Cron
     │
     ▼
/api/cron/daily-briefing
     │
     ▼
최신 뉴스 수집
     │
     ▼
브리핑 생성
     │
     ▼
Zod 검증
     │
     ▼
Supabase 저장
     │
     ▼
페이지에서 조회
```

이를 통해 AI 응답 시간과 페이지 로딩을 분리했습니다.

---

## 브리핑 생성

AI 호출은 뉴스 수집과 브리핑 생성을 두 단계로 나눴습니다.

### STEP 1. 뉴스 수집

`collectMarketNews()`

OpenAI `web_search`를 이용해 최근 24시간의 국내·글로벌 뉴스 후보를 수집합니다.

### STEP 2. 브리핑 생성

`generateDailyBriefing()`

수집한 뉴스와 오늘 학습할 금융 개념을 기반으로 브리핑을 생성합니다.

```text
뉴스 후보
+ 오늘의 금융 개념
+ 학습 이력
        ↓
  OpenAI 생성
        ↓
   Zod 검증
        ↓
정렬 및 후처리
        ↓
  Supabase 저장
```

AI 응답을 그대로 저장하지 않고 코드에서 한 번 더 검증합니다.

---

## 금융 개념 리스트

금융 개념은 AI가 임의로 선택하지 않습니다.

`src/data/curriculum.ts`에 학습 순서를 정의해 두고,
아직 나오지 않은 개념 중 가장 앞에 있는 개념을 선택합니다.

```text
전체 개념 리스트 (커리큘럼)
      ↓
기존 브리핑 조회
      ↓
이미 나온 개념 제외
      ↓
다음 개념 1~2개 선택
```

총 91개 개념 중 일부는 `pairWith`로 묶어 함께 학습하도록 구성했습니다.

모든 개념을 학습하면 가장 오래전에 등장한 개념부터 복습합니다.

---

## 데이터 검증

생성형 AI의 결과를 그대로 사용하지 않기 위해 몇 가지 검증을 추가했습니다.

| 항목     | 처리                   |
| ------ | -------------------- |
| 응답 형식  | Zod Schema 검증        |
| 검증 실패  | 1회 재시도               |
| 뉴스 개수  | 최소 3개                |
| 지역     | 국내 / 글로벌 뉴스 모두 포함    |
| 출처     | 뉴스별 실제 URL 필수        |
| 중복 뉴스  | 같은 사건은 하나로 정리        |
| 오래된 뉴스 | 새로운 변화가 없다면 재사용하지 않음 |
| 중복 생성  | 같은 날짜는 하나의 브리핑만 저장   |
| 생성 실패  | 기존 브리핑 유지            |

`briefing_date`를 Unique 값으로 관리해 같은 날짜의 Cron이 여러 번 호출되어도 브리핑이 중복 생성되지 않습니다.

---

## Prompt Versioning

프롬프트는 한 파일에서 관리합니다.

```text
src/lib/openai/prompts.ts
```

프롬프트 내용이 변경되면 `PROMPT_VERSION`을 올리고
브리핑 데이터에도 해당 버전을 함께 저장합니다.

```ts
export const PROMPT_VERSION = "v8";
```

생성 결과에 문제가 생겼을 때 어떤 모델과 프롬프트를 사용했는지 확인할 수 있습니다.

---

## Database

Supabase에서는 세 개의 테이블을 사용합니다.

### `briefings`

날짜별 브리핑 데이터를 저장합니다.

```text
knowledge_items
news_items
today_keywords
one_liner
model
prompt_version
```

### `generation_logs`

브리핑 생성 결과를 기록합니다.

```text
running
success
failed
```

토큰 사용량, `web_search` 호출 수, 오류 내용도 함께 저장합니다.

### `study_logs`

사용자의 학습 완료 여부와 메모를 저장합니다.

---

## Timezone

Vercel 서버의 기본 timezone을 사용하지 않고
모든 날짜를 `Asia/Seoul` 기준으로 처리합니다.

```ts
getTodayKST();
```

UTC 서버에서 실행되더라도 한국 날짜와 브리핑 날짜가 어긋나지 않도록 했습니다.

---

## Project Structure

```text
src/
├── app/
│   ├── page.tsx
│   ├── archive/
│   │   └── [date]/page.tsx
│   └── api/
│       ├── cron/daily-briefing/
│       └── study-log/
│
├── components/
│   ├── briefing/
│   └── layout/
│
├── config/
│   └── app.ts
│
├── data/
│   └── curriculum.ts
│
├── lib/
│   ├── briefing/
│   ├── curriculum/
│   ├── openai/
│   ├── supabase/
│   ├── date.ts
│   └── env.ts
│
└── types/
    └── briefing.ts
```

---

## Getting Started

### 1. 환경변수

```bash
cp .env.example .env.local
```

```env
OPENAI_API_KEY=
OPENAI_MODEL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=
```

환경변수는 Zod를 이용해 검증합니다.

### 2. Database

Supabase SQL Editor에서 아래 파일을 실행합니다.

```text
supabase/schema.sql
```

### 3. 실행

```bash
npm install
npm run dev
```

### 4. 브리핑 수동 생성

```bash
curl -X POST "http://localhost:3000/api/cron/daily-briefing" \
  -H "Authorization: Bearer $CRON_SECRET"
```

특정 날짜를 생성하려면

```text
?date=YYYY-MM-DD
```

기존 브리핑을 다시 생성하려면

```text
?force=true
```

를 사용할 수 있습니다.

---

## Cron

Vercel Cron을 이용해 매일 브리핑을 생성합니다.

```text
30 22 * * *
```

UTC 22:30, 한국 시간 기준 **07:30 KST**입니다.

목표 발행 시간인 오전 8시 30분 이전에 브리핑이 생성되도록 설정했습니다.

---

<div align="center">

개인적인 학습 용도로 만든 서비스입니다. 

</div>
