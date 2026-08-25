import { Footer } from "@/components/layout/Footer";
import { Masthead } from "@/components/layout/Masthead";
import { getTodayKST } from "@/lib/date";

/** DB 조회를 기다리는 동안의 지면. 신문 레이아웃을 미리 잡아 둔다. */
export default function Loading() {
  return (
    <>
      <Masthead date={getTodayKST()} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6" aria-busy="true">
        <div className="border-b border-rule py-12">
          <p className="label">Today&apos;s Takeaway</p>
          <div className="mt-5 space-y-3">
            <Bar className="h-7 w-11/12" />
            <Bar className="h-7 w-8/12" />
          </div>
        </div>

        <div className="grid gap-12 py-12 lg:grid-cols-[35fr_65fr] lg:gap-16">
          <div className="space-y-4">
            <Bar className="h-3 w-32" />
            <Bar className="h-5 w-2/3" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-11/12" />
            <Bar className="h-3 w-9/12" />
          </div>

          <div className="space-y-4">
            <Bar className="h-3 w-32" />
            <Bar className="h-5 w-3/4" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-10/12" />
            <Bar className="h-3 w-8/12" />
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
