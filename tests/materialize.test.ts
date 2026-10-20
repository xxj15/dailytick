import { strict as assert } from "node:assert";
import test from "node:test";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { verifyBriefing } from "@/lib/briefing/verify";
import { aiDailyBriefingSchema, dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { CANDIDATE, CONCEPT, DATE, DOMESTIC, DRAFT, IT, QUOTE, candidate, draftNews } from "./fixtures/news";

test("모델이 사실·출처를 끼워 넣어도 실제 자료에서 조합한 값을 사용하고, 지역만 작성 단계 판단을 따른다", () => {
  const item = { ...DRAFT.newsItems[0], whatHappened: "표결 7대0", sources: [{ url: "https://invented.example.com" }], region: "GLOBAL" as const };
  const result = materializeBriefing({ ...DRAFT, newsItems: [item] }, [CANDIDATE]);
  assert.equal(result.newsItems[0].whatHappened, QUOTE);
  assert.deepEqual(result.newsItems[0].sources, CANDIDATE.sources);
  // 검색 단계가 KR로 잘못 매겨도 작성 단계가 사건 중심 지역으로 바로잡는다
  assert.equal(result.newsItems[0].region, "GLOBAL");
  assert.equal(result.newsItems[0].evidence.documents[0].contentHash, "a".repeat(64));
});

test("다른 후보의 사실 ID나 없는 후보로 기사를 생성할 수 없다", () => {
  for (const item of [
    { ...DRAFT.newsItems[0], factIds: ["c2-f1"] },
    { ...DRAFT.newsItems[0], candidateId: "c2" },
    { ...DRAFT.newsItems[0], factIds: [] },
  ]) assert.throws(() => materializeBriefing({ ...DRAFT, newsItems: [item] }, [CANDIDATE]));
});

test("같은 후보를 두 슬롯에 쓰면 조합은 하되, 발행 검증이 분류가 맞지 않는 슬롯의 rank를 가리켜 거른다", () => {
  const twice = { ...DRAFT, newsItems: [draftNews(1, "top", "c1"), draftNews(2, "economy", "c1")] };
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(twice, [CANDIDATE])));
  assert.deepEqual(content.newsItems.map((item) => item.slot), ["top", "economy"]);
  const violations = verifyBriefing(content, { date: DATE, concepts: [CONCEPT], candidates: [CANDIDATE] });
  // CANDIDATE는 주요 시사(사회) 사건이라 경제 슬롯에 맞지 않는다
  assert.deepEqual(violations.map((v) => [v.code, v.rank]), [["news.slot_mismatch", 2]]);
});

test("뉴스 한 건·단일 지역도 발행하고, slot이 없는 과거 브리핑도 읽되 뉴스 없는 지면은 거절한다", () => {
  const result = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  assert.equal(result.newsItems.length, 1);
  assert.equal(result.newsItems[0].slot, "top");
  const legacy = structuredClone(result);
  for (const item of legacy.newsItems) {
    delete item.evidence;
    delete item.slot;
  }
  assert.equal(dailyBriefingSchema.safeParse(legacy).success, true);
  assert.equal(dailyBriefingSchema.safeParse({ ...result, newsItems: [] }).success, false);
  // 슬롯 도입 전 지면은 하루 최대 6건이었다. 그대로 읽힌다.
  const six = Array.from({ length: 6 }, (_, index) => ({ ...legacy.newsItems[0], rank: index + 1 }));
  assert.equal(dailyBriefingSchema.safeParse({ ...legacy, newsItems: six }).success, true);
});

test("슬롯 수를 넘는 초안도 스키마는 받는다. 넘친 뉴스는 발행 검증이 rank로 가리켜 그 뉴스만 뺄 수 있어야 한다", () => {
  const draft = { ...DRAFT, newsItems: [draftNews(1, "top", "c1"), draftNews(2, "economy", "c2"), draftNews(3, "it", "c3"), draftNews(4, "it", "c4")] };
  const otherIt = candidate("c4", { region: "GLOBAL", category: "software" });
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(draft, [CANDIDATE, DOMESTIC, IT, otherIt])));
  assert.equal(content.newsItems.length, 4);
  const violations = verifyBriefing(content, { date: DATE, concepts: [CONCEPT], candidates: [CANDIDATE, DOMESTIC, IT, otherIt] });
  assert.deepEqual(violations.map((v) => [v.code, v.rank]), [["news.slot_duplicate", 4]]);
  // 상한은 트림을 막지 않을 만큼만 넉넉하다
  const seven = Array.from({ length: 7 }, (_, index) => ({ ...content.newsItems[0], rank: index + 1 }));
  assert.equal(dailyBriefingSchema.safeParse({ ...content, newsItems: seven }).success, false);
});

test("조합할 때 기사마다 고유한 rank를 슬롯 순서로 다시 매긴다. 같은 슬롯·같은 AI rank면 쓴 순서를 따른다", () => {
  const otherIt = candidate("c4", { region: "GLOBAL", category: "software" });
  const draft = { ...DRAFT, newsItems: [draftNews(1, "it", "c3"), draftNews(1, "top", "c1"), draftNews(1, "it", "c4"), draftNews(9, "economy", "c2")] };
  const result = dailyBriefingSchema.parse(stripNulls(materializeBriefing(draft, [CANDIDATE, DOMESTIC, IT, otherIt])));
  assert.deepEqual(result.newsItems.map((item) => [item.rank, item.slot, item.evidence?.candidateId]), [
    [1, "top", "c1"], [2, "economy", "c2"], [3, "it", "c3"], [4, "it", "c4"],
  ]);
});

test("AI 출력에는 slot이 반드시 있어야 한다", () => {
  const withoutSlot: Record<string, unknown> = { ...DRAFT.newsItems[0] };
  delete withoutSlot.slot;
  assert.equal(aiDailyBriefingSchema.safeParse({ ...DRAFT, newsItems: [withoutSlot] }).success, false);
});

/** 무슨 일 문장과 원인·배경 문장이 함께 있는 후보 */
const CAUSE = "물가 상승세가 둔화되고 경기 하방 위험이 커졌다는 판단이 이번 결정의 배경이 됐다고 설명했다.";
const WITH_CAUSE = {
  ...CANDIDATE,
  facts: [{ ...CANDIDATE.facts[0], role: "event" as const }, { id: "c1-f2", sourceId: "s1", quote: CAUSE, role: "background" as const }],
  documents: [{ ...CANDIDATE.documents[0], text: `${QUOTE} ${CAUSE}` }],
};

test("무슨 일과 원인·배경 근거 문장을 따로 이어 '무슨 일이 있었나'·'왜 일어났나'를 채운다", () => {
  const draft = { ...DRAFT, newsItems: [{ ...DRAFT.newsItems[0], factIds: ["c1-f2", "c1-f1"] }] };
  const content = dailyBriefingSchema.parse(stripNulls(materializeBriefing(draft, [WITH_CAUSE])));
  assert.equal(content.newsItems[0].whatHappened, QUOTE);
  assert.equal(content.newsItems[0].background, CAUSE);
  assert.equal(content.newsItems[0].takeaway, DRAFT.newsItems[0].takeaway);
  assert.deepEqual(verifyBriefing(content, { date: DATE, concepts: [CONCEPT], candidates: [WITH_CAUSE] }), []);
  // 모델이 '왜 일어났나'를 바꿔 쓰면 근거 불일치다
  const edited = { ...content, newsItems: [{ ...content.newsItems[0], background: "추측한 원인" }] };
  assert.deepEqual(verifyBriefing(edited, { date: DATE, concepts: [CONCEPT], candidates: [WITH_CAUSE] }).map((v) => v.code), ["news.evidence"]);
});

test("후보에 원인·배경 문장이 있는데 고르지 않으면 조합하지 않는다", () => {
  const draft = { ...DRAFT, newsItems: [{ ...DRAFT.newsItems[0], factIds: ["c1-f1"] }] };
  assert.throws(() => materializeBriefing(draft, [WITH_CAUSE]), /원인·배경\(background\) 근거 문장을 하나 이상/);
  // 원인 문장만 고르고 무슨 일 문장을 빼도 안 된다
  const onlyCause = { ...DRAFT, newsItems: [{ ...DRAFT.newsItems[0], factIds: ["c1-f2"] }] };
  assert.throws(() => materializeBriefing(onlyCause, [WITH_CAUSE]), /무슨 일\(event\)/);
});
