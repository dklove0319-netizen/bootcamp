// 토스 결제 성공 복귀 화면 — 서버 확인(승인)을 거쳐야 진짜 완료 (paymentKey/orderId/amount 검증)
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../../lib/i18n";

export default function PaySuccess() {
  const m = useMessages();
  const [state, setState] = useState<"confirming" | "ok" | "failed">("confirming");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentKey = params.get("paymentKey") ?? "";
    const orderId = params.get("orderId") ?? "";
    const amount = Number(params.get("amount") ?? "0");
    let key: string | null = null;
    try { key = window.localStorage.getItem("ozero_key"); } catch { key = null; }
    fetch("/api/pay/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
      body: JSON.stringify({ provider: "toss", paymentKey, orderId, amount, currency: "KRW" }),
    })
      .then(async (r) => {
        const data = (await r.json()) as { ok?: boolean; error?: string };
        if (r.ok && data.ok === true) setState("ok");
        else { setError(data.error ?? ""); setState("failed"); }
      })
      .catch(() => setState("failed"));
  }, []);

  if (state === "confirming") {
    return (
      <main>
        <p className="muted" style={{ marginTop: "24dvh" }}>{m.course.confirming}</p>
      </main>
    );
  }
  if (state === "failed") {
    return (
      <main>
        <p style={{ marginTop: "24dvh", fontSize: 16 }}>{m.course.failed}</p>
        {error !== "" && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/course" className="muted" style={{ textDecoration: "underline" }}>{m.course.back}</Link>
        </div>
      </main>
    );
  }
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
