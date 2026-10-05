import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${APP_NAME} — 오늘의 금융 브리핑`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  // 개인용 프로젝트이므로 검색 노출하지 않는다.
  robots: { index: false, follow: false },
  // iOS 홈 화면에 추가했을 때 주소창 없이 앱처럼 열린다.
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // 설치 앱의 상태 표시줄도 지면과 같은 흰 종이색으로 맞춘다.
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 제목·본문 모두 Pretendard. self-host + dynamic subset이라 필요한 글자 조각만 내려받는다. */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
