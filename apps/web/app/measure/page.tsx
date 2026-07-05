// 무료 측정 — 기록 입력 → 사용자가 먼저 구별 → AI 거울 대조 (명세: docs/plan/screens/S17-무료측정.md)
// 순서가 핵심: 사용자 구별이 AI보다 먼저다 (지시서 3번 — AI가 먼저 답을 주면 훈련이 아니라 의존이 된다).
// 조각내기는 판단 없는 문법 경계(문장 끝·쉼표)로만 — AI 힌트가 새지 않게.
"use client";
import { useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import SaveMirror from "./SaveMirror";

type Label = "fact" | "delusion";
type Component = { src: string; label: "fact" | "delusion" | "unclear" };
type MeasureResult = {
  components: Component[];
  factCount: number;
  delusionCount: number;
  question: string | null;
};

/** 판단 없는 기계적 조각내기: 문장 끝(.!?…)과 줄바꿈, 쉼표 경계로만 자른다 */
function splitFragments(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .flatMap((s) => s.split(/,\s*/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export default function Measure() {
  const m = useMessages();
  const LABEL_TEXT: Record<Component["label"], string> = {
    fact: m.measure.fact,
    delusion: m.measure.delusion,
    unclear: m.measure.unclear,
  };
  const [phase, setPhase] = useState<"write" | "distinguish" | "result">("write");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fragments, setFragments] = useState<string[]>([]);
  const [labels, setLabels] = useState<(Label | null)[]>([]);
  const [result, setResult] = useState<MeasureResult | null>(null);

  function toDistinguish() {
    if (text.trim() === "") {
      setError(m.measure.empty);
      return;
    }
    setError("");
    const frags = splitFragments(text);
    setFragments(frags);
    setLabels(frags.map(() => null));
    setPhase("distinguish");
  }

  async function toMirror() {
    if (labels.some((l) => l === null)) {
      setError(m.measure.tagAll);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/measure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as MeasureResult & { error?: string };
      if (!res.ok || data.error !== undefined) {
        setError(data.error ?? m.measure.failed);
        return;
      }
      setResult(data);
      setPhase("result");
    } catch {
      setError(m.measure.failed);
    } finally {
      setLoading(false);
    }
  }

  if (phase === "result" && result !== null) {
    const userFact = labels.filter((l) => l === "fact").length;
    const userDelusion = labels.filter((l) => l === "delusion").length;
    return (
      <main>
        <p className="muted" style={{ margin: "32px 0 0", fontSize: 15 }}>
          {m.measure.yourSplit.replace("{f}", String(userFact)).replace("{d}", String(userDelusion))}
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "8px 0 20px" }}>{m.measure.resultTitle}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {result.components.map((c, i) => (
            <div key={i}>
              <p style={{ margin: 0, fontSize: 16 }}>“{c.src}”</p>
              <p
                className="muted"
                style={{ margin: "2px 0 0", fontSize: 13, fontWeight: c.label === "delusion" ? 600 : 400 }}
              >
                {LABEL_TEXT[c.label]}
              </p>
            </div>
          ))}
        </div>
        <p className="font-main" style={{ fontSize: 24, fontWeight: 700, margin: "30px 0 0" }}>
          {m.measure.ratio.replace("{f}", String(result.factCount)).replace("{d}", String(result.delusionCount))}
        </p>
        {result.question !== null && (
          <p style={{ marginTop: 26, fontSize: 17, lineHeight: 1.7 }}>{result.question}</p>
        )}
        <SaveMirror
          measurement={{
            freeText: text,
            userSplit: fragments.map((f, i) => ({ src: f, label: labels[i] ?? "unclear" })),
            aiSplit: result.components,
            question: result.question,
          }}
        />
        <div style={{ marginTop: "auto", paddingTop: 24, paddingBottom: 16 }}>
          <button
            type="button"
            className="muted"
            style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}
            onClick={() => {
              setPhase("write");
              setResult(null);
              setText("");
            }}
          >
            {m.measure.again}
          </button>
          <p style={{ marginTop: 12 }}>
            <Link href="/" className="muted" style={{ textDecoration: "underline" }}>
              {m.measure.backHome}
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (phase === "distinguish") {
    return (
      <main>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "28px 0 12px" }}>{m.measure.distinguishTitle}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
          {m.measure.factDef}
        </p>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.8 }}>
          {m.measure.delusionDef}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
          {fragments.map((frag, i) => (
            <div key={i}>
              <p style={{ margin: 0, fontSize: 16 }}>“{frag}”</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
                {(["fact", "delusion"] as Label[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      setLabels((prev) => {
                        const next = [...prev];
                        next[i] = l;
                        return next;
                      });
                    }}
                    style={{
                      padding: "6px 18px",
                      borderRadius: 999,
                      fontSize: 14,
                      fontFamily: "var(--font-main)",
                      cursor: "pointer",
                      border: "1px solid " + (labels[i] === l ? "var(--ink)" : "#d9d2c4"),
                      background: labels[i] === l ? "var(--ink)" : "transparent",
                      color: labels[i] === l ? "var(--bg)" : "var(--muted)",
                    }}
                  >
                    {l === "fact" ? m.measure.fact : m.measure.delusion}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error !== "" && (
          <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>
        )}
        <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 16 }}>
          <button type="button" className="btn" onClick={toMirror} disabled={loading}>
            {loading ? m.measure.loading : m.measure.toMirror}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="muted" style={{ marginTop: 24, lineHeight: 1.8 }}>
        <p style={{ margin: 0 }}>{m.measure.guide1}</p>
        <p style={{ margin: 0 }}>{m.measure.guide2}</p>
        <p style={{ margin: 0 }}>{m.measure.guide3}</p>
        <p style={{ margin: 0 }}>{m.measure.guide4}</p>
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
        <button type="button" className="btn" onClick={toDistinguish}>
          {m.measure.submit}
        </button>
      </div>
    </main>
  );
}
