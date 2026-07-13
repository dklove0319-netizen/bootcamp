// 저녁 알림 스위치 (블럭 8-1 · J-4에서 공용 부품으로 분리) — 브라우저 허락 → 안테나(sw.js) 등록 → 배달 주소를 서버에 보관
// /me 와 아이디 발급 완료 화면(SaveMirror)에서 같이 쓴다. 옵트인 그대로 — 노출 위치만 넓힌 것.
"use client";
import { useEffect, useState } from "react";
import type { useMessages } from "../../lib/i18n";

const KEY = "ozero_key";

// VAPID 공개 도장(base64url) → 브라우저 구독이 요구하는 바이트 배열
function vapidBytes(key: string): Uint8Array {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = window.atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function NotifySwitch({ m, hourText }: { m: ReturnType<typeof useMessages>; hourText: string }) {
  const [st, setSt] = useState<"checking" | "unsupported" | "off" | "on" | "busy" | "denied" | "failed">("checking");

  // 브라우저 구독을 서버 창고에 저장 (idempotent — 여러 번 불러도 안전). 성공 여부를 돌려준다.
  async function saveSub(sub: PushSubscription): Promise<boolean> {
    const key = window.localStorage.getItem(KEY);
    try {
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
        body: JSON.stringify(sub.toJSON()),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSt("unsupported");
      return;
    }
    // 자가 치유(2026-07-08): 브라우저엔 구독이 있는데 서버 저장이 어긋난 경우(되찾기 전 만들어진 구독 등)를
    // 앱을 열 때마다 서버로 다시 맞춘다. 저장이 안 되면 꺼진 것으로 본다 (다시 켜기 유도).
    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then(async (sub) => {
        if (sub === null) { setSt("off"); return; }
        const ok = await saveSub(sub);
        setSt(ok ? "on" : "off");
      })
      .catch(() => setSt("off"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setSt((await saveSub(sub)) ? "on" : "failed");
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
