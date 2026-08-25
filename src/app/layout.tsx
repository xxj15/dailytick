import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${APP_NAME} — 오늘의 금융 브리핑`,
  description: APP_DESCRIPTION,
  // 개인용 프로젝트이므로 검색 노출하지 않는다.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSerifKr.variable} h-full antialiased`}
    >
      <head>
        {/* Pretendard는 self-host. dynamic subset이라 필요한 글자 조각만 내려받는다. */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
