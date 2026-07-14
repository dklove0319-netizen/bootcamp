// 홈 = 무료 측정 입구 (명세: docs/plan/screens/S17-무료측정.md · 스펙 1단계)
// 문구 구성(사용자 지정): 서브 "무의식 패턴 분석"(SUIT) → 메인 이름·보조 이름(Pretendard)
// 언어별 문구는 useMessages()가 배급 — 영어권엔 "Ozero's Mirror"가 메인, 한글 이름이 서브로 뒤집힌다.
"use client";
import Link from "next/link";
import { useMessages } from "../lib/i18n";

export default function Home() {
  const m = useMessages();
  return (
    <main>
      <div style={{ marginTop: "22dvh" }}>
        <p className="muted" style={{ margin: 0, letterSpacing: "0.15em" }}>
          {m.app.subtitle}
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: "10px 0 0" }}>{m.app.name}</h1>
        <h2 className="font-main" style={{ fontSize: 17, fontWeight: 500, margin: "4px 0 0", color: "var(--muted)" }}>
          {m.app.nameEn}
        </h2>
        <p className="muted" style={{ margin: "26px 0 0", fontSize: 14, lineHeight: 1.9 }}>
          {m.app.scene1}
          <br />
          {m.app.scene2}
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.9 }}>{m.app.promise}</p>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.9 }}>
          {m.app.line1}
          <br />
          {m.app.line2}
        </p>
      </div>
      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        <Link href="/measure" className="btn">
          {m.measure.start}
        </Link>
      </div>
    </main>
  );
}
