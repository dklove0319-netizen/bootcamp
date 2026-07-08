// 이메일 연결 확인 (3-1) — 메일 속 링크가 여기로 온다. 토큰을 서버에 보내 연결을 확정한다.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";

export default function LinkEmail() {
  const m = useMessages();
  const [state, setState] = useState<"busy" | "done" | "taken" | "bad">("busy");
  const [code, setCode] = useState("");

  useEffect(() => {
    let token = "";
    try {
      token = new URLSearchParams(window.location.search).get("token") ?? "";
    } catch {
      token = "";
    }
    if (token === "") { setState("bad"); return; }
    fetch("/api/email/link", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        if (r.status === 409) { setState("taken"); return; }
        if (!r.ok) { setState("bad"); return; }
        const d = (await r.json()) as { observerCode?: string };
        setCode(d.observerCode ?? "");
        setState("done");
      })
      .catch(() => setState("bad"));
  }, []);

  return (
    <main>
      {state === "busy" && <p className="muted" style={{ marginTop: "24dvh" }}>{m.me.loading}</p>}
      {state === "done" && (
        <>
          <p style={{ marginTop: "24dvh", fontSize: 17, lineHeight: 1.8 }}>{m.email.confirmDone}</p>
          {code !== "" && <p className="font-main" style={{ fontSize: 26, fontWeight: 700, marginTop: 10 }}>{code}</p>}
        </>
      )}
      {state === "taken" && <p style={{ marginTop: "24dvh", fontSize: 16, lineHeight: 1.8 }}>{m.email.taken}</p>}
      {state === "bad" && <p style={{ marginTop: "24dvh", fontSize: 16, lineHeight: 1.8 }}>{m.email.confirmBad}</p>}
      <div style={{ marginTop: "auto", paddingBottom: 16 }}>
        <Link href="/me" className="btn">{m.save.toMe}</Link>
      </div>
    </main>
  );
}
