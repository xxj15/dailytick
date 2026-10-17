import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST } from "@/lib/date";

/** DB 조회를 기다리는 동안의 지면. 실제 지면과 같은 자리에 뼈대를 잡아 둔다. */
export default function Loading() {
  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="page-width flex-1" aria-busy="true">
        <div className="card mt-8 p-6 sm:p-8">
          <h2 className="label">오늘의 키워드</h2>

          <div className="mt-4 max-w-3xl">
            <div className="flex flex-wrap gap-3">
              <Bar className="h-7 w-32 bg-rule" />
              <Bar className="h-7 w-40 bg-rule" />
              <Bar className="h-7 w-28 bg-rule" />
            </div>
            <Bar className="mt-4 h-4 w-9/12 bg-rule" />
          </div>
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
          <div className="min-w-0">
            {/* 섹션 탭 자리 */}
            <div className="flex gap-6 border-b border-rule py-4">
              <Bar className="h-5 w-28" />
              <Bar className="h-5 w-28" />
            </div>

            <div className="space-y-4 pt-10">
              <Bar className="h-3 w-32" />
              <Bar className="h-7 w-2/3" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-11/12" />
              <Bar className="h-3 w-9/12" />
            </div>
          </div>

          <div className="mt-12 lg:mt-0 lg:pt-20">
            <Bar className="h-52 w-full rounded-[20px]" />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}
