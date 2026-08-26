import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST } from "@/lib/date";

/** 없는 날짜의 Archive 상세 등. 신문 레이아웃을 유지한다. */
export default function NotFound() {
  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="page-width flex-1">
        <section className="border-b border-rule py-20 text-center">
          <p className="label">Not Found</p>
          <p className="headline mt-4 text-xl sm:text-2xl">
            해당 날짜의 브리핑이 없습니다.
          </p>
        </section>

        <div className="border-t border-rule py-8">
          <Link href="/archive" className="label prose-link hover:text-ink">
            ← Archive
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
