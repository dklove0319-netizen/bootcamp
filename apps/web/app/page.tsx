// 홈 = 무료 측정 입구 (명세: docs/plan/screens/S17-무료측정.md · 스펙 1단계)
// 21일 코스 입구는 블럭 4에서 로그인과 함께 다시 열린다.
import Link from "next/link";
import ko from "../messages/ko.json";

export default function Home() {
  return (
    <main>
      <div style={{ marginTop: "20dvh" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{ko.app.name}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {ko.app.tagline}
        </p>
      </div>
      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        <Link href="/measure" className="btn">
          {ko.measure.start}
        </Link>
      </div>
    </main>
  );
}
