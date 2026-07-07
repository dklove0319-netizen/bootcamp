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
  const [customText, setCustomText] = useState("");

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
      becomeTest(data.secret);
      setState("done");
      setMsg(days === 3 ? "3일치가 준비됐어요. 지금 당신은 시험 관찰자 o999예요." : "21일치가 준비됐어요. 지금 당신은 시험 관찰자 o999예요.");
    } catch {
      setState("failed");
      setMsg("만들지 못했어요.");
    }
  }

  // 신원 교체 (원래 아이디는 한 번만 백업)
  function becomeTest(secret: string) {
    const key = window.localStorage.getItem(KEY);
    if (window.localStorage.getItem(BK) === null && key !== null) {
      window.localStorage.setItem(BK, key);
      window.localStorage.setItem(BC, window.localStorage.getItem(CODE) ?? "");
    }
    window.localStorage.setItem(KEY, secret);
    window.localStorage.setItem(CODE, "o999");
    setHasBackup(true);
  }

  // 직접 쓴 기록으로 심기 — 빈 줄로 나눈 덩어리 = 하루치. 거울(AI)이 하루씩 사실/망상을 갈라 심는다.
  async function seedCustom(days: 3 | 21) {
    setMsg("");
    const blocks = customText.split(/\n\s*\n+/).map((b) => b.trim()).filter((b) => b !== "");
    if (blocks.length < 3) { setState("failed"); setMsg("하루치 덩어리가 3개는 있어야 반복이 비춰져요. 날 사이는 빈 줄로 나눠주세요."); return; }
    if (blocks.length > days) { setState("failed"); setMsg(`덩어리가 ${blocks.length}개예요 — ${days}일치에는 ${days}개까지만 넣을 수 있어요.`); return; }
    const tooLong = blocks.findIndex((b) => b.length > 2000);
    if (tooLong >= 0) { setState("failed"); setMsg(`${tooLong + 1}일차 덩어리가 너무 길어요. 2000자 안으로 줄여주세요.`); return; }
    const key = window.localStorage.getItem(KEY);
    if (key === null) { setState("failed"); setMsg("오제로 아이디가 있어야 시험 데이터를 만들 수 있어요. 먼저 측정하고 아이디를 받아주세요."); return; }

    setState("busy");
    try {
      // 1) 판 깔기 — o999 청소 + 프로필·여정·시작점 설문
      const init = await fetch("/api/dev/seed", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ozero-key": key },
        body: JSON.stringify({ mode: "custom-init", days }),
      });
      const initData = (await init.json()) as { secret?: string; error?: string };
      if (!init.ok || initData.secret === undefined) { setState("failed"); setMsg(initData.error ?? "만들지 못했어요."); return; }

      // 2) 하루씩 심기 — 거울이 그 날 기록을 가르는 동안 진행을 보여준다
      for (let i = 0; i < blocks.length; i++) {
        setMsg(`${i + 1}/${blocks.length}일차 심는 중 — 거울이 사실과 망상을 가르고 있어요.`);
        // 덩어리 끝의 "답: ..." 줄은 그날 질문에 남긴 답으로 저장
        let answer = "";
        const kept = blocks[i].split("\n").filter((line) => {
          const t = line.trim();
          if (t.startsWith("답:")) { answer = t.slice(2).trim(); return false; }
          return true;
        });
        const text = kept.join("\n").trim();
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          const res = await fetch("/api/dev/seed", {
            method: "POST",
            headers: { "content-type": "application/json", "x-ozero-key": initData.secret },
            body: JSON.stringify({ mode: "custom-day", dayNo: i + 1, text, answer }),
          });
          ok = res.ok;
        }
        if (!ok) { setState("failed"); setMsg(`${i + 1}일차를 심지 못했어요. 버튼을 다시 눌러주세요 (처음부터 다시 심어요).`); return; }
      }

      becomeTest(initData.secret);
      setState("done");
      const missing = days - blocks.length;
      setMsg(
        `내 기록 ${blocks.length}일치가 준비됐어요. 지금 당신은 시험 관찰자 o999예요.` +
        (missing > 0 ? ` 나머지 ${missing}일은 기록 없는 날로 남아요.` : "")
      );
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

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "36px 0 6px" }}>내가 쓴 기록으로 심기</h2>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
        하루치를 한 덩어리로 쓰고, 날 사이는 빈 줄 한 줄로 나눠주세요. 맨 위 덩어리가 1일차예요.
        덩어리 끝에 &ldquo;답: ...&rdquo; 한 줄을 넣으면 그날 질문에 남긴 답으로 저장돼요.
        거울이 하루씩 사실과 망상을 갈라 심어서 시간이 조금 걸려요.
      </p>
      <textarea
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        rows={12}
        placeholder={"회의에서 팀장이 내 말을 끊었다. 또 무시당했다.\n답: 가슴이 조였다.\n\n(빈 줄)\n\n둘째 날 기록..."}
        style={{
          width: "100%", marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid #d9d2c4",
          background: "transparent", color: "var(--ink)", fontSize: 14, lineHeight: 1.7,
          textAlign: "left", fontFamily: "var(--font-sub)", resize: "vertical", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <button type="button" className="btn" disabled={state === "busy" || customText.trim() === ""} onClick={() => seedCustom(3)}>
          이 기록으로 3일치 심기
        </button>
        <button type="button" className="btn" disabled={state === "busy" || customText.trim() === ""} onClick={() => seedCustom(21)}>
          이 기록으로 21일치 심기
        </button>
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
