import Link from "next/link";

/** 신문 하단의 지난 호 안내. */
export function ArchiveLink() {
  return (
    <div className="border-t border-rule py-8">
      <Link href="/archive" className="label prose-link hover:text-ink">
        지난 브리핑 보기 →
      </Link>
    </div>
  );
}
