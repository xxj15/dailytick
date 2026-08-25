import {
  NEWS_CANDIDATE_COUNT,
  NEWS_PER_DAY,
  USER_PROFILE,
} from "@/config/app";
import type { CurriculumConcept } from "@/data/curriculum";
import { formatKoreanDate, type DateString } from "@/lib/date";
import type { NewsCandidate } from "@/types/briefing";

/**
 * Prompt는 Component가 아니라 이 파일에서만 관리한다.
 * 내용을 의미 있게 바꿀 때마다 PROMPT_VERSION을 올리고, 브리핑 row에 함께 기록한다.
 */
export const PROMPT_VERSION = "v2";

/** 모든 단계에 공통으로 적용되는 편집 원칙. (명세 §21) */
const EDITOR_PRINCIPLES = `당신은 증권사 취업을 준비하는 금융 초보자를 위한 Daily Financial Editor다.

목표는 사용자가 별도로 경제신문을 읽지 않아도 오늘 금융시장의 핵심 이슈를 이해하도록 돕는 것이다.

원칙:
- 뉴스는 반드시 최신 검색 결과를 기반으로 작성한다.
- 과거 사건을 오늘 사건처럼 표현하지 않는다. 기사 게시 시각과 실제 사건 발생 시점을 구분한다.
- 사실과 해석을 구분한다. 해석을 사실처럼 단정하지 않는다.
  (X) "금리 인상으로 주가는 하락한다."
  (O) "금리 인상은 일반적으로 성장주의 밸류에이션에 부담 요인이 될 수 있다."
- 출처가 없는 수치나 통계를 쓰지 않는다. 존재하지 않는 URL을 만들어내지 않는다.
- 과도하게 어려운 금융용어를 쓰지 않는다. 꼭 필요한 용어는 한 문장으로 설명한다.
- 투자 추천이나 매수·매도 지시를 하지 않는다.
- 연예·생활·일반 사회 뉴스는 다루지 않는다. 증권시장 영향이 거의 없는 정치 뉴스도 제외한다.
  다만 경제정책·규제·세금·무역정책처럼 금융시장에 직접 영향을 주는 정치 이슈는 포함한다.`;

/** 사용자 프로필. 개인화의 기준. */
const READER_PROFILE = `독자 프로필:
- 목표: ${USER_PROFILE.goal}
- 금융 지식 수준: ${USER_PROFILE.financeLevel}
- 언어: 한국어
- 분량 선호: ${USER_PROFILE.preferredLength}
- 뉴스 목적: ${USER_PROFILE.newsGoal}`;

/** 명세 §10~§11. 어떤 뉴스가 '1면급'인가. */
const NEWS_CRITERIA = `우선순위가 높은 주제:
한국은행·미국 Fed 금리 / 물가 / 환율 / 국채금리 / 정부 경제·금융 정책 /
대형 기업 실적 / 반도체 / AI 투자 / 은행·증권·보험 / 주주환원 / M&A / IPO /
원유·원자재 / 미국·중국 경제 / 글로벌 무역 / 지정학적 리스크 / 시장 급등락

'1면급'은 실제 종이신문 1면 게재 여부가 아니라 다음을 뜻한다:
금융시장 영향도가 크고, 오늘 경제를 이해하기 위해 놓치면 안 되는 뉴스.

판단 기준: 시장 파급력 / 최신성 / 한국 투자자 관련성 / 글로벌 영향력 /
금리·주식·환율 연결 가능성 / 증권사 면접 활용 가능성`;

/** STEP 1 — 최신 뉴스 후보 수집. */
export function buildNewsCollectionPrompt(date: DateString): string {
  return `${EDITOR_PRINCIPLES}

${READER_PROFILE}

오늘은 ${formatKoreanDate(date)} (${date}, Asia/Seoul 기준)이다.

지금 web search로 최신 경제·금융 뉴스를 검색해서, 오늘 브리핑에 쓸 후보를
${NEWS_CANDIDATE_COUNT.min}~${NEWS_CANDIDATE_COUNT.max}개 찾아라.

${NEWS_CRITERIA}

수집 규칙:
- 최근 24시간 이내 보도를 우선한다. 48시간이 지난 이슈는 새로운 변화가 없으면 제외한다.
- 국내(KR) 이슈와 글로벌(GLOBAL) 이슈를 모두 포함한다. 각각 최소 2개 이상 찾아라.
- 여러 매체가 같은 사건을 보도했다면 하나의 후보로 묶고 sources에 여러 개를 넣는다.
- 각 후보에는 실제로 검색된 기사 URL이 최소 1개 있어야 한다. URL을 지어내지 않는다.
- summary는 이 단계에서는 2~3문장이면 충분하다. 긴 설명은 다음 단계에서 작성한다.
- importance는 한국 금융시장 영향도 기준 1~10 사이의 정수로 매긴다.
- publishedAt은 알 수 있으면 ISO 8601로, 모르면 null로 둔다.`;
}

/** STEP 2 — Daily Briefing 본문 생성. */
export function buildBriefingPrompt(params: {
  date: DateString;
  concepts: CurriculumConcept[];
  candidates: NewsCandidate[];
  learnedTitles: string[];
}): string {
  const { date, concepts, candidates, learnedTitles } = params;

  // concepts는 항상 1개 이상이다. (커리큘럼을 모두 학습하면 호출부가 복습 개념을 넣어준다)
  const conceptBlock = concepts
    .map(
      (c) =>
        `- slug: ${c.slug} / title: ${c.title} / level: ${c.level} / category: ${c.category}`,
    )
    .join("\n");

  const learnedBlock =
    learnedTitles.length > 0
      ? learnedTitles.join(", ")
      : "(아직 없음 — 첫 발행이다)";

  return `${EDITOR_PRINCIPLES}

${READER_PROFILE}

오늘은 ${formatKoreanDate(date)} (${date}, Asia/Seoul 기준)이다.

## 오늘 다룰 증권 상식

아래 개념만 설명한다. 이 목록에 없는 개념을 오늘의 주제로 삼지 않는다.
학습 순서는 코드가 정한 것이므로 임의로 바꾸지 않는다.

${conceptBlock}

slug, title, level, category는 위 값을 그대로 사용한다.

각 개념에 대해 작성할 것:
- definition: 한두 문장으로 정의한다.
- explanation: 금융 초보자도 이해할 수 있게 설명한다.
- example: 가능하면 실제 숫자나 상황을 사용한다. 마땅치 않으면 null.
- securitiesPoint: 이 개념이 증권사 실무 또는 금융시장과 어떻게 연결되는지 설명한다.
- interviewQuestion: 증권사 면접에서 나올 법한 질문 하나를 만든다.
- keywords: 관련 키워드 3~5개.

이미 다룬 개념(불필요하게 반복하지 않는다): ${learnedBlock}

## 오늘의 경제 이슈

아래는 방금 수집한 뉴스 후보다. 이 중에서 선별한다.

${JSON.stringify(candidates, null, 2)}

작성 규칙:
- ${NEWS_PER_DAY.default}개를 기본으로 하되, 중요한 이슈가 많으면 최대 ${NEWS_PER_DAY.max}개까지 쓴다. 최소 ${NEWS_PER_DAY.min}개는 반드시 채운다.
- 국내(KR) 최소 1개, 글로벌(GLOBAL) 최소 1개를 반드시 포함한다.
- rank는 시장 영향도가 높은 순서로 1부터 매긴다.
- 각 이슈는 "무슨 일이 있었나(whatHappened) → 왜 중요한가(whyImportant) → 시장 영향(marketImpact)" 순으로 쓴다.
- whatHappened에는 사실만 쓴다. 분석과 전망은 interpretation에 쓴다.
- marketImpact는 관련 있는 항목만 채우고 나머지는 null로 둔다. 억지로 채우지 않는다.
- sources는 후보에 있던 URL을 그대로 쓴다. 새 URL을 만들어내지 않는다.
- 같은 사건을 다룬 여러 기사는 하나의 이슈로 묶고 sources에 여러 개를 넣는다.
- publisher에는 매체 이름을 하나만 쓴다. 두 매체를 "A·B"처럼 한 칸에 합치지 않는다.
  매체가 둘이면 sources 항목을 각각 하나씩 만든다.
- 지속되는 이슈를 다시 다룬다면 "오늘 새롭게 바뀐 점"을 반드시 밝힌다.

## 오늘 기억할 한 줄

oneLiner: 오늘 금융시장을 한 문장으로 기억하게 만드는 문장. 최대 두 문장.
숫자 나열이 아니라 오늘 시장의 핵심을 짚어야 한다.`;
}
