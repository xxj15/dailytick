import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST } from "@/lib/date";

/** DB 조회를 기다리는 동안의 지면. 실제 지면과 같은 자리에 뼈대를 잡아 둔다. */
export default function Loading() {
  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="page-width flex-1" aria-busy="true">
        <div className="border-b border-rule py-12">
          <h2 className="headline text-lg">오늘의 키워드</h2>

          <div className="mt-6 max-w-3xl border-l-4 border-rule pl-5">
            <div className="flex flex-wrap gap-3">
              <Bar className="h-7 w-32" />
              <Bar className="h-7 w-40" />
              <Bar className="h-7 w-28" />
            </div>
            <Bar className="mt-4 h-4 w-9/12" />
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
          <div className="min-w-0">
            {/* 섹션 탭 자리 */}
            <div className="flex gap-3 border-b-2 border-ink py-4">
              <Bar className="h-10 w-40" />
              <Bar className="h-10 w-40" />
            </div>

            <div className="space-y-4 pt-10">
              <Bar className="h-3 w-32" />
              <Bar className="h-7 w-2/3" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-11/12" />
              <Bar className="h-3 w-9/12" />
            </div>
          </div>

          <div className="mt-12 space-y-3 border-t border-rule pt-6 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-10 lg:pl-6">
            <Bar className="h-3 w-24" />
            <Bar className="h-40 w-full rounded-lg" />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse bg-muted ${className}`} />;
}
