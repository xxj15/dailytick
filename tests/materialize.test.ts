import { strict as assert } from "node:assert";
import test from "node:test";
import { materializeBriefing } from "@/lib/briefing/materialize";
import { dailyBriefingSchema, stripNulls } from "@/lib/openai/schemas";
import { CANDIDATE, DRAFT, QUOTE } from "./fixtures/news";

test("모델이 사실·출처를 끼워 넣어도 실제 자료에서 조합한 값을 사용한다", () => {
  const item = { ...DRAFT.newsItems[0], whatHappened: "표결 7대0", sources: [{ url: "https://invented.example.com" }], region: "GLOBAL" };
  const result = materializeBriefing({ ...DRAFT, newsItems: [item] }, [CANDIDATE]);
  assert.equal(result.newsItems[0].whatHappened, QUOTE);
  assert.deepEqual(result.newsItems[0].sources, CANDIDATE.sources);
  assert.equal(result.newsItems[0].region, "KR");
  assert.equal(result.newsItems[0].evidence.documents[0].contentHash, "a".repeat(64));
});

test("다른 후보의 사실 ID나 중복 후보로 기사를 생성할 수 없다", () => {
  for (const item of [
    { ...DRAFT.newsItems[0], factIds: ["c2-f1"] },
    { ...DRAFT.newsItems[0], candidateId: "c2" },
    { ...DRAFT.newsItems[0], factIds: [] },
  ]) assert.throws(() => materializeBriefing({ ...DRAFT, newsItems: [item] }, [CANDIDATE]));
  assert.throws(() => materializeBriefing({ ...DRAFT, newsItems: [DRAFT.newsItems[0], DRAFT.newsItems[0]] }, [CANDIDATE]));
});

test("뉴스 한 건·단일 지역도 발행하고 과거 브리핑도 읽되 뉴스 없는 지면은 거절한다", () => {
  const result = dailyBriefingSchema.parse(stripNulls(materializeBriefing(DRAFT, [CANDIDATE])));
  assert.equal(result.newsItems.length, 1);
  const legacy = structuredClone(result);
  for (const item of legacy.newsItems) delete item.evidence;
  assert.equal(dailyBriefingSchema.safeParse(legacy).success, true);
  assert.equal(dailyBriefingSchema.safeParse({ ...result, newsItems: [] }).success, false);
});
