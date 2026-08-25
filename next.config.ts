import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 상위 폴더(pjt/)의 package-lock.json을 프로젝트 루트로 오인하지 않도록 고정한다.
    root: path.join(__dirname),
  },
};

export default nextConfig;
