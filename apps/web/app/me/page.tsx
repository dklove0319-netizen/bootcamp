// 내 거울 (스텝 3-0) — 이 기기의 비밀 열쇠로 내 아이디·배달 시간·저장된 거울을 불러온다.
// 새로고침해도 열쇠가 남아 있으면 그대로 다시 보인다 (저장 확인 기준).
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { formatHour, clientLocale } from "../../lib/time";
import { COURSE_PRICE, LIST_PRICE, formatKrw } from "../../lib/pricing";

type Split = { src: string; label: string };
type Entry = { entry_date: string; free_text: string | null; user_split: Split[] | null; ai_split: Split[] | null; question_text: string | null };
type Me = { observerCode: string; recordHour: number; timezone: string; entries: Entry[] };
type Mirror3 = {
  days: number;
  repeats?: { quotes: { date: string; src: string }[] }[];
  note?: string | null;
  question?: string | null;
};

const KEY = "ozero_key";

export default function MyMirror() {
  const m = useMessages();
  const loc = clientLocale();
  const [state, setState] = useState<"loading" | "none" | "failed" | "ready">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [mirror3, setMirror3] = useState<Mirror3 | null>(null);

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
        const data = (await res.json()) as Me;
        setMe(data);
        setState("ready");
        // 서로 다른 날짜가 3일 이상이면 사흘의 거울을 불러온다
        const dates = new Set(data.entries.map((e) => e.entry_date));
        if (dates.size >= 3 && key !== null) {
          fetch("/api/observer/mirror3", { headers: { "x-ozero-key": key } })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: Mirror3 | null) => {
              // 내용이 실제로 있을 때만 보여준다 (생성 순단 시 빈 골격 방지)
              const has = d !== null && d.days >= 3 && ((d.repeats ?? []).length > 0 || (d.question ?? null) !== null);
              if (has) setMirror3(d);
            })
            .catch(() => {
              // 사흘의 거울 실패는 내 거울 표시를 막지 않는다
            });
        }
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

      {mirror3 !== null && (
        <div style={{ marginTop: 34, paddingBottom: 20, borderBottom: "1px solid #e3d9c8" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{m.me.mirror3Title}</h2>
          <p className="muted" style={{ fontSize: 13, margin: "6px 0 14px" }}>{m.me.mirror3Sub}</p>
          {(mirror3.repeats ?? []).map((rep, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              {rep.quotes.map((q, j) => (
                <p key={j} style={{ margin: "0 0 4px", fontSize: 15, lineHeight: 1.7 }}>
                  <span className="muted" style={{ fontSize: 12 }}>{q.date}</span>
                  {"  "}“{q.src}”
                </p>
              ))}
            </div>
          ))}
          {typeof mirror3.note === "string" && mirror3.note !== "" && (
            <p style={{ fontSize: 15, lineHeight: 1.7, margin: "10px 0 0" }}>{mirror3.note}</p>
          )}
          {typeof mirror3.question === "string" && mirror3.question !== "" && (
            <p style={{ fontSize: 16, lineHeight: 1.7, margin: "14px 0 0" }}>{mirror3.question}</p>
          )}

          <div style={{ marginTop: 26, padding: "18px 16px", border: "1px solid #d9d2c4", borderRadius: 12 }}>
            <p className="font-main" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{m.me.courseTitle}</p>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.8, margin: "8px 0 0" }}>{m.me.courseDesc}</p>
            <p style={{ margin: "12px 0 0", fontSize: 15 }}>
              <span className="muted" style={{ textDecoration: "line-through", marginRight: 8 }}>{formatKrw(LIST_PRICE)}</span>
              <span className="font-main" style={{ fontSize: 20, fontWeight: 700 }}>{formatKrw(COURSE_PRICE)}</span>
            </p>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "8px 0 0" }}>{m.me.courseConsent}</p>
            <p style={{ fontSize: 14, margin: "12px 0 0" }}>{m.me.courseSoon}</p>
          </div>
        </div>
      )}

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
