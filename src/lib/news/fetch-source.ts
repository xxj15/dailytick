import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;

/** 보수적으로 IPv4 공인 주소만 허용한다. IPv6-only 출처는 수집하지 않는다. */
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function validateSourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("HTTPS 기본 포트의 공개 출처만 수집합니다.");
  }
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) || !url.hostname.includes(".") ||
      /\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)) {
    throw new Error("IP 주소와 내부 호스트는 수집할 수 없습니다.");
  }
  return url;
}

export type SourceResponse = { url: string; body: string; contentType: string };

/** DNS 결과를 검사한 뒤 같은 주소로 연결한다. redirect마다 다시 검사한다. */
export async function fetchSource(value: string): Promise<SourceResponse> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = validateSourceUrl(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    signal.throwIfAborted();
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true, family: 4 }),
      new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("출처 수집 시간 초과")), { once: true });
      }),
    ]);
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(({ address }) => !isPublicIPv4(address))) {
      throw new Error("출처가 공개 네트워크 주소가 아닙니다.");
    }
    const result = await new Promise<{ location?: string; body: string; contentType: string }>((resolve, reject) => {
      const req = request(url, {
        signal,
        agent: false,
        headers: { "User-Agent": "DailyTick/1.0 (financial briefing source reader)", Accept: "text/html, text/plain", "Accept-Encoding": "identity" },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, 4);
        },
      }, (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.destroy();
          resolve({ location: res.headers.location, body: "", contentType: "" });
          return;
        }
        const contentType = res.headers["content-type"] ?? "";
        if (status !== 200 || !/^(text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(contentType) ||
            (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
          res.destroy();
          reject(new Error(`본문을 읽을 수 없습니다 (HTTP ${status}, ${contentType}).`));
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            res.destroy(new Error("출처 응답 크기 초과"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            const buffer = Buffer.concat(chunks);
            const charset = /charset=["']?([^\s;"']+)/i.exec(contentType)?.[1] ??
              /charset\s*=\s*["']?([^\s"'/>;]+)/i.exec(buffer.subarray(0, 4096).toString("ascii"))?.[1] ?? "utf-8";
            resolve({ body: new TextDecoder(charset, { fatal: true }).decode(buffer), contentType });
          } catch {
            reject(new Error("출처 문자 인코딩을 읽을 수 없습니다."));
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
    if (result.location) {
      url = validateSourceUrl(new URL(result.location, url).href);
      continue;
    }
    return { url: url.href, body: result.body, contentType: result.contentType };
  }
  throw new Error("출처 redirect 횟수 초과");
}
