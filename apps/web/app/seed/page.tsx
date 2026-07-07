// 검증 도구 (공개 확장 전 제거 대상) — 버튼 하나로 3일/21일치 시험 데이터를 심고 그 시점으로 들어가 본다.
// 원래 아이디는 이 기기에 백업해 두고, 버튼 하나로 되돌아온다.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "ozero_key";
const CODE = "ozero_code";
const BK = "ozero_key_backup";
const BC = "ozero_code_backup";

export default function Seed() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [msg, setMsg] = useState("");
  const [hasBackup, setHasBackup] = useState(false);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    try {
      setHasBackup(window.localStorage.getItem(BK) !== null);
      setHasKey(window.localStorage.getItem(KEY) !== null);
    } catch { /* 무시 */ }
  }, []);

  async function seed(days: 3 | 21) {
    setState("busy");
    setMsg("");
    try {
      const key = window.localStorage.getItem(KEY);
      if (key === null) { setState("failed"); setMsg("오제로 아이디가 있어야 시험 데이터를 만들 수 있어요. 먼저 측정하고 아이디를 받아주세요."); return; }
      const res = await fetch("/api/dev/seed", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ozero-key": key },
        body: JSON.stringify({ days }),
      });
      const data = (await res.json()) as { code?: string; secret?: string; error?: string };
      if (!res.ok || data.secret === undefined) { setState("failed"); setMsg(data.error ?? "만들지 못했어요."); return; }
      // 원래 신원 백업 (한 번만) 후 시험 신원으로 교체
      if (window.localStorage.getItem(BK) === null) {
        window.localStorage.setItem(BK, key);
        window.localStorage.setItem(BC, window.localStorage.getItem(CODE) ?? "");
      }
      window.localStorage.setItem(KEY, data.secret);
      window.localStorage.setItem(CODE, data.code ?? "o999");
      setHasBackup(true);
      setState("done");
      setMsg(days === 3 ? "3일치가 준비됐어요. 지금 당신은 시험 관찰자 o999예요." : "21일치가 준비됐어요. 지금 당신은 시험 관찰자 o999예요.");
    } catch {
      setState("failed");
      setMsg("만들지 못했어요.");
    }
  }

  function restore() {
    try {
      const bk = window.localStorage.getItem(BK);
      if (bk !== null) {
        window.localStorage.setItem(KEY, bk);
        window.localStorage.setItem(CODE, window.localStorage.getItem(BC) ?? "");
        window.localStorage.removeItem(BK);
        window.localStorage.removeItem(BC);
        setHasBackup(false);
        setMsg("원래 아이디로 돌아왔어요.");
        setState("idle");
      }
    } catch { /* 무시 */ }
  }

  return (
    <main>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "40px 0 6px" }}>검증 도구</h1>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
        시험 관찰자(o999)에게 기록을 심어 3일·21일 시점을 미리 봅니다.
        내 실제 기록은 건드리지 않아요. 공개 전 제거되는 내부 도구예요.
      </p>

      {!hasKey && (
        <p style={{ fontSize: 14, marginTop: 16 }}>
          먼저 <Link href="/measure" style={{ textDecoration: "underline" }}>측정</Link>으로 아이디를 받아주세요.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        <button type="button" className="btn" disabled={state === "busy"} onClick={() => seed(3)}>
          3일치 심고 들어가보기 (사흘의 거울)
        </button>
        <button type="button" className="btn" disabled={state === "busy"} onClick={() => seed(21)}>
          21일치 심고 들어가보기 (중간 거울 · 보고서)
        </button>
        {hasBackup && (
          <button type="button" disabled={state === "busy"} onClick={restore}
            style={{ padding: "12px", borderRadius: 8, border: "1px solid #d9d2c4", background: "transparent", color: "var(--muted)", fontFamily: "var(--font-main)", cursor: "pointer" }}>
            내 원래 아이디로 돌아가기
          </button>
        )}
      </div>

      {state === "busy" && <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>심고 있어요.</p>}
      {msg !== "" && <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.7 }}>{msg}</p>}

      {state === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
          <Link href="/me" style={{ textDecoration: "underline" }}>내 거울 보기 (사흘의 거울 · 격자 · 보고서 입구)</Link>
          <Link href="/today" style={{ textDecoration: "underline" }}>오늘 루프 보기</Link>
          <Link href="/report" style={{ textDecoration: "underline" }}>21일 보고서 보기 (21일치일 때)</Link>
        </div>
      )}

      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        <Link href="/" className="muted" style={{ textDecoration: "underline" }}>홈으로</Link>
      </div>
    </main>
  );
}
