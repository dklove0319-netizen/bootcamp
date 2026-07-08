// 아이디 되찾기 (3-1) — 토큰 없이 오면 이메일 입력 폼, 메일 속 링크(?token=)로 오면 이 기기에 아이디 복원.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";

const KEY = "ozero_key";
const CODE = "ozero_code";

export default function Recover() {
  const m = useMessages();
  const [mode, setMode] = useState<"form" | "busy" | "sent" | "restored" | "bad">("busy");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pasteCode, setPasteCode] = useState("");
  const [error, setError] = useState("");

  // 토큰 하나로 이 기기에 아이디를 복원한다 (URL 링크로 왔거나, 아래 칸에 붙여넣었거나 — 둘 다 같은 길)
  // 아이폰 홈 화면 앱은 주소창이 없어 링크를 못 여니, 코드를 붙여넣는 길이 반드시 필요하다.
  function redeem(token: string): void {
    setMode("busy");
    fetch("/api/email/recover", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        if (!r.ok) { setError(m.email.confirmBad); setMode("form"); return; }
        const d = (await r.json()) as { secret?: string; observerCode?: string };
        if (d.secret === undefined || d.observerCode === undefined) { setError(m.email.confirmBad); setMode("form"); return; }
        try {
          window.localStorage.setItem(KEY, d.secret);
          window.localStorage.setItem(CODE, d.observerCode);
        } catch {
          // 저장 실패해도 코드는 보여준다
        }
        setCode(d.observerCode);
        setMode("restored");
      })
      .catch(() => { setError(m.email.confirmBad); setMode("form"); });
  }

  useEffect(() => {
    let token = "";
    try {
      token = new URLSearchParams(window.location.search).get("token") ?? "";
    } catch {
      token = "";
    }
    if (token === "") { setMode("form"); return; }
    redeem(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function request() {
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(m.email.bad); return; }
    setMode("busy");
    try {
      const r = await fetch("/api/email/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) { setMode("form"); setError(m.email.failed); return; }
      setMode("sent");
    } catch {
      setMode("form");
      setError(m.email.failed);
    }
  }

  return (
    <main>
      {mode === "busy" && <p className="muted" style={{ marginTop: "24dvh" }}>{m.me.loading}</p>}

      {mode === "form" && (
        <>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "30dvh 0 6px" }}>{m.email.recoverTitle}</h1>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{m.email.recoverHint}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={m.email.placeholder}
            style={{
              display: "block", width: "100%", padding: 12, marginTop: 16, textAlign: "left",
              background: "#fffdf8", color: "var(--ink)", border: "1px solid #e3d9c8", borderRadius: 8, fontSize: 16, fontFamily: "inherit",
            }}
          />
          {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "10px 0 0" }}>{error}</p>}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={request}>{m.email.recoverSend}</button>
          </div>

          {/* 복구 코드 붙여넣기 — 아이폰 홈 화면 앱처럼 링크를 못 여는 곳에서 쓴다 */}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid #e3d9c8" }}>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>{m.email.pasteHint}</p>
            <textarea
              value={pasteCode}
              onChange={(e) => setPasteCode(e.target.value)}
              placeholder={m.email.pastePlaceholder}
              rows={3}
              style={{
                display: "block", width: "100%", padding: 12, textAlign: "left",
                background: "#fffdf8", color: "var(--ink)", border: "1px solid #e3d9c8", borderRadius: 8,
                fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", wordBreak: "break-all",
              }}
            />
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => {
                const raw = pasteCode.trim();
                // 코드만 붙였든, 링크 전체를 붙였든(...?token=CODE) 토큰만 뽑아낸다
                const token = raw.includes("token=") ? decodeURIComponent(raw.split("token=")[1].split(/[&\s]/)[0]) : raw;
                if (token === "") { setError(m.email.bad); return; }
                redeem(token);
              }}
                style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #d9d2c4", background: "transparent", color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font-main)", fontSize: 14 }}>
                {m.email.pasteSubmit}
              </button>
            </div>
          </div>
        </>
      )}

      {mode === "sent" && <p style={{ marginTop: "24dvh", fontSize: 16, lineHeight: 1.8 }}>{m.email.recoverSent}</p>}

      {mode === "restored" && (
        <>
          <p style={{ marginTop: "24dvh", fontSize: 17, lineHeight: 1.8 }}>{m.email.recovered.replace("{code}", code)}</p>
          <p className="font-main" style={{ fontSize: 30, fontWeight: 700, marginTop: 8, letterSpacing: "0.05em" }}>{code}</p>
        </>
      )}

      {mode === "bad" && <p style={{ marginTop: "24dvh", fontSize: 16, lineHeight: 1.8 }}>{m.email.confirmBad}</p>}

      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        {mode === "restored" ? (
          <Link href="/me" className="btn">{m.save.toMe}</Link>
        ) : (
          <Link href="/" className="muted" style={{ textDecoration: "underline" }}>{m.me.backHome}</Link>
        )}
      </div>
    </main>
  );
}
