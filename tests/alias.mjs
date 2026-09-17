/**
 * `@/` 경로를 src로 이어 준다.
 *
 * Next.js는 tsconfig paths를 알지만 node는 모른다.
 * 테스트 하나 돌리자고 번들러나 테스트 프레임워크를 들이지 않기 위한 20줄이다.
 * 확장자 없는 import도 .ts로 이어 준다. (bundler resolution)
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

export async function resolve(specifier, context, next) {
  let target = specifier.startsWith("@/")
    ? path.join(src, specifier.slice(2))
    : null;

  if (target === null && specifier.startsWith(".") && context.parentURL) {
    const fromDir = path.dirname(fileURLToPath(context.parentURL));
    const candidate = path.resolve(fromDir, specifier);
    if (!path.extname(candidate)) target = candidate;
  }

  if (target === null) return next(specifier, context);

  const resolved = existsSync(`${target}.ts`) ? `${target}.ts` : target;
  return next(pathToFileURL(resolved).href, context);
}
