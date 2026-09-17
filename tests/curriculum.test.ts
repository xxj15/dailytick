import { strict as assert } from "node:assert";
import test from "node:test";
import { CURRICULUM } from "@/data/curriculum";
import { selectTodayConcepts } from "@/lib/curriculum/select-next-concepts";
import type { ConceptHistoryEntry } from "@/types/briefing";

/** 최신순 학습 이력을 만든다. 앞에 올수록 최근이다. */
function history(...slugs: string[][]): ConceptHistoryEntry[] {
  return slugs.map((row, index) => ({
    briefingDate: `2026-09-${String(30 - index).padStart(2, "0")}`,
    items: row.map((slug) => ({ slug, title: slug })),
  }));
}

test("학습 이력이 없으면 커리큘럼 첫 개념부터 시작한다", () => {
  const { concepts, mode } = selectTodayConcepts([]);

  assert.equal(mode, "new");
  assert.equal(concepts[0].slug, CURRICULUM[0].slug);
});

test("이미 다룬 개념은 다시 선택하지 않는다", () => {
  const learned = CURRICULUM.slice(0, 3).map((c) => c.slug);
  const { concepts, mode } = selectTodayConcepts(history(learned));

  assert.equal(mode, "new");
  assert.equal(concepts[0].slug, CURRICULUM[3].slug);
});

test("밀접한 개념은 같은 날 함께 나간다", () => {
  const eps = CURRICULUM.findIndex((c) => c.slug === "eps");
  const learned = CURRICULUM.slice(0, eps).map((c) => c.slug);

  const { concepts } = selectTodayConcepts(history(learned));

  assert.deepEqual(
    concepts.map((c) => c.slug),
    ["eps", "per"],
  );
});

test("짝 개념을 이미 다뤘다면 혼자 나간다", () => {
  const eps = CURRICULUM.findIndex((c) => c.slug === "eps");
  const learned = [...CURRICULUM.slice(0, eps).map((c) => c.slug), "per"];

  const { concepts } = selectTodayConcepts(history(learned));

  assert.deepEqual(
    concepts.map((c) => c.slug),
    ["eps"],
  );
});

test("커리큘럼을 모두 돌면 가장 오래전에 다룬 개념으로 복습한다", () => {
  const all = CURRICULUM.map((c) => c.slug);

  // 최신순이므로 마지막 행이 가장 오래된 날이다.
  const entries = history(all.slice(1), [all[0]]);
  const { concepts, mode } = selectTodayConcepts(entries);

  assert.equal(mode, "review");
  assert.equal(concepts[0].slug, all[0]);
});

test("복습이 첫 개념으로 되돌아가 매일 반복되지 않는다", () => {
  const all = CURRICULUM.map((c) => c.slug);

  // 어제 첫 개념을 복습했다면 오늘은 그다음으로 오래된 것이어야 한다.
  const entries = history([all[0]], all.slice(1));
  const { concepts, mode } = selectTodayConcepts(entries);

  assert.equal(mode, "review");
  assert.notEqual(concepts[0].slug, all[0]);
});
