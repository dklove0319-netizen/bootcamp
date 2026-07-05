// 내 거울 (스텝 3-0) — 이 기기의 비밀 열쇠로 내 아이디·배달 시간·저장된 거울을 불러온다.
// 새로고침해도 열쇠가 남아 있으면 그대로 다시 보인다 (저장 확인 기준).
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { formatHour, clientLocale } from "../../lib/time";

type Split = { src: string; label: string };
type Entry = { entry_date: string; free_text: string | null; user_split: Split[] | null; ai_split: Split[] | null; question_text: string | null };
type Me = { observerCode: string; recordHour: number; timezone: string; entries: Entry[] };

const KEY = "ozero_key";

export default function MyMirror() {
  const m = useMessages();
  const loc = clientLocale();
  const [state, setState] = useState<"loading" | "none" | "failed" | "ready">("loading");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let key: string | null = null;
    try {
      key = window.localStorage.getItem(KEY);
    } catch {
      key = null;
    }
    if (key === null || key === "") {
      setState("none");
      return;
    }
    fetch("/api/observer/me", { headers: { "x-ozero-key": key } })
      .then(async (res) => {
        if (res.status === 404 || res.status === 401) {
          setState("none");
          return;
        }
        if (!res.ok) {
          setState("failed");
          return;
        }
        setMe((await res.json()) as Me);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, []);

  if (state === "loading") {
    return (
      <main>
        <p className="muted" style={{ marginTop: "20dvh" }}>{m.me.loading}</p>
      </main>
    );
  }

  if (state === "none") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.none}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/measure" className="btn">{m.me.toMeasure}</Link>
        </div>
      </main>
    );
  }

  if (state === "failed" || me === null) {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.failed}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/" className="muted" style={{ textDecoration: "underline" }}>{m.me.backHome}</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <p className="muted" style={{ marginTop: 32, fontSize: 14, margin: "32px 0 0" }}>{m.me.title}</p>
      <p className="font-main" style={{ fontSize: 34, fontWeight: 700, margin: "4px 0 0", letterSpacing: "0.05em" }}>
        {me.observerCode}
      </p>
      <p className="muted" style={{ fontSize: 14, margin: "10px 0 0" }}>
        {m.me.deliverAt.replace("{t}", formatHour(me.recordHour, loc))}
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "34px 0 14px" }}>{m.me.records}</h2>
      {me.entries.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>{m.me.empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {me.entries.map((e, i) => (
            <div key={i}>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 6px" }}>{e.entry_date}</p>
              {(e.ai_split ?? []).map((c, j) => (
                <div key={j} style={{ marginBottom: 6 }}>
                  <p style={{ margin: 0, fontSize: 15 }}>“{c.src}”</p>
                  <p className="muted" style={{ margin: "1px 0 0", fontSize: 12, fontWeight: c.label === "delusion" ? 600 : 400 }}>
                    {c.label === "fact" ? m.measure.fact : c.label === "delusion" ? m.measure.delusion : m.measure.unclear}
                  </p>
                </div>
              ))}
              {e.question_text !== null && e.question_text !== "" && (
                <p style={{ fontSize: 15, lineHeight: 1.7, marginTop: 8 }}>{e.question_text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 24, paddingBottom: 16 }}>
        <Link href="/" className="muted" style={{ textDecoration: "underline" }}>{m.me.backHome}</Link>
      </div>
    </main>
  );
}
