import { strict as assert } from "node:assert";
import test from "node:test";
import { CURRICULUM } from "@/data/curriculum";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
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

test("IT 커리큘럼은 slug가 겹치지 않고 짝 개념이 실제로 있다", () => {
  const slugs = TECH_CURRICULUM.map((c) => c.slug);

  assert.equal(new Set(slugs).size, slugs.length);
  // 학습 이력이 하나의 slug 공간처럼 보이지 않도록 경제 커리큘럼과도 겹치지 않는다
  assert.ok(slugs.every((slug) => !CURRICULUM.some((c) => c.slug === slug)));
  for (const concept of TECH_CURRICULUM) {
    if (concept.pairWith) assert.ok(slugs.includes(concept.pairWith), concept.pairWith);
  }
});

test("IT 개념은 IT 커리큘럼과 IT 이력으로 따로, 하루 두 개씩 고른다", () => {
  // 짝이 없는 구간에서 시작해 순서대로 두 개를 채우는지 본다
  const closure = TECH_CURRICULUM.findIndex((c) => c.slug === "q-single-thread");
  const learned = TECH_CURRICULUM.slice(0, closure).map((c) => c.slug);
  const { concepts, mode } = selectTodayConcepts(history(learned), TECH_CURRICULUM, 2);

  assert.equal(mode, "new");
  assert.deepEqual(
    concepts.map((c) => c.slug),
    TECH_CURRICULUM.slice(closure, closure + 2).map((c) => c.slug),
  );
});

test("하루 두 개를 고를 때 짝 개념이 있으면 짝이 먼저 들어간다", () => {
  const rendering = TECH_CURRICULUM.findIndex((c) => c.slug === "q-where-render");
  const learned = TECH_CURRICULUM.slice(0, rendering).map((c) => c.slug);
  const { concepts } = selectTodayConcepts(history(learned), TECH_CURRICULUM, 2);

  assert.deepEqual(concepts.map((c) => c.slug), ["q-where-render", "q-hydration"]);
});

test("IT 커리큘럼을 다 돌면 가장 오래된 두 개를 복습한다", () => {
  const all = TECH_CURRICULUM.map((c) => c.slug);
  const { concepts, mode } = selectTodayConcepts(history(all.slice(2), all.slice(0, 2)), TECH_CURRICULUM, 2);

  assert.equal(mode, "review");
  assert.deepEqual(concepts.map((c) => c.slug), all.slice(0, 2));
});

test("IT 상식은 분야를 돌아가며 나가고, 분야 안에서는 쉬운 것부터 나간다", () => {
  // 앞쪽 2주(하루 두 개)는 같은 분야가 연달아 붙지 않는다
  for (let i = 1; i < 28; i++) {
    assert.notEqual(TECH_CURRICULUM[i].category, TECH_CURRICULUM[i - 1].category, `${i}번째`);
  }
  // 분야 안의 순서는 작성한 대로다 (자바스크립트: 0.1+0.2 → 싱글 스레드)
  const js = TECH_CURRICULUM.filter((c) => c.category === "javascript").map((c) => c.slug);
  assert.ok(js.indexOf("q-zero-point-one") < js.indexOf("q-single-thread"));
  assert.equal(new Set(TECH_CURRICULUM.map((c) => c.slug)).size, TECH_CURRICULUM.length);
});
