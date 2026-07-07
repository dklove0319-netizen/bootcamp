// 관리자 대시보드 (블럭 7 · A01) — 운영자 1인 전용. 열람만, 수정·삭제 없음.
// 암호(.env ADMIN_KEY)가 맞아야 데이터가 열린다. 틀리면 "찾을 수 없는 페이지" — 존재 자체를 안 알린다.
"use client";
import { useEffect, useState } from "react";

type UserRow = {
  code: string; createdAt: string; recordHour: number;
  course: string | null; courseStatus: string | null; startDate: string | null;
  entryCount: number; lastEntry: string | null;
};
type Metrics = {
  dropoffByDay: { key: number; count: number }[];
  stalledByStep: { key: number; count: number }[];
  answerLenByDay: { key: number; avg: number }[];
  refunds: { total: number; refunded: number } | null;
};
type Split = { src: string; label: string; reason?: string | null };
type Entry = {
  entry_date: string; day_no: number | null; submitted_at: string | null; last_step: number | null;
  score_mood: number | null; score_emotion: number | null; score_energy: number | null; score_sleep: number | null;
  emotion_label: string | null; free_text: string | null;
  user_split: Split[] | null; ai_split: Split[] | null;
  delusion_emotion_links: { delusion: string; emotion: string }[] | null;
  question_text: string | null; question_quote_date: string | null; question_quote_text: string | null;
  answer_text: string | null; action_text: string | null; action_result: string | null;
};
type Detail = {
  profile: { observer_code: string; record_hour: number; timezone: string; created_at: string };
  journeys: { course: string; status: string; start_date: string | null }[];
  entries: Entry[];
  assessments: { phase: string; total_score: number; created_at: string }[];
};

const KEY = "ozero_admin_key";
const LABEL: Record<string, string> = { fact: "사실", delusion: "망상", unclear: "유보", na: "해당 없음", facts: "사실 칸", feelings: "느낌 칸", actions: "행동 칸" };

export default function Admin() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<"locked" | "loading" | "failed" | "ready">("locked");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "failed">("idle");

  function load(key: string) {
    setState("loading");
    fetch("/api/admin", { headers: { "x-admin-key": key } })
      .then(async (r) => {
        if (r.status === 404) { setState("locked"); try { window.localStorage.removeItem(KEY); } catch {} return; }
        if (!r.ok) { setState("failed"); return; }
        const d = (await r.json()) as { users: UserRow[]; metrics: Metrics };
        setUsers(d.users);
        setMetrics(d.metrics);
        setState("ready");
        try { window.localStorage.setItem(KEY, key); } catch {}
      })
      .catch(() => setState("failed"));
  }

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(KEY); } catch { saved = null; }
    if (saved !== null && saved !== "") load(saved);
  }, []);

  function openUser(code: string) {
    const key = window.localStorage.getItem(KEY) ?? "";
    setDetailState("loading");
    setDetail(null);
    fetch(`/api/admin/user?code=${code}`, { headers: { "x-admin-key": key } })
      .then(async (r) => {
        if (!r.ok) { setDetailState("failed"); return; }
        setDetail((await r.json()) as Detail);
        setDetailState("idle");
      })
      .catch(() => setDetailState("failed"));
  }

  // 암호가 없거나 틀림 — 존재를 안 알리는 화면 (A01 예외: 권한 없음 = 404 처리)
  if (state === "locked") {
    return (
      <main>
        <p style={{ marginTop: "30dvh", fontSize: 16 }}>찾을 수 없는 페이지예요.</p>
        <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center" }}>
          <input type="password" value={input} onChange={(e) => setInput(e.target.value)}
            style={{ padding: 10, border: "1px solid #e3d9c8", borderRadius: 8, background: "#fffdf8", color: "var(--ink)", textAlign: "left", fontSize: 14 }} />
          <button type="button" onClick={() => { if (input.trim() !== "") load(input.trim()); }}
            style={{ padding: "10px 14px", border: "1px solid #d9d2c4", borderRadius: 8, background: "transparent", color: "var(--muted)", cursor: "pointer" }}>
            열기
          </button>
        </div>
      </main>
    );
  }

  if (state === "loading") return <main><p className="muted" style={{ marginTop: "20dvh" }}>불러오는 중.</p></main>;
  if (state === "failed") {
    return (
      <main>
        <p style={{ marginTop: "20dvh" }}>불러오지 못했어요.</p>
        <button type="button" className="btn" style={{ marginTop: 16 }} onClick={() => load(window.localStorage.getItem(KEY) ?? "")}>다시 시도</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "32px 0 4px" }}>관리자</h1>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>열람 전용 — 기록의 주인은 사용자예요. 수정·삭제 없음.</p>

      {metrics !== null && (
        <div style={{ marginTop: 20, fontSize: 13, textAlign: "left", lineHeight: 1.9 }} className="muted">
          <p style={{ margin: 0 }}>일차별 제출: {metrics.dropoffByDay.map((d) => `${d.key}일 ${d.count}`).join(" · ") || "아직 없어요"}</p>
          <p style={{ margin: 0 }}>미제출이 멈춘 단계: {metrics.stalledByStep.map((d) => `${d.key}단계 ${d.count}`).join(" · ") || "없음"}</p>
          <p style={{ margin: 0 }}>답변 평균 길이(자): {metrics.answerLenByDay.map((d) => `${d.key}일 ${d.avg}`).join(" · ") || "아직 없어요"}</p>
          <p style={{ margin: 0 }}>결제·환불: {metrics.refunds === null ? "payments 표 대기" : `${metrics.refunds.total}건 중 환불 ${metrics.refunds.refunded}건`}</p>
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "26px 0 8px" }}>관찰자 {users.length}명</h2>
      {users.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>등록된 관찰자가 없어요.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr>
                {["코드", "코스", "시작일", "기록", "최근 기록", "가입일"].map((h) => (
                  <th key={h} style={{ padding: "4px 8px", borderBottom: "1px solid #e3d9c8", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.code} onClick={() => openUser(u.code)} style={{ cursor: "pointer" }}>
                  <td style={{ padding: "4px 8px", textDecoration: "underline" }}>{u.code}</td>
                  <td style={{ padding: "4px 8px" }}>{u.course ?? "-"}{u.courseStatus !== null && u.courseStatus !== "active" ? ` (${u.courseStatus})` : ""}</td>
                  <td style={{ padding: "4px 8px" }}>{u.startDate ?? "-"}</td>
                  <td style={{ padding: "4px 8px" }}>{u.entryCount}</td>
                  <td style={{ padding: "4px 8px" }}>{u.lastEntry ?? "-"}</td>
                  <td style={{ padding: "4px 8px" }}>{u.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailState === "loading" && <p className="muted" style={{ marginTop: 20, fontSize: 14 }}>불러오는 중.</p>}
      {detailState === "failed" && <p style={{ marginTop: 20, fontSize: 14 }}>불러오지 못했어요. 코드를 다시 눌러주세요.</p>}

      {detail !== null && (
        <div style={{ marginTop: 28, textAlign: "left", borderTop: "1px solid #e3d9c8", paddingTop: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{detail.profile.observer_code}</h2>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
            배달 {detail.profile.record_hour}시 · {detail.profile.timezone} · 가입 {detail.profile.created_at.slice(0, 10)}
            {detail.assessments.length > 0 && <> · WHO-5 {detail.assessments.map((a) => `${a.phase} ${a.total_score}점`).join(" / ")}</>}
            {detail.journeys.length > 0 && <> · 여정 {detail.journeys.map((j) => `${j.course}(${j.status})`).join(", ")}</>}
          </p>

          {detail.entries.length === 0 && <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>기록이 없어요.</p>}
          {detail.entries.map((e, i) => (
            <div key={i} style={{ marginTop: 20, paddingBottom: 14, borderBottom: "1px dashed #e3d9c8", fontSize: 14, lineHeight: 1.8 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {e.entry_date}{e.day_no !== null ? ` · ${e.day_no}일차` : ""} · {e.submitted_at !== null ? "제출됨" : `미제출 (단계 ${e.last_step ?? 0})`}
              </p>
              {(e.score_mood !== null || e.emotion_label !== null) && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  기분 {e.score_mood ?? "-"} · {e.emotion_label ?? "감정"} {e.score_emotion ?? "-"} · 체력 {e.score_energy ?? "-"} · 수면 {e.score_sleep ?? "-"}
                </p>
              )}
              {e.free_text !== null && <p style={{ margin: "8px 0 0", whiteSpace: "pre-line" }}>{e.free_text}</p>}

              {Array.isArray(e.ai_split) && e.ai_split.length > 0 && (
                <div style={{ margin: "8px 0 0" }}>
                  {e.ai_split.map((c, j) => {
                    const mine = Array.isArray(e.user_split) ? e.user_split.find((u) => u.src === c.src) : undefined;
                    return (
                      <p key={j} className="muted" style={{ margin: 0, fontSize: 13 }}>
                        “{c.src}” — 거울: {LABEL[c.label] ?? c.label}
                        {mine !== undefined && mine.label !== c.label ? ` / 본인: ${LABEL[mine.label] ?? mine.label}` : ""}
                        {typeof c.reason === "string" && c.reason !== "" ? ` — ${c.reason}` : ""}
                      </p>
                    );
                  })}
                </div>
              )}
              {Array.isArray(e.delusion_emotion_links) && e.delusion_emotion_links.length > 0 && (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  연결: {e.delusion_emotion_links.map((l) => `“${l.delusion}” — ${l.emotion}`).join(" · ")}
                </p>
              )}
              {e.question_text !== null && (
                <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                  <span className="muted">질문{e.question_quote_date !== null ? ` (인용 ${e.question_quote_date}: “${e.question_quote_text}”)` : ""}:</span> {e.question_text}
                </p>
              )}
              {e.answer_text !== null && <p style={{ margin: "4px 0 0", fontSize: 13 }}><span className="muted">답:</span> {e.answer_text}</p>}
              {e.action_text !== null && (
                <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                  <span className="muted">행동:</span> {e.action_text}{e.action_result !== null ? ` (${e.action_result === "done" ? "했음" : e.action_result === "partial" ? "일부" : "안 했음"})` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
