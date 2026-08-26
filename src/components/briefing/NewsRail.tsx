"use client";

import { useEffect, useState } from "react";

type RailItem = { rank: number; title: string };

/**
 * 기사 목록을 지면 위에 두면 스크롤할수록 화면 밖으로 밀려나 쓸모가 없어진다.
 * 왼쪽 단에 세워두고 스크롤을 따라오게 하면서 지금 읽는 기사를 짚어준다.
 * 여백이 없는 좁은 화면에서는 본문을 가리므로 내보내지 않는다.
 */
export function NewsRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState(items[0]?.rank ?? 1);

  // 화면 위쪽에 걸린 기사를 따라간다
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

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="기사 바로가기"
      className="hidden xl:sticky xl:top-32 xl:block xl:self-start"
    >
      <ul className="space-y-1">
        {items.map((item) => {
          const on = item.rank === active;

          return (
            <li key={item.rank}>
              <a
                href={`#news-${item.rank}`}
                aria-current={on ? "true" : undefined}
                className="group block py-1.5"
              >
                <span
                  aria-hidden
                  className={`mb-1.5 block h-px transition-all duration-300 ${
                    on ? "w-8 bg-ink" : "w-4 bg-ink-muted/40 group-hover:bg-ink-muted"
                  }`}
                />

                <span
                  className={`block text-[13px] leading-snug transition-colors duration-200 ${
                    on
                      ? "font-semibold text-ink"
                      : "text-ink-muted group-hover:text-ink"
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
