import { strict as assert } from "node:assert";
import test from "node:test";
import { CURRICULUM } from "@/data/curriculum";
import { LEGACY_SLUGS, OVERLAP_GROUPS } from "@/data/knowledge-overlaps";
import { TECH_ARTICLES } from "@/data/tech-articles";
import { TECH_CURRICULUM } from "@/data/tech-curriculum";
import { canonicalHistory, economyCandidates, recentOverlaps, techAxis, techCandidates, withoutRecentOverlaps } from "@/lib/curation/candidates";
import { selectTodayConcepts } from "@/lib/curriculum/select-next-concepts";
import type { ConceptHistoryEntry } from "@/types/briefing";

const DATE = "2026-10-23";
/** 학습 이력 한 줄. category는 실제 이력처럼 상식의 분야다. */
const day = (briefingDate: string, ...items: { slug: string; category?: string }[]): ConceptHistoryEntry =>
  ({ briefingDate, items: items.map((item) => ({ ...item, title: item.slug })) });

test("관계 데이터의 slug는 모두 지금 커리큘럼·아티클에 있고, 예전 slug는 지금 slug로 이어진다", () => {
  const slugs = new Set([...CURRICULUM, ...TECH_CURRICULUM, ...TECH_ARTICLES].map((entry) => entry.slug));
  for (const group of OVERLAP_GROUPS) {
    assert.ok(group.length >= 2, group.join(","));
    for (const slug of group) assert.ok(slugs.has(slug), slug);
  }
  for (const [legacy, current] of Object.entries(LEGACY_SLUGS)) {
    assert.ok(!slugs.has(legacy), legacy);
    assert.ok(slugs.has(current), current);
  }
});

test("예전 slug로 배운 개념은 지금 slug로 보고 새 개념처럼 다시 내지 않는다", () => {
  // 10-17에 예전 커리큘럼으로 리플로우를 배웠다. 지금 커리큘럼의 q-reflow는 같은 개념이다
  const history = [day("2026-09-01", { slug: "reflow-repaint", category: "web-platform" })];
  assert.ok(!techCandidates(history, DATE).some((candidate) => candidate.id === "k-q-reflow"));
  assert.deepEqual(canonicalHistory(history)[0].items.map((item) => item.slug), ["q-reflow"]);
  // 대체·복습(selectTodayConcepts)도 같은 이력을 쓰므로 미학습으로 보지 않는다
  const frontend = TECH_CURRICULUM.filter((concept) => concept.category === "frontend");
  const learnedBefore = frontend.slice(0, frontend.findIndex((concept) => concept.slug === "q-reflow")).map((concept) => ({ slug: concept.slug }));
  const next = selectTodayConcepts(canonicalHistory([day("2026-09-02", ...learnedBefore), ...history]), frontend, 1, false);
  assert.notEqual(next.concepts[0].slug, "q-reflow");
});

test("최근 7일 안에 낸 상식과 학습 범위가 크게 겹치는 상식은 뺀다. 일주일이 지나면 다시 고를 수 있다", () => {
  // 사흘 전 QUIC 아티클을 냈다 → HTTP 버전 개념은 쉰다
  assert.ok(recentOverlaps([day("2026-10-20", { slug: "a-cloudflare-quic", category: "cs" })], DATE).has("q-http-versions"));
  assert.ok(!recentOverlaps([day("2026-10-15", { slug: "a-cloudflare-quic", category: "cs" })], DATE).has("q-http-versions"));
  assert.ok(!withoutRecentOverlaps(TECH_CURRICULUM, [day("2026-10-20", { slug: "a-cloudflare-quic" })], DATE).some((concept) => concept.slug === "q-http-versions"));
  // 경제: 어제 고정비와 변동비를 배웠다 → 손익분기점은 일주일 쉰다
  const ids = (history: ConceptHistoryEntry[]) => economyCandidates(history, DATE).map((candidate) => candidate.id);
  assert.ok(!ids([day("2026-10-22", { slug: "fixed-variable-cost", category: "business" })]).includes("k-break-even-point"));
  assert.ok(ids([day("2026-10-14", { slug: "fixed-variable-cost", category: "business" })]).includes("k-break-even-point"));
  // 같은 날짜로 다시 만들 때 그날의 이전 지면은 '최근'으로 세지 않는다
  assert.ok(!recentOverlaps([day(DATE, { slug: "a-cloudflare-quic" })], DATE).has("q-http-versions"));
});

test("복습할 때도 최근 7일 상식과 크게 겹치는 개념은 건너뛴다", () => {
  const all = TECH_CURRICULUM.map((concept) => concept.slug);
  // 가장 오래된 개념이 q-rendering-pipeline이고, 어제 같은 범위의 q-reflow를 복습했다
  const history = [
    day("2026-10-22", { slug: "q-reflow" }),
    day("2026-09-20", ...all.filter((slug) => slug !== "q-reflow" && slug !== "q-rendering-pipeline").map((slug) => ({ slug }))),
    day("2026-09-01", { slug: "q-rendering-pipeline" }),
  ];
  assert.equal(selectTodayConcepts(history, TECH_CURRICULUM, 1, false).concepts[0].slug, "q-rendering-pipeline");
  const picked = selectTodayConcepts(history, withoutRecentOverlaps(TECH_CURRICULUM, history, DATE), 1, false);
  assert.equal(picked.mode, "review");
  assert.notEqual(picked.concepts[0].slug, "q-rendering-pipeline");
});

test("테크 상식 나머지 축은 최근 두 지면에 나온 분야를 쉬게 해 CS·백엔드·AI가 돌아가며 나온다", () => {
  const coreCategories = (history: ConceptHistoryEntry[]) =>
    [...new Set(techCandidates(history, DATE).filter((candidate) => techAxis(candidate.category) === "core").map((candidate) => candidate.category))].sort();
  // 10-21·10-22는 CS, 10-20은 AI였다 → 오늘 나머지 축은 백엔드에서 고른다
  const recent = [
    day("2026-10-22", { slug: "a-optimize-inp", category: "frontend" }, { slug: "a-cloudflare-quic", category: "cs" }),
    day("2026-10-21", { slug: "a-cost-of-javascript", category: "frontend" }, { slug: "a-stripe-idempotency", category: "cs" }),
    day("2026-10-20", { slug: "a-building-effective-agents", category: "ai" }, { slug: "q-rendering-pipeline", category: "frontend" }),
  ];
  assert.deepEqual(coreCategories(recent), ["backend"]);
  // 프론트엔드 축은 쉬지 않는다
  assert.ok(techCandidates(recent, DATE).some((candidate) => candidate.category === "frontend"));
  // 백엔드를 다 배웠으면 가장 최근 분야(CS)만 쉰다
  const backend = TECH_CURRICULUM.filter((concept) => concept.category === "backend").map((concept) => ({ slug: concept.slug, category: "backend" }));
  assert.deepEqual(coreCategories([...recent, day("2026-09-01", ...backend)]), ["ai"]);
  // 이력이 없으면 쉬는 분야도 없다
  assert.deepEqual(coreCategories([]), ["ai", "backend", "cs"]);
});
