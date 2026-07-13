// 거울 저장 흐름 (스텝 3-0) — 측정 결과 화면 아래에 붙는다.
// 새 오제로 아이디 발급(o056부터) 또는 기존 아이디 이어받기 + 배달 시간 정하기 → 오늘 거울 저장.
// 비밀 열쇠(secret)와 아이디는 브라우저(localStorage)에만 보관 — 이게 익명 신원이다.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { formatHour, clientLocale } from "../../lib/time";
import NotifySwitch from "../components/NotifySwitch";

export type Measurement = {
  freeText: string;
  userSplit: { src: string; label: string }[];
  aiSplit: { src: string; label: string }[];
  question: string | null;
  answer: string | null; // 질문에 남긴 답 — 내일 회수의 재료
};

const KEY = "ozero_key";
const CODE = "ozero_code";

export default function SaveMirror({ measurement }: { measurement: Measurement }) {
  const m = useMessages();
  const loc = clientLocale();
  const [haveCode, setHaveCode] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "form" | "done">("idle");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [codeInput, setCodeInput] = useState("");
  const [recordHour, setRecordHour] = useState(21);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ observerCode: string; recordHour: number } | null>(null);
  const [todaySaved, setTodaySaved] = useState(false);

  useEffect(() => {
    // 이미 이 기기에 오제로 아이디가 있으면 저장 폼 대신, 오늘의 거울을 바로 남긴다
    // (안 그러면 둘째 날부터 기록이 증발해 "내일 돌아온다" 약속이 깨진다)
    try {
      const code = window.localStorage.getItem(CODE);
      const key = window.localStorage.getItem(KEY);
      if (code !== null && key !== null) {
        setHaveCode(code);
        fetch("/api/observer/entry", {
          method: "POST",
          headers: { "content-type": "application/json", "x-ozero-key": key },
          body: JSON.stringify(measurement),
        })
          .then((r) => setTodaySaved(r.ok))
          .catch(() => setTodaySaved(false));
      }
    } catch {
      // localStorage 접근 불가(사생활 모드 등)면 그냥 저장 폼 경로로 둔다
    }
    // measurement 는 결과 화면 진입 시점에 확정된 값 — 최초 1회만 저장한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError("");
    setSaving(true);
    try {
      const timezone =
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Seoul";
      const res = await fetch("/api/observer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, code: mode === "existing" ? codeInput : undefined, recordHour, timezone, measurement }),
      });
      const data = (await res.json()) as { observerCode?: string; secret?: string; error?: string };
      if (!res.ok || data.error !== undefined || data.secret === undefined || data.observerCode === undefined) {
        setError(data.error ?? m.save.failed);
        return;
      }
      try {
        window.localStorage.setItem(KEY, data.secret);
        window.localStorage.setItem(CODE, data.observerCode);
      } catch {
        // 저장은 서버에 됐으니 진행 — 다만 이 기기에서 회수는 어려울 수 있음
      }
      setDone({ observerCode: data.observerCode, recordHour });
      setStage("done");
    } catch {
      setError(m.save.failed);
    } finally {
      setSaving(false);
    }
  }

  // 이미 아이디가 있는 기기 — 오늘의 거울이 자동으로 남는다
  if (haveCode !== null) {
    return (
      <div style={{ marginTop: 26 }}>
        <p className="muted" style={{ fontSize: 14, marginBottom: 4 }}>
          {m.save.have.replace("{code}", haveCode)}
        </p>
        {todaySaved && (
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>{m.save.savedToday}</p>
        )}
        <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>
          {m.save.toMe}
        </Link>
      </div>
    );
  }

  // 발급 완료
  if (stage === "done" && done !== null) {
    return (
      <div style={{ marginTop: 26 }}>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>{m.save.doneTitle}</p>
        <p className="font-main" style={{ fontSize: 30, fontWeight: 700, margin: "4px 0 0", letterSpacing: "0.05em" }}>
          {done.observerCode}
        </p>
        <p className="muted" style={{ fontSize: 14, margin: "10px 0 0" }}>
          {m.save.doneTime.replace("{t}", formatHour(done.recordHour, loc))}
        </p>
        <div style={{ margin: "4px 0 14px" }}>
          <NotifySwitch m={m} hourText={formatHour(done.recordHour, loc)} />
        </div>
        <Link href="/me" className="btn">
          {m.save.toMe}
        </Link>
      </div>
    );
  }

  // 저장 권유
  if (stage === "idle") {
    return (
      <div style={{ marginTop: 26 }}>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.7 }}>{m.save.ladder}</p>
        <p style={{ fontSize: 16, margin: "0 0 4px" }}>{m.save.prompt}</p>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.7 }}>{m.save.hint}</p>
        <button type="button" className="btn" onClick={() => setStage("form")}>
          {m.save.cta}
        </button>
      </div>
    );
  }

  // 발급 폼
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {(["new", "existing"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setMode(opt);
              setError(""); // 모드를 바꾸면 이전 모드의 오류는 지운다
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              fontSize: 14,
              fontFamily: "var(--font-main)",
              cursor: "pointer",
              border: "1px solid " + (mode === opt ? "var(--ink)" : "#d9d2c4"),
              background: mode === opt ? "var(--ink)" : "transparent",
              color: mode === opt ? "var(--bg)" : "var(--muted)",
            }}
          >
            {opt === "new" ? m.save.new : m.save.existing}
          </button>
        ))}
      </div>

      {mode === "existing" && (
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder={m.save.codePlaceholder}
          style={{
            display: "block",
            width: "100%",
            padding: 12,
            marginBottom: 16,
            textAlign: "left",
            background: "#fffdf8",
            color: "var(--ink)",
            border: "1px solid #e3d9c8",
            borderRadius: 8,
            fontSize: 16,
            fontFamily: "inherit",
          }}
        />
      )}

      <label className="muted" style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
        {m.save.timeLabel}
      </label>
      <select
        value={recordHour}
        onChange={(e) => setRecordHour(Number(e.target.value))}
        style={{
          width: "100%",
          padding: 12,
          marginBottom: 16,
          background: "#fffdf8",
          color: "var(--ink)",
          border: "1px solid #e3d9c8",
          borderRadius: 8,
          fontSize: 16,
          fontFamily: "inherit",
        }}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {formatHour(h, loc)}
          </option>
        ))}
      </select>
      {recordHour <= 4 && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "-8px 0 16px" }}>
          {m.save.nightHint.replace("{t}", formatHour(recordHour, loc))}
        </p>
      )}

      {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "0 0 12px" }}>{error}</p>}

      <button type="button" className="btn" onClick={submit} disabled={saving}>
        {saving ? m.save.saving : m.save.submit}
      </button>
    </div>
  );
}
