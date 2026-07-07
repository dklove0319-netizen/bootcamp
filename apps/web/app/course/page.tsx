// 21일 코스 결제 (블럭 10 · 테스트 모드) — 원화 = 토스 결제창, 달러 = 테스트 시뮬레이션
// 검증 동의 체크가 결제의 조건 (PRICING_SPEC: "그 동의가 이 가격의 조건이에요")
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { COURSE_PRICE, LIST_PRICE, COURSE_PRICE_USD, LIST_PRICE_USD, formatKrw, formatUsd, TOSS_TEST_CLIENT_KEY } from "../../lib/pricing";

declare global {
  interface Window { TossPayments?: (key: string) => { requestPayment: (method: string, opts: Record<string, unknown>) => Promise<void> } }
}

function ozeroKey(): string | null {
  try { return window.localStorage.getItem("ozero_key"); } catch { return null; }
}

export default function Course() {
  const m = useMessages();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setHasKey(ozeroKey() !== null);
    // 토스 결제창 SDK (v1) — 테스트 키 모드
    if (document.querySelector("script[data-toss]") === null) {
      const s = document.createElement("script");
      s.src = "https://js.tosspayments.com/v1/payment";
      s.setAttribute("data-toss", "1");
      document.head.appendChild(s);
    }
  }, []);

  async function payKrw() {
    if (!agreed) { setError(m.course.agreeFirst); return; }
    setError("");
    const clientKey = (process.env.TOSS_CLIENT_KEY ?? "") !== "" ? (process.env.TOSS_CLIENT_KEY as string) : TOSS_TEST_CLIENT_KEY;
    if (typeof window.TossPayments !== "function") { setError(m.course.tossNotReady); return; }
    const orderId = "ozero-" + crypto.randomUUID();
    try {
      await window.TossPayments(clientKey).requestPayment("카드", {
        amount: COURSE_PRICE,
        orderId,
        orderName: "오제로의 거울 — 21일 검증 코스",
        successUrl: window.location.origin + "/course/success",
        failUrl: window.location.origin + "/course?fail=1",
      });
    } catch {
      // 사용자가 결제창을 닫음 — 조용히
    }
  }

  async function payUsdTest() {
    if (!agreed) { setError(m.course.agreeFirst); return; }
    setError("");
    setBusy(true);
    try {
      const key = ozeroKey();
      const res = await fetch("/api/pay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
        body: JSON.stringify({ provider: "test_usd", orderId: "ozero-usd-" + crypto.randomUUID(), amount: COURSE_PRICE_USD, currency: "USD" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) { setError(data.error ?? m.course.failed); return; }
      setDone(true);
    } catch {
      setError(m.course.failed);
    } finally {
      setBusy(false);
    }
  }

  if (hasKey === false) {
    return (
      <main>
        <p style={{ marginTop: "24dvh", fontSize: 16, lineHeight: 1.8 }}>{m.course.needId}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/measure" className="btn">{m.measure.start}</Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main>
        <p style={{ marginTop: "24dvh", fontSize: 18, lineHeight: 1.8 }}>{m.course.doneTitle}</p>
        <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>{m.course.doneSub}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/today" className="btn">{m.course.toToday}</Link>
        </div>
      </main>
    );
  }

  const price = currency === "KRW" ? formatKrw(COURSE_PRICE) : formatUsd(COURSE_PRICE_USD);
  const list = currency === "KRW" ? formatKrw(LIST_PRICE) : formatUsd(LIST_PRICE_USD);

  return (
    <main>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "40px 0 6px" }}>{m.me.courseTitle}</h1>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{m.me.courseDesc}</p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 22 }}>
        {(["KRW", "USD"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCurrency(c)}
            style={{
              padding: "6px 18px", borderRadius: 999, fontSize: 14, fontFamily: "var(--font-main)", cursor: "pointer",
              border: "1px solid " + (currency === c ? "var(--ink)" : "#d9d2c4"),
              background: currency === c ? "var(--ink)" : "transparent",
              color: currency === c ? "var(--bg)" : "var(--muted)",
            }}>
            {c === "KRW" ? "₩ KRW" : "$ USD"}
          </button>
        ))}
      </div>

      <p style={{ margin: "18px 0 0", fontSize: 16 }}>
        <span className="muted" style={{ textDecoration: "line-through", marginRight: 10 }}>{list}</span>
        <span className="font-main" style={{ fontSize: 28, fontWeight: 700 }}>{price}</span>
      </p>
      <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{m.course.testMode}</p>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", margin: "22px 0 0", cursor: "pointer" }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>{m.me.courseConsent}</span>
      </label>

      {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}

      <div style={{ marginTop: "auto", paddingTop: 22, paddingBottom: 16 }}>
        {currency === "KRW" ? (
          <button type="button" className="btn" onClick={payKrw} disabled={busy}>{m.course.payKrw}</button>
        ) : (
          <button type="button" className="btn" onClick={payUsdTest} disabled={busy}>
            {busy ? m.course.paying : m.course.payUsd}
          </button>
        )}
        <p style={{ marginTop: 12 }}>
          <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.me.backHome}</Link>
        </p>
      </div>
    </main>
  );
}
