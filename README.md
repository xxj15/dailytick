

# DAILY TICK

- **증권사/금융권에 관심이 많은 사람들을 위한 데일리 금융 학습 서비스**입니다.  

- 매일 아침 최신 경제 이슈와 증권 상식을 한 번에 확인할 수 있습니다.

- `Next.js` · `TypeScript` · `Tailwind CSS` · `Supabase` · `OpenAI API` · `Vercel`

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
공개 본문 수집 · 근거 문장 대조
     │
     ▼
브리핑 생성
     │
     ▼
Zod · 출처 · 수치 · 의미 검토
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

뉴스 탐색, 실제 자료 확보, 근거 선택, 작성, 발행 전 검토를 분리합니다.

### STEP 1. 뉴스 수집

`collectMarketNews()`

OpenAI `web_search`를 이용해 최근 24시간의 국내·글로벌 뉴스 후보를 수집합니다.
검색을 필수로 호출하고 완료된 도구 기록에 있는 URL만 남깁니다.
모델이 JSON에 적은 URL만으로 실제 출처라고 판단하지 않습니다.

### STEP 2. 본문 확보와 근거 선택

`groundMarketNews()`

공개 기사나 공식 발표의 HTML을 서버에서 직접 읽고 본문·게시 정보를 추출합니다.
첫 출처를 읽을 수 없으면 같은 후보의 다른 출처를 최대 3개까지 확인합니다.
검색 요약과 AI가 적은 게시일은 발행 근거로 사용하지 않습니다.

AI는 본문에서 연속된 근거 문장 1~3개를 선택합니다. 서버가 문장과 sourceId를 실제 자료와
대조하고, 실제 게시일이 최신 범위 안에 있는 후보만 다음 단계로 전달합니다.
본문을 확보한 후보가 없으면 새 브리핑을 저장하지 않습니다.

### STEP 3. 브리핑 생성

`generateDailyBriefing()`

AI는 후보 ID·사실 ID를 선택하고 제목·금융 해설을 작성합니다.
`whatHappened`와 출처는 서버가 검증된 문장·게시 정보로 조합합니다.
화면에는 해당 사실 본문이 출처 원문 발췌라는 점을 표시합니다.

```text
원문으로 대조한 근거 문장
+ 오늘의 금융 개념
+ 학습 이력
        ↓
  OpenAI 생성
        ↓
   Zod 검증
        ↓
 출처·수치 대조
        ↓
 독립된 AI 호출로 의미 검토
        ↓
정렬 및 후처리
        ↓
  Supabase 저장
```

제목·해설의 새 수치, 전년 실적과 올해 실적 혼동, 사건일과 게시일 혼동 등을 검사합니다.
의미 검토가 실패하거나 뉴스별 검토 결과가 누락되면 저장하지 않습니다.
내용 위반은 1회 수정 재시도하고, API 장애나 전체 실행 기한 초과는 중단합니다.

의미 검토도 AI 판단이므로 완전한 사실 검증을 보장하지 않습니다.
원문 문장 일치 검사와 출처 기록에 더하는 발행 조건입니다.

### 수집 범위와 실행 제한

- 공개 HTTPS HTML의 기사·발표 본문만 지원합니다. PDF/HWP 첨부, JavaScript로만 표시되는 본문,
  로그인·유료 자료, 게시 정보를 확인할 수 없는 자료는 제외합니다.
- 출처 요청은 10초·1.5MB·redirect 3회로 제한합니다. DNS로 확인한 공인 IPv4에 연결하며
  내부 주소·IP 직접 입력·비표준 포트·IPv6-only 출처는 수집하지 않습니다.
- 최대 10개 후보를 동시에 3개씩 처리합니다. AI에 전달할 본문은 자료당 12,000자로 제한합니다.
- 개별 AI 요청은 60초, 수집·작성 전체는 260초로 제한합니다. 자동 SDK 재시도는 사용하지 않습니다.
- 검색·근거 선택·작성·의미 검토의 토큰과 검색 호출 수를 합산하므로 이전보다 호출 비용이 늘어납니다.

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
| 뉴스 개수  | 근거가 있는 1~5개. 0개면 생성 실패 |
| 지역     | 국내 / 글로벌 균형을 선호하되 근거 확보 우선 |
| 출처     | 도구 기록의 URL + 서버에서 읽은 본문·게시 정보 |
| 사실 본문 | 검증한 원문 문장을 서버에서 조합 |
| 해설의 수치 | 선택한 근거에 없는 숫자 차단 |
| 의미 검토 | 모든 뉴스·상단 요약·교육 내용을 원문과 대조 |
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
export const PROMPT_VERSION = "v10";
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
`audit`에는 검색 기록, 출처별 탈락 이유, 채택한 짧은 근거·URL·수집 시각·본문 hash,
의미 검토 결과와 실패 단계를 저장합니다. 원문 전체는 로그에 복제하지 않습니다.
발행된 뉴스의 근거는 `briefings.news_items[*].evidence`에도 함께 저장합니다.

생성을 몇 번 시도했는지와 검증에 걸린 사례도 남깁니다.
재시도로 통과한 경우의 1차 위반까지 남기므로,
어떤 기준이 가장 자주 깨지는지 확인할 수 있습니다.

```sql
select v->>'code' as code, count(*)
from generation_logs, jsonb_array_elements(violations) v
group by 1 order by 2 desc;
```

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
│   ├── news/
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

기존 DB에는 `supabase/migrations/20261009_news_evidence_audit.sql`을 실행합니다.
이 마이그레이션 전에도 기본 생성 로그는 저장하지만 상세 `audit` 로그는 저장할 수 없습니다.
기존 브리핑의 JSON 형식은 계속 읽을 수 있으며 과거 내용을 자동으로 덮어쓰지 않습니다.

### 3. 실행

```bash
npm install
npm run dev
```

### 4. 테스트

```bash
npm test
```

Node.js 22.15 이상에서 실행합니다. 날짜·개념 선정과 함께 검색 출처, 본문 추출,
근거 없는 숫자, 과거 사건의 시점 혼동, 검토 장애, 발행 차단·재시도·기존 브리핑 보존을 확인합니다.
외부 통신과 OpenAI·DB 쓰기는 테스트용 함수로 대체합니다.

### 5. 브리핑 수동 생성

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

개인적인 학습 용도로 만든 서비스입니다. 상업적 이용 X

</div>
