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
type Me = { observerCode: string; recordHour: number; timezone: string; email: string | null; entries: Entry[] };
type Mirror3 = {
  days: number;
  repeats?: { quotes: { date: string; src: string }[] }[];
  note?: string | null;
  question?: string | null;
  emotionCounts?: { label: string; count: number }[];
  day1Answer?: { date: string; answer: string } | null;
};
type TodayInfo = {
  course: string;
  courseLength: number;
  dayNo: number;
  beyondCourse: boolean;
  mid: { seven: boolean; fourteen: boolean; report: boolean };
  grid: { dayNo: number; date: string; submitted: boolean }[];
  today: { submitted: boolean } | null;
};

const KEY = "ozero_key";

// VAPID 공개 도장(base64url) → 브라우저 구독이 요구하는 바이트 배열
function vapidBytes(key: string): Uint8Array {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = window.atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 저녁 알림 스위치 (블럭 8-1) — 브라우저 허락 → 안테나(sw.js) 등록 → 배달 주소를 서버에 보관
function NotifySwitch({ m, hourText }: { m: ReturnType<typeof useMessages>; hourText: string }) {
  const [st, setSt] = useState<"checking" | "unsupported" | "off" | "on" | "busy" | "denied" | "failed">("checking");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSt("unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => setSt(sub !== null ? "on" : "off"))
      .catch(() => setSt("off"));
  }, []);

  async function enable() {
    setSt("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setSt("denied"); return; }
      const keyRes = await fetch("/api/push/subscribe");
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (publicKey === undefined || publicKey === "") { setSt("failed"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(publicKey) as unknown as BufferSource,
      });
      const key = window.localStorage.getItem(KEY);
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
        body: JSON.stringify(sub.toJSON()),
      });
      setSt(res.ok ? "on" : "failed");
    } catch {
      setSt("failed");
    }
  }

  async function disable() {
    setSt("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub !== null) await sub.unsubscribe();
      const key = window.localStorage.getItem(KEY);
      await fetch("/api/push/subscribe", { method: "DELETE", headers: key !== null ? { "x-ozero-key": key } : {} });
      setSt("off");
    } catch {
      setSt("off");
    }
  }

  if (st === "checking") return null;
  if (st === "unsupported") {
    return <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{m.me.notifyUnsupported} {m.me.notifyIos}</p>;
  }
  return (
    <div style={{ marginTop: 10 }}>
      {st === "on" ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {m.me.notifyOnDone.replace("{t}", hourText)}{" "}
          <button type="button" onClick={disable}
            style={{ background: "none", border: "none", color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            {m.me.notifyOff}
          </button>
        </p>
      ) : (
        <>
          <button type="button" disabled={st === "busy"} onClick={enable}
            style={{ padding: "7px 14px", borderRadius: 999, border: "1px solid #d9d2c4", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-main)" }}>
            {m.me.notifyOn}
          </button>
          {st === "denied" && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{m.me.notifyDenied}</p>}
          {st === "failed" && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{m.me.notifyFailed}</p>}
          <p className="muted" style={{ fontSize: 11, margin: "6px 0 0" }}>{m.me.notifyIos}</p>
        </>
      )}
    </div>
  );
}

// 이메일 연결 구역 (3-1) — 기기를 잃어도 아이디를 되찾을 수 있게 복구용 주소 하나를 붙인다
function EmailSection({ m, linked }: { m: ReturnType<typeof useMessages>; linked: string | null }) {
  const [email, setEmail] = useState("");
  const [st, setSt] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");

  if (linked !== null) {
    return <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{m.email.linked.replace("{e}", linked)}</p>;
  }
  if (st === "sent") {
    return <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{m.email.sent}</p>;
  }
  return (
    <div style={{ marginTop: 12 }}>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 6px" }}>{m.email.linkHint}</p>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={m.email.placeholder}
          style={{ padding: "8px 10px", textAlign: "left", background: "#fffdf8", color: "var(--ink)", border: "1px solid #e3d9c8", borderRadius: 8, fontSize: 14, fontFamily: "inherit", width: 200 }}
        />
        <button type="button" disabled={st === "busy"} onClick={async () => {
          setError("");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(m.email.bad); return; }
          setSt("busy");
          try {
            const key = window.localStorage.getItem(KEY);
            const r = await fetch("/api/email/link", {
              method: "POST",
              headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
              body: JSON.stringify({ email: email.trim() }),
            });
            const d = (await r.json()) as { sent?: boolean; reason?: string; error?: string };
            if (r.status === 409) { setSt("idle"); setError(m.email.taken); return; }
            if (!r.ok) { setSt("idle"); setError(m.email.failed); return; }
            if (d.sent !== true) { setSt("idle"); setError(m.email.mailUnavailable); return; }
            setSt("sent");
          } catch {
            setSt("idle");
            setError(m.email.failed);
          }
        }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d9d2c4", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-main)" }}>
          {m.email.send}
        </button>
      </div>
      {error !== "" && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

export default function MyMirror() {
  const m = useMessages();
  const loc = clientLocale();
  const [state, setState] = useState<"loading" | "none" | "failed" | "ready">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [mirror3, setMirror3] = useState<Mirror3 | null>(null);
  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null);

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
        // 코스 상태 (격자 · 며칠째 · 중간 거울 노출)
        fetch("/api/today", { headers: { "x-ozero-key": key as string } })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: TodayInfo | null) => { if (d !== null) setTodayInfo(d); })
          .catch(() => {});
        // 서로 다른 날짜가 3일 이상이면 반복의 거울을 불러온다 (3 → 7 → 14일로 깊어짐)
        const dates = new Set(data.entries.map((e) => e.entry_date));
        if (dates.size >= 3 && key !== null) {
          const n = dates.size >= 14 ? 14 : dates.size >= 7 ? 7 : 3;
          fetch(`/api/observer/mirror3?n=${n}`, { headers: { "x-ozero-key": key } })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: Mirror3 | null) => {
              // 내용이 실제로 있을 때만 보여준다 (생성 순단 시 빈 골격 방지)
              const has = d !== null && d.days >= 3 && ((d.repeats ?? []).length > 0 || (d.question ?? null) !== null);
              if (has) setMirror3(d);
            })
            .catch(() => {
              // 반복의 거울 실패는 내 거울 표시를 막지 않는다
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
          <p style={{ marginTop: 12 }}>
            <Link href="/recover" className="muted" style={{ textDecoration: "underline", fontSize: 13 }}>{m.email.lost}</Link>
          </p>
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
      <NotifySwitch m={m} hourText={formatHour(me.recordHour, loc)} />
      <EmailSection m={m} linked={me.email ?? null} />

      {todayInfo !== null && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap" }}>
            {todayInfo.grid.map((g) => (
              <span key={g.dayNo} title={g.date}
                style={{
                  width: 18, height: 18, borderRadius: 4, display: "inline-block",
                  border: "1px solid #d9d2c4",
                  background: g.submitted ? "var(--ink)" : "transparent",
                }} />
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
            {m.me.gridLine.replace("{n}", String(Math.min(todayInfo.dayNo, todayInfo.courseLength))).replace("{len}", String(todayInfo.courseLength))}
          </p>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            {!todayInfo.beyondCourse && (todayInfo.today === null || todayInfo.today.submitted === false) && (
              <Link href="/today" className="btn">{m.me.startToday}</Link>
            )}
            {todayInfo.mid.report && (
              <Link href="/report" style={{ textDecoration: "underline", fontSize: 14 }}>{m.report.title}</Link>
            )}
          </div>
        </div>
      )}

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
          {(mirror3.emotionCounts ?? []).length > 0 && (
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
              {m.me.emotionFreq}: {(mirror3.emotionCounts ?? []).map((e) => `${e.label} ${e.count}`).join(" · ")}
            </p>
          )}
          {typeof mirror3.note === "string" && mirror3.note !== "" && (
            <p style={{ fontSize: 15, lineHeight: 1.7, margin: "10px 0 0" }}>{mirror3.note}</p>
          )}
          {mirror3.day1Answer != null && (
            <div style={{ marginTop: 16 }}>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>{m.me.day1Face.replace("{d}", mirror3.day1Answer.date)}</p>
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: "4px 0 0" }}>“{mirror3.day1Answer.answer}”</p>
            </div>
          )}
          {typeof mirror3.question === "string" && mirror3.question !== "" && (
            <p style={{ fontSize: 16, lineHeight: 1.7, margin: "14px 0 0" }}>{mirror3.question}</p>
          )}

          {(todayInfo === null || todayInfo.course !== "mirror21") && (
            <div style={{ marginTop: 26, padding: "18px 16px", border: "1px solid #d9d2c4", borderRadius: 12 }}>
              <p className="font-main" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{m.me.courseTitle}</p>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.8, margin: "8px 0 0" }}>{m.me.courseDesc}</p>
              <p style={{ margin: "12px 0 0", fontSize: 15 }}>
                <span className="muted" style={{ textDecoration: "line-through", marginRight: 8 }}>{formatKrw(LIST_PRICE)}</span>
                <span className="font-main" style={{ fontSize: 20, fontWeight: 700 }}>{formatKrw(COURSE_PRICE)}</span>
              </p>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "8px 0 0" }}>{m.me.courseConsent}</p>
              <div style={{ marginTop: 14 }}>
                <Link href="/course" className="btn">{m.me.courseCta}</Link>
              </div>
            </div>
          )}
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
        <Link href="/settings" className="muted" style={{ textDecoration: "underline", marginRight: 16 }}>{m.settings.toSettings}</Link>
        <Link href="/" className="muted" style={{ textDecoration: "underline" }}>{m.me.backHome}</Link>
      </div>
    </main>
  );
}
