// 하루 루프 입구 — 단계 2 "오늘의 눈금"(S03)이 블럭 4에서 여기 채워진다.
"use client";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";

export default function Today() {
  const m = useMessages();
  return (
    <main>
      <p className="muted" style={{ marginTop: "20dvh" }}>
        {m.today.building}
      </p>
      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        <Link href="/" className="muted" style={{ textDecoration: "underline" }}>
          {m.today.backHome}
        </Link>
      </div>
    </main>
  );
}
