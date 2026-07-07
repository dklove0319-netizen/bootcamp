// 무료 측정 — 오늘의 기록 전부 쓰기 → (같은 화면 스크롤) 기준 안내 → 사실만 다시 쓰기 → 거울 검증
// (스텝 2-8 · 명세: docs/plan/screens/S17-무료측정.md · 자세규정 8장 사실 검증 모듈의 화면화)
// 훈련의 핵심 장면: "이건 사실인가 해석인가"를 참가자의 실제 문장 위에서, 스스로 다시 쓰며 반복한다.
// 거울은 사실 칸의 오염만 짚는다 — 깨끗하면 칭찬 없이 조용히 통과 (자세규정 8-6).
// 한도 안내는 들어올 때 미리 한다 — 쓰기를 다 시킨 뒤 문을 닫지 않는다.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import SaveMirror from "./SaveMirror";

type MirrorItem = { src: string; label: "fact" | "delusion" | "unclear"; reason: string | null };
type MeasureResult = {
  items: MirrorItem[];
  actionNote: string | null;
  factCount: number;
  delusionCount: number;
  clean: boolean;
  question: string | null;
};
type Recall = {
  none?: boolean;
  date?: string;
  question?: string | null;
  answer?: string | null;
  reflection?: string | null;
};

/** 이 기기의 오제로 비밀 열쇠 (있으면 하루 3회) */
function ozeroKey(): string | null {
  try {
    return window.localStorage.getItem("ozero_key");
  } catch {
    return null;
  }
}

const boxStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "#fffdf8",
  color: "var(--ink)",
  border: "1px solid #e3d9c8",
  borderRadius: 8,
  fontSize: 16,
  fontFamily: "inherit",
  lineHeight: 1.6,
  resize: "vertical",
};

export default function Measure() {
  const m = useMessages();
  const LABEL_TEXT: Record<MirrorItem["label"], string> = {
    fact: m.measure.fact,
    delusion: m.measure.delusion,
    unclear: m.measure.unclear,
  };
  const [phase, setPhase] = useState<"compose" | "result" | "limited">("compose");
  const [text, setText] = useState("");
  const [facts, setFacts] = useState("");
  const [feelings, setFeelings] = useState("");
  const [actions, setActions] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MeasureResult | null>(null);
  const [recall, setRecall] = useState<Recall | null>(null);

  useEffect(() => {
    const key = ozeroKey();
    // 입구 사전 확인: 오늘 한도를 이미 썼으면 쓰기 전에 알려준다
    fetch("/api/measure", { headers: key !== null ? { "x-ozero-key": key } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { allowed?: boolean } | null) => {
        if (d !== null && d.allowed === false) setPhase("limited");
      })
      .catch(() => {
        // 확인 실패면 그냥 진행 — 최종 판정은 서버가 한다
      });
    // 어제의 회수: 아이디 보유자에게 "내일 돌아온다" 약속을 지키는 화면
    if (key !== null) {
      fetch("/api/observer/recall", { headers: { "x-ozero-key": key } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Recall | null) => {
          if (d !== null && d.none !== true && typeof d.question === "string") setRecall(d);
        })
        .catch(() => {
          // 회수 실패는 오늘의 기록을 막지 않는다
        });
    }
  }, []);

  async function toMirror() {
    if (text.trim() === "") {
      setError(m.measure.empty);
      return;
    }
    if (facts.trim() === "") {
      setError(m.measure.factsEmpty);
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
        body: JSON.stringify({ text, facts, feelings, actions }),
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
    return (
      <main>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "32px 0 20px" }}>{m.measure.resultTitle}</h2>
        {result.clean && (
          <p className="muted" style={{ margin: "0 0 18px", fontSize: 15 }}>{m.measure.clean}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {result.items.map((c, i) => {
            const flagged = c.label !== "fact";
            return (
              <div key={i}>
                <p style={{ margin: 0, fontSize: 16 }}>“{c.src}”</p>
                <p
                  className="muted"
                  style={{
                    margin: "3px 0 0",
                    fontSize: 13,
                    fontWeight: flagged ? 600 : 400,
                    color: flagged ? "var(--ink)" : undefined,
                  }}
                >
                  {LABEL_TEXT[c.label]}
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
        {result.actionNote !== null && (
          <div style={{ marginTop: 20 }}>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{m.measure.actionsLabel}</p>
            <p className="muted" style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.7 }}>{result.actionNote}</p>
          </div>
        )}
        <p className="font-main" style={{ fontSize: 20, fontWeight: 700, margin: "30px 0 0" }}>
          {m.measure.mirrorRatio
            .replace("{f}", String(result.factCount))
            .replace("{d}", String(result.delusionCount))}
        </p>
        {result.question !== null && (
          <>
            <p style={{ marginTop: 26, fontSize: 17, lineHeight: 1.7 }}>{result.question}</p>
            <p className="muted" style={{ margin: "14px 0 6px", fontSize: 13 }}>{m.measure.answerLabel}</p>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} style={boxStyle} />
          </>
        )}
        <SaveMirror
          measurement={{
            freeText: text,
            userSplit: [
              { src: facts, label: "facts" },
              ...(feelings.trim() !== "" ? [{ src: feelings.trim(), label: "feelings" }] : []),
              ...(actions.trim() !== "" ? [{ src: actions.trim(), label: "actions" }] : []),
            ],
            aiSplit: result.items.map((c) => ({ src: c.src, label: c.label })),
            question: result.question,
            answer: answer.trim() !== "" ? answer.trim() : null,
          }}
        />
        <div style={{ marginTop: "auto", paddingTop: 24, paddingBottom: 16 }}>
          <button
            type="button"
            className="muted"
            style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}
            onClick={() => {
              setPhase("compose");
              setResult(null);
              setText("");
              setFacts("");
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

  return (
    <main>
      {recall !== null && (
        <div style={{ marginTop: 24, paddingBottom: 8, borderBottom: "1px solid #e3d9c8" }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{m.measure.recallTitle}</p>
          <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.7 }}>{recall.question}</p>
          {recall.answer !== null && recall.answer !== undefined ? (
            <>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
                {m.measure.recallAnswer} — “{recall.answer}”
              </p>
              {typeof recall.reflection === "string" && (
                <p style={{ margin: "10px 0 8px", fontSize: 15, lineHeight: 1.8 }}>{recall.reflection}</p>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: "10px 0 8px", fontSize: 13 }}>{m.measure.recallNoAnswer}</p>
          )}
        </div>
      )}
      <div className="muted" style={{ marginTop: 24, lineHeight: 1.8, whiteSpace: "pre-line" }}>
        <p style={{ margin: 0 }}>{m.measure.guide1}</p>
        <p style={{ margin: "14px 0 0" }}>{m.measure.guide2}</p>
        <p style={{ margin: "14px 0 0" }}>{m.measure.guide3}</p>
        <p style={{ margin: "14px 0 0" }}>{m.measure.guide4}</p>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} style={{ ...boxStyle, marginTop: 16 }} />

      <h2
        style={{
          fontWeight: 600,
          margin: "34px 0 10px",
          whiteSpace: "nowrap",
          fontSize: "min(14px, calc((100vw - 40px) / 25.5))",
        }}
      >
        {m.measure.factsTitle}
      </h2>
      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-line" }}>{m.measure.factDef}</p>
      <p className="muted" style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-line" }}>{m.measure.delusionDef}</p>
      <p className="muted" style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-line" }}>{m.measure.example1}</p>
      <p className="muted" style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-line" }}>{m.measure.example2}</p>

      <p style={{ margin: "22px 0 8px", fontSize: 16, fontWeight: 600 }}>{m.measure.factsLabel}</p>
      <textarea value={facts} onChange={(e) => setFacts(e.target.value)} rows={5} style={boxStyle} />

      <p style={{ margin: "22px 0 2px", fontSize: 16, fontWeight: 600 }}>{m.measure.feelingsLabel}</p>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-line" }}>{m.measure.feelingsHelp}</p>
      <textarea value={feelings} onChange={(e) => setFeelings(e.target.value)} rows={3} style={boxStyle} />

      <p style={{ margin: "22px 0 2px", fontSize: 16, fontWeight: 600 }}>{m.measure.actionsLabel}</p>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-line" }}>{m.measure.actionsHelp}</p>
      <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={3} style={boxStyle} />

      {error !== "" && (
        <p style={{ color: "#a05b3f", fontSize: 14, margin: "10px 0 0" }}>{error}</p>
      )}
      <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 16 }}>
        <button type="button" className="btn" onClick={toMirror} disabled={loading}>
          {loading ? m.measure.loading : m.measure.toMirror}
        </button>
      </div>
    </main>
  );
}
