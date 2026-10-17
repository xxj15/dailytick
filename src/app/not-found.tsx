import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST } from "@/lib/date";

/** 없는 날짜의 Archive 상세 등. 같은 헤더와 지면 폭을 유지한다. */
export default function NotFound() {
  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="page-width flex-1">
        <section className="card mt-8 px-6 py-16 text-center">
          <p className="label">404</p>
          <p className="headline mt-4 text-xl sm:text-2xl">
            해당 날짜의 브리핑이 없습니다.
          </p>
        </section>

        <div className="py-8">
          <Link href="/archive" className="text-sm font-semibold text-primary hover:text-primary-strong">
            ← Archive
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
