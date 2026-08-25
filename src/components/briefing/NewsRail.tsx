"use client";

import { useEffect, useState } from "react";

type RailItem = { rank: number; title: string };

/**
 * 기사 목록을 지면 위에 고정으로 붙이면 스크롤할수록 쓸모가 없어진다.
 * 왼쪽 여백에 눈금으로 걸어두고, 지금 읽는 기사만 표시한다.
 * 눈금에 커서를 올리면 제목이 펼쳐진다. (여백이 있는 넓은 화면에서만)
 */
export function NewsRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState(items[0]?.rank ?? 1);
  const [visible, setVisible] = useState(false);

  // 지금 화면 한가운데에 있는 기사를 따라간다
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];

        if (top) setActive(Number(top.target.id.replace("news-", "")));
      },
      { rootMargin: "-25% 0px -55% 0px" },
    );

    for (const item of items) {
      const element = document.getElementById(`news-${item.rank}`);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [items]);

  // 지면 첫 화면에서는 숨겨두고, 읽기 시작하면 나타난다
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 280);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="기사 바로가기"
      className={`fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 transition-opacity duration-300 xl:block ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ul className="group/rail rounded-lg bg-paper py-2 pr-3 pl-2">
        {items.map((item) => {
          const on = item.rank === active;

          return (
            <li key={item.rank}>
              <a
                href={`#news-${item.rank}`}
                aria-current={on ? "true" : undefined}
                className="flex items-center gap-3 py-1.5"
              >
                <span
                  aria-hidden
                  className={`h-px shrink-0 transition-all duration-300 ${
                    on ? "w-8 bg-ink" : "w-4 bg-rule group-hover/rail:bg-ink-muted"
                  }`}
                />

                <span
                  className={`max-w-0 overflow-hidden text-xs whitespace-nowrap transition-all duration-300 group-hover/rail:max-w-[14rem] ${
                    on ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {item.title}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
