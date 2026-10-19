import { DOMESTIC_NEWS_CATEGORIES, IT_NEWS_CATEGORIES, NEWS_SLOTS } from "@/config/app";
import type { NewsCategory, NewsRegion, NewsSlot } from "@/types/briefing";

/**
 * 주요 이슈 슬롯 규칙. (config/app.ts의 NEWS_SLOTS)
 *
 * 발행 검증(verify.ts), 근거 확인 자리 확보(ground-news.ts), 재수집 판단과 작성 프롬프트가 같은 규칙을 쓴다.
 * 서버 전용 코드를 두지 않는다. 테스트에서 부를 수 있어야 한다.
 */

type SlotFields = { region: NewsRegion; category: NewsCategory };

export const SLOT_NAME: Record<NewsSlot, string> = {
  top: "top(오늘의 화제)",
  domestic: "domestic(국내 정세)",
  it: "it(IT)",
};

const IT = new Set<NewsCategory>(IT_NEWS_CATEGORIES);
const DOMESTIC = new Set<NewsCategory>(DOMESTIC_NEWS_CATEGORIES);
const DOMESTIC_SCOPE = "국내 정치·정책·외교·안보·경제·금융·기업";

/** 슬롯에 들어갈 수 없는 이유. 들어갈 수 있으면 null. 재시도 프롬프트에 그대로 들어가므로 고칠 방법까지 쓴다. */
export function slotMismatch(slot: NewsSlot, item: SlotFields): string | null {
  if (slot === "domestic" && item.region !== "KR") {
    return `${SLOT_NAME.domestic} 슬롯은 한국에서 일어난 사건(region KR)이어야 하는데 ${item.region}입니다. ${DOMESTIC_SCOPE} 사건으로 바꾸세요.`;
  }
  if (slot === "domestic" && IT.has(item.category)) {
    return `${SLOT_NAME.domestic} 슬롯에 IT 분류(${item.category}) 기사를 넣었습니다. IT 기사는 it 슬롯에 두고, 이 자리는 ${DOMESTIC_SCOPE} 사건으로 바꾸세요.`;
  }
  if (slot === "domestic" && !DOMESTIC.has(item.category)) {
    return `${SLOT_NAME.domestic} 슬롯은 분류가 ${DOMESTIC_NEWS_CATEGORIES.join("·")} 중 하나여야 하는데 ${item.category}입니다. 사회·과학 사건은 이 자리에 둘 수 없습니다. ${DOMESTIC_SCOPE} 사건으로 바꾸세요.`;
  }
  if (slot === "it" && !IT.has(item.category)) {
    return `${SLOT_NAME.it} 슬롯은 분류가 ${IT_NEWS_CATEGORIES.join("·")} 중 하나여야 하는데 ${item.category}입니다. IT 사건으로 바꾸세요.`;
  }
  return null;
}

export function fitsSlot(slot: NewsSlot, item: SlotFields): boolean {
  return slotMismatch(slot, item) === null;
}

/** 지면 순서. slot이 없는 뉴스(과거 row)는 뒤에 둔다. */
export function slotOrder(slot: NewsSlot | undefined): number {
  return slot ? NEWS_SLOTS.indexOf(slot) : NEWS_SLOTS.length;
}

/**
 * 후보로 세 슬롯을 서로 다른 사건으로 채워 본다. 채울 수 없는 슬롯은 비어 있다.
 * 조건이 있는 국내·IT를 먼저 채우고, 오늘의 화제는 남은 후보 가운데 가장 중요한 것으로 채운다.
 * 국내와 IT는 겹치지 않으므로 이 순서면 채울 수 있는 슬롯을 놓치지 않는다.
 */
export function matchSlots<T extends SlotFields & { importance: number }>(candidates: T[]): Partial<Record<NewsSlot, T>> {
  const sorted = [...candidates].sort((a, b) => b.importance - a.importance);
  const used = new Set<T>();
  const matched: Partial<Record<NewsSlot, T>> = {};
  for (const slot of ["domestic", "it", "top"] as const) {
    const pick = sorted.find((candidate) => !used.has(candidate) && fitsSlot(slot, candidate));
    if (!pick) continue;
    matched[slot] = pick;
    used.add(pick);
  }
  return matched;
}

/** 후보로 채울 수 없는 슬롯. 지면 순서대로. */
export function emptySlots(candidates: (SlotFields & { importance: number })[]): NewsSlot[] {
  const matched = matchSlots(candidates);
  return NEWS_SLOTS.filter((slot) => !matched[slot]);
}
