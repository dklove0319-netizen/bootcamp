// 무료 측정 — 기록 입력 → 사용자가 먼저 구별 → 거울 대조 (명세: docs/plan/screens/S17-무료측정.md)
// 순서가 핵심: 사용자 구별이 AI보다 먼저다 (지시서 3번 — AI가 먼저 답을 주면 훈련이 아니라 의존이 된다).
// 대조(2-7): 조각별로 [내 구별 vs 거울]을 나란히 놓고, 어긋난 조각엔 카메라 기준 한 줄 —
// 채점·정답률 없음, 거울의 구별도 정답이 아니라 또 하나의 거울 (지시서 6단계).
// 한도 안내는 들어올 때 미리 한다 — 구별을 다 시킨 뒤 문을 닫지 않는다.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import SaveMirror from "./SaveMirror";

type Label = "fact" | "delusion";
type MirrorItem = { src: string; user: Label; mirror: "fact" | "delusion" | "unclear"; reason: string | null };
type MeasureResult = {
  items: MirrorItem[];
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

/** 이 기기의 오제로 비밀 열쇠 (있으면 하루 3회) */
function ozeroKey(): string | null {
  try {
    return window.localStorage.getItem("ozero_key");
  } catch {
    return null;
  }
}

export default function Measure() {
  const m = useMessages();
  const LABEL_TEXT: Record<MirrorItem["mirror"], string> = {
    fact: m.measure.fact,
    delusion: m.measure.delusion,
    unclear: m.measure.unclear,
  };
  const [phase, setPhase] = useState<"write" | "distinguish" | "result" | "limited">("write");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fragments, setFragments] = useState<string[]>([]);
  const [labels, setLabels] = useState<(Label | null)[]>([]);
  const [result, setResult] = useState<MeasureResult | null>(null);

  useEffect(() => {
    // 입구 사전 확인: 오늘 한도를 이미 썼으면 쓰기 전에 알려준다
    const key = ozeroKey();
    fetch("/api/measure", { headers: key !== null ? { "x-ozero-key": key } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { allowed?: boolean } | null) => {
        if (d !== null && d.allowed === false) setPhase("limited");
      })
      .catch(() => {
        // 확인 실패면 그냥 진행 — 최종 판정은 서버가 한다
      });
  }, []);

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
      const key = ozeroKey();
      const res = await fetch("/api/measure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(key !== null ? { "x-ozero-key": key } : {}),
        },
        body: JSON.stringify({
          text,
          fragments: fragments.map((f, i) => ({ src: f, label: labels[i] })),
        }),
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

  if (phase === "limited") {
    return (
      <main>
        <p style={{ marginTop: "24dvh", fontSize: 17, lineHeight: 1.8 }}>{m.measure.limit}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/" className="muted" style={{ textDecoration: "underline" }}>
            {m.measure.backHome}
          </Link>
        </div>
      </main>
    );
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
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {result.items.map((c, i) => {
            const differs = c.mirror !== c.user;
            return (
              <div key={i}>
                <p style={{ margin: 0, fontSize: 16 }}>“{c.src}”</p>
                <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>
                  {m.measure.youLabel}: {c.user === "fact" ? m.measure.fact : m.measure.delusion}
                  {" · "}
                  <span style={{ fontWeight: differs ? 600 : 400, color: differs ? "var(--ink)" : undefined }}>
                    {m.measure.mirrorLabel}: {LABEL_TEXT[c.mirror]}
                  </span>
                </p>
                {c.reason !== null && (
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.7 }}>
                    {c.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="font-main" style={{ fontSize: 20, fontWeight: 700, margin: "30px 0 0" }}>
          {m.measure.mirrorRatio
            .replace("{f}", String(result.factCount))
            .replace("{d}", String(result.delusionCount))}
        </p>
        {result.question !== null && (
          <p style={{ marginTop: 26, fontSize: 17, lineHeight: 1.7 }}>{result.question}</p>
        )}
        <SaveMirror
          measurement={{
            freeText: text,
            userSplit: fragments.map((f, i) => ({ src: f, label: labels[i] ?? "unclear" })),
            aiSplit: result.items.map((c) => ({ src: c.src, label: c.mirror })),
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
