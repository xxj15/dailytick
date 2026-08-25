@AGENTS.md

# Daily Tick

> 서비스명은 코드상 `APP_NAME` 상수로 관리한다. 표기는 `Daily Tick`, Masthead 표시는 대문자 `DAILY TICK`.

## 0. 프로젝트 최우선 원칙

이 프로젝트는 **3~4일 내 완성하는 1인 프로젝트**다.

가장 중요한 목표는 첫날 안에 아래 Vertical Slice를 완성하는 것이다.

```text
실제 최신 경제 뉴스 검색
        ↓
OpenAI API 분석
        ↓
오늘의 증권 상식 + 경제 이슈 생성
        ↓
Supabase 저장
        ↓
Next.js 메인 페이지 표시
        ↓
Vercel 배포
```

기능을 많이 만드는 것보다 이 전체 흐름이 실제로 동작하는 것을 우선한다.

개발 중 선택지가 생기면 다음 우선순위를 따른다.

1. 실제 동작
2. 정보 정확성
3. 코드 단순성
4. 유지보수성
5. 디자인 완성도
6. 추가 기능

과도한 추상화, 마이크로서비스, 별도 백엔드 서버, 불필요한 상태관리 라이브러리를 만들지 않는다.

커밋 규칙 (강제):
- 새 파일 생성, 기능 구현, 리팩터링 등 의미 있는 변경 단위마다 즉시 커밋 후보를 제시한다.
- 절대 여러 기능을 하나의 커밋으로 묶지 않는다.
- "커밋해도 될까요?" 라고 명시적으로 물어보기 전까지는 git commit을 실행하지 않는다.
- 한 번에 5개 이상 파일이 새로 생겼는데 아직 커밋이 없다면, 즉시 멈추고 커밋부터 제안한다.
---

# 1. 서비스 개요

## 한 줄 정의

**증권사 취준생을 위한 개인화 데일리 금융 학습 서비스**

사용자가 경제신문을 매일 직접 읽지 않아도 매일 아침 핵심 금융·경제 이슈를 파악하고, 동시에 증권사 면접과 실무에 필요한 금융 개념을 하루 1~2개씩 누적 학습할 수 있도록 한다.

단순한 뉴스 요약 서비스가 아니다.

서비스의 핵심은 다음 두 가지를 연결하는 것이다.

```text
오늘 시장에서 실제로 일어난 일
            +
증권사 취업을 위해 알아야 할 금융 개념
            ↓
매일 읽는 개인 금융 신문
```

---

# 2. 핵심 사용자

MVP는 다중 사용자를 대상으로 하지 않는다.

하나의 고정 사용자 프로필을 기준으로 콘텐츠를 생성한다.

```ts
const USER_PROFILE = {
  goal: "증권사 취업 및 면접 대비",
  financeLevel: "beginner",
  locale: "ko-KR",
  timezone: "Asia/Seoul",
  preferredLength: "concise",
  newsGoal: "경제신문을 읽지 않아도 주요 1면급 경제 이슈를 파악",
};
```

MVP에서는 회원가입/로그인/프로필 설정 UI를 만들지 않는다.

'개인화'는 우선 다음 두 가지로 구현한다.

* 사용자의 목표가 `증권사 취업 및 면접 대비`라는 점
* 이전에 학습한 금융 개념을 DB에서 조회하여 다음 개념을 결정하는 것

향후 직무별 `IT/디지털`, `IB`, `WM`, `S&T` 개인화가 가능하도록 데이터 구조만 확장 가능하게 만든다.

---

# 3. 서비스 핵심 가치

사용자가 매일 아침 사이트에 들어왔을 때 3~5분 이내에 다음 질문에 답할 수 있어야 한다.

```text
오늘 금융시장에서 제일 중요한 일이 뭐지?

그게 왜 중요한 거지?

주식·금리·환율에는 어떤 영향을 주지?

오늘 하나 배워가야 할 증권 개념은 뭐지?

면접에서 이걸 어떻게 물어볼 수 있지?
```

---

# 4. MVP 기능 범위

## 4.1 Daily Briefing

매일 새로운 브리핑을 하나 생성한다.

기준 시간대:

```text
Asia/Seoul
```

목표 발행 시간:

```text
매일 오전 08:30 KST
```

MVP에서 '전달'의 의미는 **08:30에 오늘 브리핑이 사이트에 발행되어 있는 것**이다.

이메일, 카카오톡, Web Push 등 별도의 외부 알림 기능은 MVP에 포함하지 않는다.

추후 `onBriefingPublished()` 훅을 통해 이메일/푸시 기능을 추가할 수 있도록 한다.

---

# 5. Daily Briefing 콘텐츠 구조

하루 브리핑은 크게 세 부분이다.

```text
01. 오늘의 증권 상식
02. 오늘의 경제 이슈
03. 오늘 기억할 한 줄
```

---

# 6. 오늘의 증권 상식

매일 **1~2개의 금융/증권 개념**을 제공한다.

단순 랜덤 생성하지 않는다.

기초 → 중급 순서로 개념이 누적되어야 하며 이미 다룬 개념을 불필요하게 반복하지 않는다.

각 개념은 다음 정보를 가진다.

```ts
type KnowledgeItem = {
  slug: string;
  title: string;
  level: number;
  category: string;

  definition: string;
  explanation: string;
  example?: string;

  securitiesPoint: string;
  interviewQuestion: string;

  keywords: string[];
};
```

### 필드 의미

`definition`

한두 문장으로 개념을 정의한다.

`explanation`

금융 초보자도 이해할 수 있도록 설명한다.

`example`

가능하면 실제 숫자나 상황을 사용한다.

`securitiesPoint`

이 개념이 증권사의 실제 업무 또는 금융시장과 어떻게 연결되는지 설명한다.

`interviewQuestion`

이 개념으로 증권사 면접에서 나올 수 있는 질문을 하나 만든다.

---

# 7. 금융 개념 Curriculum

AI가 매일 마음대로 주제를 고르게 하지 않는다.

기본 금융 개념 Curriculum을 코드로 관리한다.

파일:

```text
src/data/curriculum.ts
```

초기 Curriculum 예시는 다음 순서로 구성한다.

### LEVEL 1 — 시장 기본

1. 주식과 채권의 차이
2. 시가총액
3. 코스피와 코스닥
4. 호가와 매수·매도
5. 거래량과 거래대금
6. 주가지수
7. 배당과 배당수익률
8. 공매도

### LEVEL 2 — 기업가치

9. EPS
10. PER
11. PBR
12. ROE
13. 영업이익과 당기순이익
14. 기업가치와 시가총액
15. 성장주와 가치주

### LEVEL 3 — 금리와 채권

16. 기준금리
17. 시장금리
18. 채권가격과 금리의 관계
19. 채권수익률
20. 듀레이션
21. 장단기 금리차
22. Yield Curve
23. Credit Spread

### LEVEL 4 — 거시경제

24. 물가와 CPI
25. GDP
26. 환율
27. 원화 강세·약세
28. 경상수지
29. 통화정책
30. 재정정책

### LEVEL 5 — 금융상품

31. ETF
32. ETN
33. 펀드
34. 선물
35. 옵션
36. ELS
37. DLS

### LEVEL 6 — 증권사 업무

38. Brokerage
39. Wealth Management
40. Investment Banking
41. ECM
42. DCM
43. Sales & Trading
44. 자기매매
45. 증권사 리서치
46. PF
47. 신용공여

### LEVEL 7 — 리스크

48. 레버리지
49. VaR
50. 유동성 위험
51. 신용위험
52. 시장위험
53. 증거금
54. 반대매매
55. NCR

### LEVEL 8 — 재무제표와 밸류에이션

56. 재무상태표
57. 손익계산서
58. 현금흐름표
59. EBITDA
60. EV/EBITDA
61. 부채비율
62. DCF 현금흐름할인법
63. 배당성향과 주주환원
64. 자사주 매입과 소각

### LEVEL 9 — 시장 제도

65. 공모와 사모
66. IPO 절차와 수요예측
67. 유상증자
68. 무상증자
69. 액면분할
70. 전환사채 CB
71. 신주인수권부사채 BW
72. 서킷브레이커와 사이드카
73. 관리종목과 상장폐지
74. 배당락과 권리락
75. 예탁결제와 T+2
76. 공시제도
77. 미공개정보 이용과 내부자거래
78. 자본시장법

### LEVEL 10 — 글로벌 시장과 자산배분

79. 미국 3대 지수
80. FOMC와 점도표
81. 미국 국채
82. 달러인덱스
83. 유가와 원자재
84. 금과 안전자산
85. 신흥국 시장
86. MSCI 지수 편입
87. 캐리트레이드
88. 자산배분
89. 분산투자와 상관관계
90. 알파와 베타
91. 샤프지수

현재 91개다. 이 중 17개가 `pairWith`로 묶여 하루 2개씩 나가므로
신규 콘텐츠는 74일치다.

향후 추가 가능하도록 한다.

---

# 8. 오늘 학습 개념 선정 알고리즘

오늘의 금융 개념은 다음 방식으로 결정한다.

```text
curriculum 전체 목록
        ↓
DB에서 과거 briefing 조회
        ↓
이미 학습한 concept slug 제외
        ↓
가장 앞 순서의 미학습 concept 선택
        ↓
1개 또는 2개 생성
```

기본값:

```text
하루 1개
```

서로 매우 밀접한 개념일 경우 최대 2개까지 함께 다룰 수 있다.

예:

```text
EPS + PER
기준금리 + 시장금리
선물 + 옵션
ECM + DCM
```

AI가 curriculum 순서를 임의로 바꾸지 않는다.

curriculum을 모두 소화하면 복습으로 전환한다.

```text
미학습 concept 없음
        ↓
가장 오래전에 다룬 concept 선택
        ↓
knowledge item에 review: true 기록
```

늘 첫 concept으로 돌아가면 같은 개념만 매일 반복된다.

학습 이력 조회에는 행 수 제한을 두지 않는다.
제한을 두면 창 밖으로 밀려난 concept이 미학습으로 판정되어 다시 출제된다.

뉴스와 관련된 고급 개념이 등장해도 아직 학습 순서가 아니라면 간단하게 언급할 수는 있지만 `오늘의 증권 상식` 주제로 강제로 선정하지 않는다.

---

# 9. 오늘의 경제 이슈

매일 최소 **3개**, 최대 **5개**를 제공한다.

기본값:

```text
3개
```

단순히 검색 결과 상위 뉴스를 가져오는 것이 아니다.

**한국 증권시장과 금융시장에 중요한 뉴스**를 선별한다.

---

# 10. 뉴스 선정 기준

우선순위가 높은 뉴스는 다음과 같다.

```text
한국은행 / 미국 Fed 금리
물가
환율
국채금리
정부 경제·금융 정책
대형 기업 실적
반도체
AI 투자
은행·증권·보험
주주환원
M&A
IPO
원유·원자재
미국·중국 경제
글로벌 무역
지정학적 리스크
시장 급등락
```

연예, 생활, 일반 사회 뉴스는 제외한다.

증권시장에 영향이 거의 없는 정치 뉴스도 제외한다.

단, 경제정책·규제·세금·무역정책 등 금융시장에 직접 영향을 주는 정치 이슈는 포함 가능하다.

---

# 11. '1면급 뉴스'의 정의

실제 종이신문 1면에 실렸는지만 판단하지 않는다.

이 서비스에서 `1면급`은 다음 의미로 사용한다.

```text
금융시장 영향도가 크고
오늘 경제를 이해하기 위해
놓치면 안 되는 뉴스
```

다음 기준을 종합적으로 판단한다.

```text
시장 파급력
최신성
한국 투자자 관련성
글로벌 영향력
금리/주식/환율 연결 가능성
증권사 면접 활용 가능성
```

---

# 12. 뉴스 최신성 규칙

현재 날짜는 항상 **Asia/Seoul 기준**으로 계산한다.

뉴스 후보는 원칙적으로 최근 24시간 이내 보도를 우선한다.

48시간 이상 지난 이슈는 새로운 변화가 발생하지 않은 이상 오늘 뉴스로 다시 사용하지 않는다.

지속되는 이슈를 다시 다룰 경우 반드시 다음을 설명해야 한다.

```text
"오늘 새롭게 바뀐 점"
```

과거 뉴스를 오늘 일어난 것처럼 표현하는 것을 절대 금지한다.

기사의 `published_at`과 실제 사건 발생 시점을 구분한다.

---

# 13. 국내 + 글로벌 균형

하루 뉴스 최소 3개 중:

```text
국내 이슈 최소 1개
글로벌 이슈 최소 1개
```

를 반드시 만족해야 한다.

예:

```text
1. 한국은행 금리
2. 삼성전자 / SK하이닉스
3. 미국 Fed / Nvidia / 미국 CPI
```

처럼 구성할 수 있다.

---

# 14. 경제 이슈 데이터 구조

```ts
type NewsIssue = {
  rank: number;

  title: string;

  region: "KR" | "GLOBAL";

  category:
    | "rates"
    | "stocks"
    | "fx"
    | "macro"
    | "industry"
    | "policy"
    | "geopolitics"
    | "commodities"
    | "other";

  whatHappened: string;

  whyImportant: string;

  marketImpact: {
    stocks?: string;
    rates?: string;
    fx?: string;
    industry?: string;
  };

  interpretation?: string;

  sources: NewsSource[];
};
```

Source:

```ts
type NewsSource = {
  publisher: string;
  title: string;
  url: string;
  publishedAt?: string;
};
```

---

# 15. 경제 이슈 출력 형식

각 이슈는 반드시 다음 흐름으로 보여준다.

```text
무슨 일이 있었나
↓
왜 중요한가
↓
시장에 어떤 영향을 줄 수 있나
```

가능하면 다음 자산에 미치는 영향을 구체적으로 구분한다.

```text
주식
금리
환율
산업
```

모든 자산을 억지로 채우지는 않는다.

관련 있는 항목만 출력한다.

---

# 16. 사실과 해석 구분

AI는 다음을 명확하게 구분한다.

### Fact

실제로 발표되거나 보도된 내용.

### Interpretation

그 사실이 금융시장에 미칠 수 있는 영향에 대한 분석.

해석을 사실처럼 단정하지 않는다.

예:

```text
X
금리 인상으로 주가는 하락한다.

O
금리 인상은 일반적으로 성장주의 밸류에이션에 부담 요인이 될 수 있다.
```

---

# 17. 뉴스 출처

각 뉴스 이슈에는 최소 1개 이상의 실제 출처 URL이 있어야 한다.

가능하면 중요한 뉴스는 복수 출처로 교차 확인한다.

선호 소스 예:

```text
Reuters
Bloomberg
Financial Times
CNBC

연합뉴스
한국경제
매일경제
서울경제
조선비즈

한국은행
금융위원회
금융감독원
기획재정부
통계청
Fed
SEC
기업 IR
```

가능하면 공식 발표 자료를 사실 확인에 우선 활용한다.

기사 전문을 DB에 저장하지 않는다.

저장하는 것은 다음뿐이다.

```text
기사 제목
매체
URL
게시 시각
AI가 작성한 요약
```

---

# 18. 오늘 기억할 한 줄

Daily Briefing 마지막에는 반드시 다음 필드가 존재한다.

```ts
oneLiner: string;
```

목표:

오늘 금융시장을 한 문장으로 기억하도록 만든다.

예:

```text
오늘 시장의 핵심은 금리의 방향보다 시장이 예상하던 방향과 얼마나 달랐는지다.
```

길이는 최대 두 문장.

---

# 19. AI Architecture

별도의 AI 서버를 만들지 않는다.

Next.js Server Route에서 OpenAI API를 호출한다.

```text
Next.js
  ↓
OpenAI Responses API
  ↓
Web Search
  ↓
Structured Result
  ↓
Supabase
```

OpenAI API Key는 절대 브라우저로 노출하지 않는다.

---

# 20. AI 생성 흐름

AI 처리는 가능하면 두 단계로 분리한다.

## STEP 1 — 최신 뉴스 수집

```ts
collectMarketNews()
```

OpenAI Responses API의 `web_search` tool을 사용한다.

목표:

최근 24시간의 주요 국내/글로벌 경제 이슈 후보 약 6~10개를 찾는다.

이 단계에서는 긴 설명을 만들 필요가 없다.

수집 데이터:

```text
제목
사건 개요
지역
카테고리
출처
게시 시각
중요도
```

---

## STEP 2 — Daily Briefing 생성

```ts
generateDailyBriefing()
```

입력:

```text
뉴스 후보
오늘 선정된 금융 개념
과거 학습 history
사용자 profile
현재 날짜
```

출력:

```text
KnowledgeItem[]
NewsIssue[]
oneLiner
```

반드시 Zod Schema로 검증한다.

AI 자유 텍스트를 그대로 DB에 저장하지 않는다.

---

# 21. AI Prompt 기본 규칙

AI Prompt에는 반드시 다음 원칙이 들어가야 한다.

```text
당신은 증권사 취업을 준비하는 금융 초보자를 위한
Daily Financial Editor다.

목표는 사용자가 별도로 경제신문을 읽지 않아도
오늘 금융시장의 핵심 이슈를 이해하도록 돕는 것이다.

뉴스는 반드시 최신 검색 결과를 기반으로 작성한다.

과거 사건을 오늘 사건처럼 표현하지 않는다.

사실과 해석을 구분한다.

경제 이슈는 시장 영향도가 높은 순서대로 정렬한다.

국내/글로벌 이슈를 최소 하나씩 포함한다.

과도하게 어려운 금융용어를 사용하지 않는다.

필요한 금융용어는 한 문장으로 설명한다.

투자 추천이나 매수·매도 지시를 하지 않는다.

증권 상식은 전달받은 curriculum concept만 설명한다.

이전 학습 개념을 불필요하게 반복하지 않는다.
```

---

# 22. AI 모델

모델명을 코드에 직접 여러 곳 하드코딩하지 않는다.

환경변수:

```env
OPENAI_MODEL=
```

으로 관리한다.

초기에는 비용 효율적인 모델을 사용한다.

현재 기본 후보:

```text
gpt-5.6-luna
```

모델 교체가 한 줄로 가능해야 한다.

---

# 23. 기술 스택

## Frontend / Full-stack

```text
Next.js
App Router
TypeScript
React
```

별도의 Express, NestJS, Spring Boot, FastAPI 서버를 만들지 않는다.

Next.js Route Handler와 Server Component를 백엔드 역할로 사용한다.

---

## Styling

```text
Tailwind CSS
```

필요하면 아이콘만:

```text
lucide-react
```

를 사용한다.

대규모 UI Component Library는 필수 아님.

---

## Validation

```text
Zod
```

용도:

```text
OpenAI structured output validation
API request validation
환경변수 validation
```

---

## Database

```text
Supabase
PostgreSQL
```

Supabase는 주로:

```text
Daily Briefing 저장
과거 학습 기록 조회
Archive
Generation Log
```

용도로 사용한다.

Auth와 Storage는 MVP에서는 사용하지 않는다.

---

## AI

```text
OpenAI API
Responses API
Web Search Tool
```

별도 뉴스 API는 MVP에서 사용하지 않는다.

필요할 경우 추후 뉴스 API로 교체할 수 있도록 뉴스 수집 코드를 service layer로 분리한다.

---

## Deploy

```text
Vercel
```

---

# 24. Scheduler

Generation endpoint:

```text
/api/cron/daily-briefing
```

실제 브리핑 생성 로직과 Scheduler를 분리한다.

```text
Scheduler
   ↓
HTTP endpoint
   ↓
generateDailyBriefing()
```

그러면 스케줄러를 바꿔도 서비스 코드는 변경되지 않는다.

### Vercel Pro 사용 시

08:30 KST = 전날 23:30 UTC이므로:

```cron
30 23 * * *
```

을 사용할 수 있다.

### Vercel Hobby 사용 시

분 단위 정확한 Cron 실행을 전제로 구현하지 않는다.

외부 Scheduler가 같은 API endpoint를 호출하도록 구성할 수 있어야 한다.

Scheduler 교체 때문에 AI 생성 로직을 수정하지 않아야 한다.

---

# 25. Cron Endpoint 보안

Cron API는 외부 누구나 실행할 수 있으면 안 된다.

환경변수:

```env
CRON_SECRET=
```

사용.

요청 header:

```text
Authorization: Bearer {CRON_SECRET}
```

가 일치하지 않을 경우:

```text
401 Unauthorized
```

를 반환한다.

---

# 26. Idempotency

같은 날짜의 Cron이 두 번 실행되더라도 브리핑이 중복 생성되지 않아야 한다.

`briefing_date`에 unique constraint를 둔다.

기본 동작:

```text
오늘 briefing 존재
      ↓
새로 생성하지 않음
      ↓
existing briefing 반환
```

개발 과정에서는:

```text
force=true
```

옵션을 통해 재생성이 가능하도록 할 수 있다.

Production cron에서는 `force=false`.

---

# 27. DB Schema

## briefings

```sql
create table briefings (
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
```

---

## generation_logs

가능하면 추가한다.

```sql
create table generation_logs (
  id uuid primary key default gen_random_uuid(),

  briefing_date date not null,

  status text not null,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  input_tokens integer,
  output_tokens integer,
  web_search_calls integer,

  error_message text,

  created_at timestamptz not null default now()
);
```

`status` 예:

```text
running
success
failed
```

첫날 시간이 부족하면 `generation_logs`는 Day 2로 미룰 수 있다.

---

# 28. 날짜 처리

서버의 기본 timezone을 신뢰하지 않는다.

모든 서비스 날짜 판단은 명시적으로:

```text
Asia/Seoul
```

기준으로 한다.

다음 코드는 피한다.

```ts
new Date().toISOString().slice(0, 10);
```

서버가 UTC이기 때문에 한국 날짜와 달라질 수 있다.

공통 util을 만든다.

```text
src/lib/date.ts
```

예:

```ts
getTodayKST()
formatKoreanDate()
```

---

# 29. Page Structure

MVP 페이지는 세 개면 충분하다.

```text
/
오늘 브리핑

/archive
지난 브리핑 목록

/archive/[date]
특정 날짜 브리핑
```

추가 페이지를 만들지 않는다.

---

# 30. Main Page

메인 페이지 `/`는 오늘의 신문 역할을 한다.

구조:

```text
Masthead

날짜 / Issue Number / Generated Time

오늘 기억할 한 줄

--------------------------------

오늘의 증권 상식
              |
              | 오늘의 경제 이슈
              |

Sources

Archive Link

Footer
```

Desktop에서는 2 column 사용 가능.

권장 비율:

```text
Knowledge 35%
News      65%
```

Mobile에서는 1 column으로 변경한다.

순서:

```text
오늘 기억할 한 줄
오늘의 증권 상식
오늘의 경제 이슈
```

---

# 31. Archive

`/archive`

날짜별 브리핑을 보여준다.

화려한 달력 UI는 만들지 않는다.

신문 Archive 같은 단순 리스트를 사용한다.

예:

```text
AUGUST 2026

25  금리와 채권가격
24  PER과 PBR
23  기준금리
22  시가총액
```

각 행 클릭 시:

```text
/archive/2026-08-25
```

로 이동한다.

---

# 32. 브리핑이 없는 경우

오늘 브리핑이 아직 없으면 빈 화면을 보여주지 않는다.

현재 시간이 08:30 이전이라면:

```text
오늘의 브리핑은 오전 8:30에 발행됩니다.
```

08:30 이후인데 생성 실패했다면:

```text
오늘의 브리핑을 준비하고 있습니다.
잠시 후 다시 확인해주세요.
```

그리고 가장 최근 브리핑 링크를 제공한다.

AI 실패 때문에 서비스 전체 페이지가 500 Error가 되어서는 안 된다.

---

# 33. Design Concept

키워드:

```text
Black & White
Newspaper
Editorial
Minimal
Serious
Clean
Financial
```

"AI 서비스처럼 보이는 UI"를 피한다.

챗봇 UI를 사용하지 않는다.

카드가 잔뜩 배치된 SaaS Dashboard 스타일도 피한다.

---

# 34. Color

기본적으로 흑백만 사용한다.

```text
Background  #FAFAFA 또는 #FFFFFF
Primary     #111111
Secondary   #666666
Border      #D8D8D8
Muted       #F3F3F3
```

Gradient 사용 금지.

화려한 Accent Color 사용 금지.

---

# 35. Typography

신문 느낌을 위해 제목과 본문의 font 계열을 구분한다.

추천:

```text
Headline:
Noto Serif KR

Body:
Noto Sans KR
```

`next/font`를 사용한다.

Masthead는 대문자 또는 강한 Serif Typography 사용.

예:

```text
DAILY TICK
```

아래에 작게:

```text
DAILY FINANCIAL BRIEFING
```

---

# 36. UI Styling Rules

다음은 피한다.

```text
과한 border-radius
과한 box-shadow
gradient
emoji 남발
색상 tag 남발
glassmorphism
거대한 hero section
불필요한 animation
```

신문처럼:

```text
얇은 border
큰 제목
여백
열(column)
텍스트 계층
번호
```

를 활용한다.

---

# 37. Masthead 예시

```text
---------------------------------------------------------

                     DAILY TICK
              DAILY FINANCIAL BRIEFING

AUGUST 25, 2026                           NO. 001

---------------------------------------------------------
```

아래에:

```text
TODAY'S TAKEAWAY

"오늘 시장의 핵심은 금리 그 자체보다
시장의 예상과 실제 결정의 차이다."
```

처럼 오늘 한 줄을 크게 배치한다.

---

# 38. News UI

각 뉴스는 카드보다 기사 형식에 가깝게 표현한다.

```text
01 / RATES

한국은행 금통위, 추가 금리 인상 가능성

무슨 일이 있었나
...

왜 중요한가
...

MARKET IMPACT
STOCKS  ...
RATES   ...
FX      ...

SOURCE
Reuters · 한국경제
```

뉴스 간 구분은 `border-top` 또는 whitespace 사용.

---

# 39. Knowledge UI

예:

```text
TODAY'S KNOWLEDGE

기준금리와 채권가격

기준금리는 중앙은행이...
...

WHY IT MATTERS

증권사 채권 운용에서는...

INTERVIEW

"기준금리가 25bp 상승하면
금융시장에는 어떤 변화가 생길까요?"
```

---

# 40. Sources UI

각 뉴스 출처는 클릭 가능해야 한다.

새 탭으로 연다.

```text
target="_blank"
rel="noopener noreferrer"
```

출처 없는 뉴스는 발행하지 않는 것을 원칙으로 한다.

---

# 41. Footer

하단에 작게 표시한다.

```text
Generated with AI from publicly available sources.
For educational purposes only. Not investment advice.
```

과도하게 눈에 띄지 않게 한다.

---

# 42. Recommended Folder Structure

```text
src/
├── app/
│   ├── page.tsx
│   │
│   ├── archive/
│   │   ├── page.tsx
│   │   └── [date]/
│   │       └── page.tsx
│   │
│   └── api/
│       └── cron/
│           └── daily-briefing/
│               └── route.ts
│
├── components/
│   ├── briefing/
│   │   ├── BriefingHeader.tsx
│   │   ├── KnowledgeSection.tsx
│   │   ├── NewsSection.tsx
│   │   ├── NewsArticle.tsx
│   │   ├── MarketImpact.tsx
│   │   └── SourceLinks.tsx
│   │
│   └── layout/
│       ├── Masthead.tsx
│       └── Footer.tsx
│
├── data/
│   └── curriculum.ts
│
├── lib/
│   ├── openai/
│   │   ├── client.ts
│   │   ├── collect-news.ts
│   │   ├── generate-briefing.ts
│   │   ├── prompts.ts
│   │   └── schemas.ts
│   │
│   ├── supabase/
│   │   ├── client.ts
│   │   └── briefings.ts
│   │
│   ├── curriculum/
│   │   └── select-next-concepts.ts
│   │
│   ├── date.ts
│   └── env.ts
│
├── types/
│   └── briefing.ts
│
└── config/
    └── app.ts
```

폴더를 지나치게 세분화하지 않는다.

실제 파일이 필요할 때만 생성한다.

---

# 43. Environment Variables

`.env.local`

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

CRON_SECRET=

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Production에서는 동일한 값을 Vercel Environment Variables에 등록한다.

API Key와 Service Role Key는 절대 Git에 commit하지 않는다.

---

# 44. Supabase Access

MVP에서는 브라우저가 Supabase에 직접 데이터를 쓰지 않는다.

구조:

```text
Browser
   ↓
Next.js Server
   ↓
Supabase
```

OpenAI API 호출과 Supabase write는 모두 Server Side에서 수행한다.

---

# 45. Generation Function

핵심 비즈니스 로직은 route handler 안에 전부 작성하지 않는다.

다음 함수로 분리한다.

```ts
async function createDailyBriefing(date: string) {
  const previousBriefings = await getPreviousBriefings();

  const concepts = selectNextConcepts(previousBriefings);

  const newsCandidates = await collectMarketNews(date);

  const briefing = await generateDailyBriefing({
    date,
    concepts,
    newsCandidates,
    previousBriefings,
  });

  await saveBriefing(briefing);

  return briefing;
}
```

Cron route는 이 함수만 호출한다.

---

# 46. AI Output Validation

AI의 응답을 항상 신뢰하지 않는다.

Zod Schema 검증 실패 시:

```text
retry 1회
```

한다.

두 번째도 실패하면 DB에 잘못된 데이터를 저장하지 않는다.

Generation log에 error 기록.

---

# 47. Generation Failure Strategy

다음 경우 실패 처리한다.

```text
뉴스가 3개 미만
source URL 없음
국내 뉴스 0개
글로벌 뉴스 0개
필수 필드 누락
Schema Validation 실패
OpenAI API 오류
```

실패 시 기존 브리핑을 삭제하지 않는다.

---

# 48. 중복 뉴스 제거

여러 언론사가 같은 사건을 보도했다고 각각 하나의 뉴스로 만들지 않는다.

예:

```text
Reuters
Bloomberg
CNBC

모두 Nvidia 실적 기사
```

라면 하나의 `NewsIssue`로 묶고 Source만 여러 개 저장한다.

---

# 49. 정보 정확성 원칙

절대로 허용하지 않는다.

```text
존재하지 않는 기사 URL
존재하지 않는 통계
날짜가 다른 사건을 오늘 사건으로 표현
출처 없는 숫자
AI가 추측한 수치를 사실로 표현
```

정확성을 디자인보다 우선한다.

---

# 50. SEO / 개인정보

개인용 프로젝트이므로 검색 노출이 중요하지 않다.

MVP에서는:

```text
noindex
nofollow
```

를 적용한다.

멀티유저 Auth는 구현하지 않는다.

완전 비공개가 필요해지면 이후 간단한 Password Gate를 추가한다.

---

# 51. Performance

Daily Briefing은 생성 후 DB에 저장되는 정적 콘텐츠에 가깝다.

사용자가 페이지를 열 때마다 OpenAI API를 호출하면 안 된다.

```text
X
page request → OpenAI

O
cron → OpenAI → DB
page request → DB
```

페이지 조회 비용과 AI 생성 비용을 완전히 분리한다.

---

# 52. MVP에서 하지 않을 것

아래 기능은 구현하지 않는다.

```text
회원가입
소셜로그인
다중 사용자
결제
커뮤니티
댓글
실시간 주가
주식 매수/매도
포트폴리오 관리
실시간 채팅
AI 챗봇
Vector DB
Embedding
RAG Database
별도 Python Backend
Spring Backend
FastAPI Backend
모바일 앱
복잡한 관리자 페이지
```

요청하지 않은 기능을 임의로 추가하지 않는다.

---

# 53. Day 1 목표

첫날 종료 시 반드시 다음 흐름이 동작해야 한다.

```text
1. Next.js 프로젝트 생성

2. 기본 신문 UI 구현

3. Supabase briefings table 생성

4. curriculum 작성

5. OpenAI API 연결

6. web_search를 이용해 실제 최신 뉴스 검색

7. Daily Briefing 생성

8. DB 저장

9. 메인 페이지에서 DB 데이터 출력

10. Vercel Production 배포
```

Day 1에는 Cron이 없어도 된다.

수동으로:

```text
POST /api/cron/daily-briefing
```

을 실행해서 실제 브리핑이 생성되면 성공이다.

### Day 1 Definition of Done

```text
실제 오늘 뉴스가 나온다.
증권 상식이 나온다.
출처 링크가 있다.
Supabase에 저장된다.
새로고침해도 같은 내용이 나온다.
Vercel URL에서 확인할 수 있다.
```

---

# 54. Day 2 목표

```text
Cron 연결
08:30 KST 자동 생성
Archive 구현
날짜별 상세 페이지
중복 생성 방지
실패 처리
```

---

# 55. Day 3 목표

```text
신문형 디자인 완성
모바일 반응형
Typography 개선
Source UI 개선
Loading / Empty / Error state
Generation Log
Prompt 개선
```

---

# 56. Day 4 — 시간이 남을 경우에만

다음 중 필요한 것만 구현한다.

```text
간단한 Password Gate
직무 관심사 설정
뉴스 카테고리 필터
학습 Progress
읽음 표시
주간 복습
면접 질문 모아보기
```

Day 1~3 기능이 불안정하다면 Day 4 기능을 추가하지 않는다.

---

# 57. 핵심 테스트

최소한 다음 항목은 확인한다.

### Date

```text
UTC 환경에서도 KST 날짜가 정확한가?
```

### Curriculum

```text
이미 학습한 개념이 다시 선택되지 않는가?
```

### Generation

```text
3개 이상의 뉴스가 생성되는가?
국내/글로벌 뉴스가 각각 존재하는가?
```

### Idempotency

```text
같은 날짜 endpoint를 두 번 호출해도 row가 한 개뿐인가?
```

### Security

```text
CRON_SECRET 없이 호출하면 401인가?
```

### UI

```text
모바일에서 horizontal scroll이 발생하지 않는가?
```

---

# 58. 최종 Acceptance Criteria

프로젝트는 다음 조건을 모두 만족하면 MVP 완료로 본다.

```text
[ ] Vercel에 배포되어 있다.

[ ] 매일 Daily Briefing을 생성할 수 있다.

[ ] 오전 08:30 자동 실행 구조가 연결되어 있다.

[ ] 오늘의 증권 상식이 1~2개 존재한다.

[ ] 학습했던 개념을 DB 기준으로 불필요하게 반복하지 않는다.

[ ] 경제 이슈가 최소 3개 존재한다.

[ ] 국내 + 글로벌 뉴스가 모두 포함된다.

[ ] 뉴스가 중요도 순으로 정렬된다.

[ ] 각 뉴스에 "무슨 일 / 왜 중요 / 시장 영향"이 있다.

[ ] 사실과 해석을 구분한다.

[ ] 모든 핵심 뉴스에 실제 Source URL이 있다.

[ ] 마지막에 "오늘 기억할 한 줄"이 있다.

[ ] Archive에서 과거 브리핑을 볼 수 있다.

[ ] 페이지를 조회할 때 OpenAI API를 호출하지 않는다.

[ ] OpenAI API Key가 클라이언트에 노출되지 않는다.

[ ] 같은 날짜 데이터가 중복 저장되지 않는다.

[ ] Desktop / Mobile 모두 정상적으로 읽을 수 있다.

[ ] Black & White Newspaper 디자인을 유지한다.
```

---

# 59. Coding Agent에게 주는 추가 지시

이 프로젝트를 구현할 때 항상 작은 단위로 진행한다.

한 번에 모든 파일을 생성하지 말고 **실행 가능한 Vertical Slice를 먼저 만든다.**

기존 동작을 깨면서 구조를 개선하지 않는다.

새 라이브러리를 설치하기 전에 정말 필요한지 판단한다.

가능하면 Next.js / React / Tailwind 기본 기능을 우선 사용한다.

UI보다 데이터 흐름을 먼저 완성한다.

첫 번째 목표는:

```text
"버튼이나 API를 한 번 호출하면
실제 오늘의 금융 브리핑이 생성되고
DB에 저장되어 메인 화면에 나온다."
```

이다.

이 흐름이 완성되기 전에는 Archive, Animation, Login 같은 기능을 구현하지 않는다.

AI 관련 코드에서는 Prompt를 Component에 작성하지 않는다.

Prompt는:

```text
src/lib/openai/prompts.ts
```

에서 관리한다.

Prompt 변경 추적을 위해:

```ts
const PROMPT_VERSION = "v1";
```

을 저장한다.

브리핑 row에도 `prompt_version`을 기록한다.

뉴스 내용이 없거나 AI 호출이 실패했을 경우 거짓 데이터나 Mock 데이터를 Production 화면에 표시하지 않는다.

Production에서는 항상 실제 데이터만 보여준다.

---

# 60. 최종 프로젝트 구조

이 서비스의 본질은 다음 한 문장으로 유지한다.

> **매일 아침 오늘 시장을 이해하고, 하루 하나씩 금융 언어를 쌓아 증권사 면접에서 말할 수 있게 만드는 개인 금융 신문.**

기능을 추가할 때 이 목표와 직접 관련이 없다면 MVP에서는 추가하지 않는다.
