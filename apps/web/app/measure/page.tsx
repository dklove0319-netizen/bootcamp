// 무료 측정 — 기록 입력 화면 (명세: docs/plan/screens/S17-무료측정.md)
// 이 화면이 하는 일: 쓰기 가이드를 보여주고, 기록을 받아 측정 버튼을 누르게 한다.
// AI 판독(서버)은 스텝 2-2에서 연결 — 지금은 자리 표시만.
"use client";
import { useState } from "react";
import Link from "next/link";
import ko from "../../messages/ko.json";

export default function Measure() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    if (text.trim() === "") {
      setError(ko.measure.empty);
      return;
    }
    setError("");
    setSubmitted(true); // 스텝 2-2에서 서버 판독 호출로 교체된다
  }

  if (submitted) {
    return (
      <main>
        <p className="muted" style={{ marginTop: "20dvh" }}>
          {ko.measure.building}
        </p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/" className="muted" style={{ textDecoration: "underline" }}>
            {ko.measure.backHome}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="muted" style={{ marginTop: 24, lineHeight: 1.8 }}>
        <p style={{ margin: 0 }}>{ko.measure.guide1}</p>
        <p style={{ margin: 0 }}>{ko.measure.guide2}</p>
        <p style={{ margin: 0 }}>{ko.measure.guide3}</p>
        <p style={{ margin: 0 }}>{ko.measure.guide4}</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        style={{
          marginTop: 16,
          width: "100%",
          padding: 12,
          background: "#fffdf8",
          color: "var(--ink)",
          border: "1px solid #e3d9c8",
          borderRadius: 8,
          fontSize: 16,
          fontFamily: "inherit",
          lineHeight: 1.6,
          resize: "vertical"
        }}
      />
      {error !== "" && (
        <p style={{ color: "#a05b3f", fontSize: 14, margin: "8px 0 0" }}>{error}</p>
      )}
      <div style={{ marginTop: "auto", paddingTop: 16, paddingBottom: 16 }}>
        <button type="button" className="btn" onClick={submit}>
          {ko.measure.submit}
        </button>
      </div>
    </main>
  );
}
