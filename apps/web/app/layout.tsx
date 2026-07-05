// 모든 페이지를 감싸는 껍데기(레이아웃). 문구는 messages/ko.json 에서만 (i18n 구조 — 지시서 8번).
import "./globals.css";
import ko from "../messages/ko.json";

export const metadata = { title: ko.app.name, description: ko.app.tagline };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="frame">{children}</div>
      </body>
    </html>
  );
}
