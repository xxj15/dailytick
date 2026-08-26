import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST } from "@/lib/date";

/** DB 조회를 기다리는 동안의 지면. 실제 지면과 같은 자리에 뼈대를 잡아 둔다. */
export default function Loading() {
  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6" aria-busy="true">
        <div className="border-b border-rule py-12">
          <h2 className="headline text-lg">오늘 기억할 한 줄</h2>
          <p className="mt-1 text-sm text-ink-muted">
            오늘 시장에서 가장 중요한 흐름을 한 문장으로 정리했다.
          </p>

          <div className="mt-6 max-w-3xl space-y-3 border-l-4 border-rule pl-5">
            <Bar className="h-7 w-11/12" />
            <Bar className="h-7 w-8/12" />
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
