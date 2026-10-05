import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 상위 폴더(pjt/)의 package-lock.json을 프로젝트 루트로 오인하지 않도록 고정한다.
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        // 서비스 워커가 캐시에 묶이면 고친 버전이 사용자에게 닿지 않는다.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
