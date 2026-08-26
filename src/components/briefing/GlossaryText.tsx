import { splitGlossaryTerms } from "@/lib/glossary";

/**
 * 문장 안의 경제 용어에 설명을 붙인다.
 *
 * hover는 마우스에만 있으므로 button으로 만들어 터치에서는 탭하면 뜨게 한다.
 * 상태를 들고 있지 않으므로 client component가 아니다. (CSS group-hover / focus-within)
 *
 * 설명 상자는 `relative`가 걸린 가장 가까운 조상을 기준으로 자리를 잡는다.
 * 용어마다 따로 띄우면 오른쪽 끝 용어에서 화면 밖으로 나가므로,
 * 부르는 쪽에서 줄 전체를 감싸는 요소에 `relative`를 준다.
 */
export function GlossaryText({
  text,
  used,
  idPrefix,
}: {
  text: string;
  /** 한 지면에서 이미 설명한 용어. 같은 말을 두 번 밑줄 치지 않는다 */
  used: Set<string>;
  idPrefix: string;
}) {
  const segments = splitGlossaryTerms(text, used);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "text") return segment.text;

        const tooltipId = `${idPrefix}-${index}`;

        return (
          <span key={tooltipId} className="group">
            <button
              type="button"
              aria-describedby={tooltipId}
              className="glossary-mark box-decoration-clone cursor-help rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {segment.text}
            </button>

            <span
              id={tooltipId}
              role="tooltip"
              className="invisible absolute top-full left-0 z-20 mt-3 w-max max-w-[min(28rem,calc(100vw-5rem))] border border-ink bg-paper px-4 py-3 text-left opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            >
              <span className="block text-sm leading-normal font-semibold text-ink">
                {segment.entry.term}
              </span>
              <span className="mt-1 block text-sm leading-relaxed font-normal text-ink-muted">
                {segment.entry.definition}
              </span>
            </span>
          </span>
        );
      })}
    </>
  );
}
