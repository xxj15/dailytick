import Link from "next/link";
import { formatKoreanDate, getPublishTimeLabel, type DateString } from "@/lib/date";

/**
 * 오늘 브리핑이 아직 없을 때.
 * 빈 화면 대신 상태를 설명하고 가장 최근 브리핑으로 안내한다.
 */
export function EmptyBriefing({
  beforePublishTime,
  latestDate,
}: {
  beforePublishTime: boolean;
  latestDate: DateString | null;
}) {
  return (
    <section className="border-b border-rule py-20 text-center">
      <p className="headline text-xl sm:text-2xl">
        {beforePublishTime
          ? `오늘의 브리핑은 오전 ${getPublishTimeLabel()}에 발행됩니다.`
          : "오늘의 브리핑을 준비하고 있습니다."}
      </p>

      {!beforePublishTime && (
        <p className="mt-3 text-[15px] text-ink-muted">잠시 후 다시 확인해주세요.</p>
      )}

      {latestDate && (
        <p className="label mt-8">
          <Link
            href={`/archive/${latestDate}`}
            className="prose-link hover:text-ink"
          >
            가장 최근 브리핑 · {formatKoreanDate(latestDate)}
          </Link>
        </p>
      )}
    </section>
  );
}
