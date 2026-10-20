import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { isLoggedIn } from "@/lib/auth";
import { formatKoreanDate, getTodayKST } from "@/lib/date";
import { knowledgeLabel } from "@/lib/labels";
import { getKnowledgeArchive } from "@/lib/supabase/briefings";
import type { KnowledgeArchiveEntry } from "@/types/briefing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "상식 모아보기",
};

/** 지면에 보이는 큰 갈래 순서. 커리큘럼을 바꾸기 전 분류는 맨 뒤 '기타'로 모은다. */
const FIELD_ORDER = ["CS", "프론트엔드", "백엔드·클라우드", "AI", "경제", "증권"];

function groupByField(entries: KnowledgeArchiveEntry[]) {
  const groups = new Map<string, KnowledgeArchiveEntry[]>();
  for (const entry of entries) {
    const field = knowledgeLabel(entry.category).field;
    const key = FIELD_ORDER.includes(field) ? field : "기타";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...FIELD_ORDER, "기타"]
    .filter((field) => groups.has(field))
    .map((field) => ({ field, entries: groups.get(field) ?? [] }));
}

/** 지금까지 배운 상식을 분야별로 다시 찾아보는 자리. 제목을 누르면 그날 지면으로 간다. */
export default async function KnowledgeArchivePage() {
  const canEdit = await isLoggedIn();

  let entries: KnowledgeArchiveEntry[] = [];
  try {
    entries = await getKnowledgeArchive();
  } catch (error) {
    console.error("[archive/knowledge] 조회 실패", error);
  }

  const groups = groupByField(entries);

  return (
    <>
      <Masthead date={getTodayKST()} loggedIn={canEdit} />

      <main className="page-width flex-1">
        <section className="pt-10 pb-4">
          <h1 className="headline text-2xl sm:text-3xl">상식 모아보기</h1>
          <p className="mt-2 text-[15px] text-ink-muted">지금까지 배운 개념 {entries.length}개</p>
          <nav className="mt-5 flex gap-2 text-sm font-semibold">
            <Link href="/archive" className="rounded-full bg-muted px-3.5 py-1.5 text-ink-soft hover:text-ink">
              날짜별
            </Link>
            <span className="rounded-full bg-ink px-3.5 py-1.5 text-paper">상식별</span>
          </nav>
        </section>

        {groups.length === 0 ? (
          <p className="card mt-6 px-6 py-16 text-center text-[15px] text-ink-muted">아직 배운 상식이 없습니다.</p>
        ) : (
          <div className="py-8">
            {groups.map((group) => (
              <section key={group.field} className="mb-12 last:mb-0">
                <h2 className="label pb-3">
                  {group.field} <span className="tabular-nums text-ink-muted/70">{group.entries.length}</span>
                </h2>

                <ul className="card overflow-hidden">
                  {group.entries.map((entry) => (
                    <li key={`${entry.briefingDate}-${entry.slug}`} className="border-b border-rule last:border-b-0">
                      <Link
                        href={`/archive/${entry.briefingDate}`}
                        className="flex items-baseline gap-4 px-5 py-4 transition-colors duration-200 hover:bg-muted"
                      >
                        <span className="min-w-0 flex-1 text-[15px] text-ink">
                          {entry.title}
                          {entry.review && <span className="ml-2 text-xs font-semibold text-ink-muted">복습</span>}
                        </span>
                        <span className="shrink-0 text-xs text-ink-muted tabular-nums">{formatKoreanDate(entry.briefingDate)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
