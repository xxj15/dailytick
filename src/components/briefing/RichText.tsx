import { Fragment } from "react";

/**
 * AI가 쓴 설명문을 읽기 좋게 보여준다.
 *
 * 마크다운 전체를 받지 않는다. 지면에 필요한 네 가지만 해석한다.
 *   - 빈 줄로 나눈 문단
 *   - ``` 로 감싼 코드 블록
 *   - ` 로 감싼 인라인 코드
 *   - ** 로 감싼 강조
 * HTML로 끼워 넣지 않고 React 요소로만 만든다. AI 응답에 태그가 섞여도 글자로 보인다.
 */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.split(/```[a-zA-Z0-9-]*\n?([\s\S]*?)```/g);

  return (
    <div className={`rich-text ${className}`}>
      {blocks.map((block, index) => {
        // split의 캡처 그룹 자리(홀수 index)가 코드 블록 안쪽이다
        if (index % 2 === 1) {
          return block.trim() ? (
            <pre key={index}>
              <code>{block.replace(/^\n+|\s+$/g, "")}</code>
            </pre>
          ) : null;
        }

        return block
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, paragraphIndex) => (
            <p key={`${index}-${paragraphIndex}`}>
              <Inline text={paragraph} />
            </p>
          ));
      })}
    </div>
  );
}

/** 인라인 코드를 먼저 떼어 낸다. 코드 안의 ** 는 강조로 바꾸지 않는다. */
function Inline({ text }: { text: string }) {
  return text.split(/`([^`\n]+)`/g).map((part, index) =>
    index % 2 === 1 ? (
      <code key={index}>{part}</code>
    ) : (
      <Fragment key={index}>
        {part.split(/\*\*([^*\n]+)\*\*/g).map((piece, pieceIndex) =>
          pieceIndex % 2 === 1 ? (
            <strong key={pieceIndex} className="font-semibold text-ink">{piece}</strong>
          ) : (
            piece
          ),
        )}
      </Fragment>
    ),
  );
}
