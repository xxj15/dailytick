import { ECONOMY_NEWS_CATEGORIES, IT_NEWS_CATEGORIES, NEWS_SLOTS } from "@/config/app";
import type { NewsCategory, NewsRegion, NewsSlot, StoredNewsSlot } from "@/types/briefing";

/**
 * 주요 이슈 슬롯 규칙. (config/app.ts의 NEWS_SLOTS)
 *
 * 발행 검증(verify.ts), 근거 확인 자리 확보(ground-news.ts), 빈 슬롯 판단과 작성 프롬프트가 같은 규칙을 쓴다.
 * 서버 전용 코드를 두지 않는다. 테스트에서 부를 수 있어야 한다.
 */

type SlotFields = { region: NewsRegion; category: NewsCategory };

export const SLOT_NAME: Record<StoredNewsSlot, string> = {
  top: "top(오늘의 화제)",
  economy: "economy(경제)",
  it: "it(IT)",
  domestic: "domestic(국내 정세)",
};

const IT = new Set<NewsCategory>(IT_NEWS_CATEGORIES);
const ECONOMY = new Set<NewsCategory>(ECONOMY_NEWS_CATEGORIES);
const ECONOMY_SCOPE = "증시·금리·환율·경기·산업·기업·경제정책";

/**
 * 슬롯에 들어갈 수 없는 이유. 들어갈 수 있으면 null. 재시도 프롬프트에 그대로 들어가므로 고칠 방법까지 쓴다.
 * 예전 슬롯(domestic)은 이미 저장된 기사에만 있다. 규칙을 다시 보지 않는다.
 */
export function slotMismatch(slot: StoredNewsSlot, item: SlotFields): string | null {
  if (slot === "economy" && IT.has(item.category)) {
    return `${SLOT_NAME.economy} 슬롯에 IT 분류(${item.category}) 기사를 넣었습니다. IT 기사는 it 슬롯에 두고, 이 자리는 ${ECONOMY_SCOPE} 사건으로 바꾸세요.`;
  }
  if (slot === "economy" && !ECONOMY.has(item.category)) {
    return `${SLOT_NAME.economy} 슬롯은 분류가 ${ECONOMY_NEWS_CATEGORIES.join("·")} 중 하나여야 하는데 ${item.category}입니다. 정치·외교·사회 사건은 이 자리에 둘 수 없습니다. ${ECONOMY_SCOPE} 사건으로 바꾸세요.`;
  }
  if (slot === "it" && !IT.has(item.category)) {
    return `${SLOT_NAME.it} 슬롯은 분류가 ${IT_NEWS_CATEGORIES.join("·")} 중 하나여야 하는데 ${item.category}입니다. IT 사건으로 바꾸세요.`;
  }
  return null;
}

export function fitsSlot(slot: NewsSlot, item: SlotFields): boolean {
  return slotMismatch(slot, item) === null;
}

/** 지면 순서. 예전 국내 정세는 지금 경제 자리(두 번째)에 둔다. slot이 없는 뉴스(과거 row)는 뒤에 둔다. */
export function slotOrder(slot: StoredNewsSlot | undefined): number {
  if (!slot) return NEWS_SLOTS.length;
  return NEWS_SLOTS.indexOf(slot === "domestic" ? "economy" : slot);
}

/**
 * 후보로 세 슬롯을 서로 다른 사건으로 채워 본다. 채울 수 없는 슬롯은 비어 있다.
 * 조건이 있는 경제·IT를 먼저 채우고, 오늘의 화제는 남은 후보 가운데 가장 중요한 것으로 채운다.
 * 경제와 IT는 분류가 겹치지 않으므로 이 순서면 채울 수 있는 슬롯을 놓치지 않는다.
 */
export function matchSlots<T extends SlotFields & { importance: number }>(candidates: T[]): Partial<Record<NewsSlot, T>> {
  const sorted = [...candidates].sort((a, b) => b.importance - a.importance);
  const used = new Set<T>();
  const matched: Partial<Record<NewsSlot, T>> = {};
  for (const slot of ["economy", "it", "top"] as const) {
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
