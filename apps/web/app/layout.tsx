// 모든 페이지를 감싸는 껍데기(레이아웃). 문구는 messages/*.json 에서만 (i18n 구조 — 지시서 8번).
// 요청마다 Accept-Language(브라우저 언어 명함)를 읽어 ko/en 을 정한다 — 영어권 자동 영어.
import "./globals.css";
import { headers } from "next/headers";
import { pickLocale } from "../lib/locale";
import { LocaleProvider } from "../lib/i18n";
import ko from "../messages/ko.json";
import en from "../messages/en.json";

async function getLocale() {
  const h = await headers();
  return pickLocale(h.get("accept-language"));
}

export async function generateMetadata() {
  const m = (await getLocale()) === "ko" ? ko : en;
  // manifest = 홈 화면 추가용 명함 — 아이폰은 이걸로 설치해야 웹 푸시를 받을 수 있다 (블럭 8-1)
  // icons — 없으면 아이폰이 제목 첫 글자로 아이콘을 자동 생성해버린다 (사용자 지시 2026-07-08: ".o0" 아이콘으로 교체)
  return {
    title: m.app.name,
    description: m.app.tagline,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>
          <div className="frame">{children}</div>
        </LocaleProvider>
      </body>
    </html>
  );
}
