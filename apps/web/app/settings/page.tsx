// 설정 (3-2 + 3-4 · 명세: S15) — 기록 시각 · 연구 동의(기본 꺼짐·이력) · 109 상시 항목 · 완전 삭제
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { formatHour, clientLocale } from "../../lib/time";

const KEY = "ozero_key";
const CODE = "ozero_code";

type State = {
  observerCode: string | null;
  recordHour: number;
  research: boolean;
  consents: { consent_type: string; policy_version: string; granted_at: string; revoked_at: string | null }[];
};

function ozeroKey(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export default function Settings() {
  const m = useMessages();
  const loc = clientLocale();
  const [st, setSt] = useState<"loading" | "nokey" | "failed" | "ready">("loading");
  const [data, setData] = useState<State | null>(null);
  const [hour, setHour] = useState(21);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState("");
  const [delError, setDelError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    const key = ozeroKey();
    if (key === null) { setSt("nokey"); return; }
    fetch("/api/account", { headers: { "x-ozero-key": key } })
      .then(async (r) => {
        if (r.status === 401) { setSt("nokey"); return; }
        if (!r.ok) { setSt("failed"); return; }
        const d = (await r.json()) as State;
        setData(d);
        setHour(d.recordHour);
        setSt("ready");
      })
      .catch(() => setSt("failed"));
  }
  useEffect(load, []);

  if (st === "loading") return <main><p className="muted" style={{ marginTop: "20dvh" }}>{m.me.loading}</p></main>;
  if (st === "nokey") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.none}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}><Link href="/measure" className="btn">{m.me.toMeasure}</Link></div>
      </main>
    );
  }
  if (st === "failed" || data === null) {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.failed}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}><button type="button" className="btn" onClick={load}>{m.report.retry}</button></div>
      </main>
    );
  }

  const key = ozeroKey();
  return (
    <main>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "32px 0 2px" }}>{m.settings.title}</h1>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>{data.observerCode}</p>

      {/* 1. 기록 시각 */}
      <div style={{ marginTop: 26 }}>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>{m.settings.hourLabel}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))}
            style={{ padding: 10, background: "#fffdf8", color: "var(--ink)", border: "1px solid #e3d9c8", borderRadius: 8, fontSize: 15, fontFamily: "inherit" }}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{formatHour(h, loc)}</option>
            ))}
          </select>
          <button type="button" disabled={busy || hour === data.recordHour} onClick={async () => {
            setBusy(true); setNote("");
            try {
              const r = await fetch("/api/account", {
                method: "PATCH",
                headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
                body: JSON.stringify({ recordHour: hour }),
              });
              if (!r.ok) { setNote(m.settings.saveFailed); return; }
              setData({ ...data, recordHour: hour });
              setNote(m.settings.hourApplied);
            } catch { setNote(m.settings.saveFailed); } finally { setBusy(false); }
          }}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d9d2c4", background: "transparent", color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font-main)" }}>
            {m.loop.day0Submit}
          </button>
        </div>
        {note !== "" && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{note}</p>}
      </div>

      {/* 2. 연구 동의 (3-2) — 기본 꺼짐, 켜고 끔이 전부 이력으로 */}
      <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid #e3d9c8" }}>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>{m.settings.researchTitle}</p>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", cursor: "pointer" }}>
          <input type="checkbox" checked={data.research} style={{ marginTop: 4 }} onChange={async (e) => {
            const next = e.target.checked;
            try {
              const r = await fetch("/api/account", {
                method: "PUT",
                headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
                body: JSON.stringify({ research: next }),
              });
              if (r.ok) load();
            } catch { /* 상태 재조회로 정리 */ }
          }} />
          <span className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>{m.settings.researchLabel}</span>
        </label>
        {data.consents.length > 0 && (
          <div style={{ marginTop: 12, textAlign: "left" }}>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 4px" }}>{m.settings.consentHistory}</p>
            {data.consents.map((c, i) => (
              <p key={i} className="muted" style={{ fontSize: 11, margin: 0 }}>
                {c.consent_type} {c.policy_version} · {c.granted_at.slice(0, 10)}
                {c.revoked_at !== null ? ` · ${m.settings.revokedAt} ${c.revoked_at.slice(0, 10)}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 3. 이야기할 수 있는 곳 (S15 상시 항목) */}
      <p style={{ marginTop: 28, fontSize: 13 }}>
        <a href="tel:109" className="muted" style={{ textDecoration: "underline" }}>{m.settings.crisis}</a>
      </p>

      {/* 4. 완전 삭제 (3-4) */}
      <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid #e3d9c8" }}>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>{m.settings.deleteTitle}</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{m.settings.deleteWarn}</p>
        <p className="muted" style={{ fontSize: 13, margin: "10px 0 6px" }}>“{m.settings.deleteConfirmWord}”</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={m.settings.deletePlaceholder}
          style={{ display: "block", width: "100%", padding: 10, textAlign: "left", background: "#fffdf8", color: "var(--ink)", border: "1px solid #e3d9c8", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} />
        {delError !== "" && <p style={{ color: "#a05b3f", fontSize: 13, margin: "8px 0 0" }}>{delError}</p>}
        <button type="button" disabled={busy} onClick={async () => {
          setDelError("");
          if (confirm.trim() !== m.settings.deleteConfirmWord) { setDelError(m.settings.deleteMismatch); return; }
          setBusy(true);
          try {
            const r = await fetch("/api/account", {
              method: "DELETE",
              headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
              body: JSON.stringify({ confirm: confirm.trim() }),
            });
            if (!r.ok) { setDelError(m.settings.deleteFailed); return; }
            try {
              window.localStorage.removeItem(KEY);
              window.localStorage.removeItem(CODE);
            } catch { /* 무시 */ }
            window.location.href = "/";
          } catch { setDelError(m.settings.deleteFailed); } finally { setBusy(false); }
        }}
          style={{ marginTop: 10, padding: "10px 16px", borderRadius: 8, border: "1px solid #c9a396", background: "transparent", color: "#a05b3f", cursor: "pointer", fontFamily: "var(--font-main)", fontSize: 14 }}>
          {m.settings.deleteBtn}
        </button>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 26, paddingBottom: 16 }}>
        <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.save.toMe}</Link>
      </div>
    </main>
  );
}
