// 하루 루프 입구 — 단계 2 "오늘의 눈금"(S03)이 스텝 1-3에서 여기 채워진다.
import Link from "next/link";
import ko from "../../messages/ko.json";

export default function Today() {
  return (
    <main>
      <p className="muted" style={{ marginTop: "20dvh" }}>
        {ko.today.building}
      </p>
      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        <Link href="/" className="muted" style={{ textDecoration: "underline" }}>
          {ko.today.backHome}
        </Link>
      </div>
    </main>
  );
}
