// 21일 보고서 (S13 — 7개 구성). 원문 인용 중심, 평가·축하 문구 0. 첫 진입 시 21일째 재설문(S16) 먼저.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { WHO5, WHO5_SCALE } from "../../lib/course";

type Report = {
  needsDay21?: boolean;
  recordedDays?: number; missingDays?: number;
  scales?: { dayNo: number; date: string; mood: number; emotion: number; energy: number; sleep: number; emotionLabel: string | null }[];
  emotionCounts?: { label: string; count: number }[];
  topWords?: { word: string; count: number }[];
  repeatedDelusions?: { src: string; days: number }[];
  moodDays?: {
    low: { dayNo: number; date: string; score: number; text: string } | null;
    high: { dayNo: number; date: string; score: number; text: string } | null;
  };
  answers?: { dayNo: number; date: string | null; answer: string | null }[];
  links?: { delusion: string; emotion: string }[];
  who5?: { day0: number | null; day21: number };
  selfWords?: {
    day0: { date: string; texts: string[] } | null;
    day21: { date: string; texts: string[] } | null;
  };
  returnedWays?: { date: string; src: string }[];
  actionStats?: { from: number; to: number; done: number; partial: number; skipped: number }[];
  finalQuestion?: {
    quoteDate: string | null; quoteSrc: string | null; question: string;
    reflection?: string | null; evidence?: { date: string; src: string }[];
  };
};

// 눈금 점 그래프 — 가로 = 1~21일, 세로 = 0~10. 기록 없는 날은 빈 자리(선도 끊김). 점 위 숫자 = 그날 점수.
function Sparkline({ label, values, len, note }: { label: string; values: (number | null)[]; len: number; note?: string }) {
  const W = 340, H = 80, padX = 8, padY = 12;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / Math.max(1, len - 1);
  const y = (v: number) => H - padY - (v * (H - 2 * padY)) / 10;
  // 이어진 구간만 선으로 (빈 날에서 끊는다)
  const segs: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) segs.push("M" + cur.join(" L"));
      cur = [];
    } else {
      cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
  });
  if (cur.length > 1) segs.push("M" + cur.join(" L"));
  return (
    <div style={{ marginTop: 14 }}>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 2px", textAlign: "left" }}>{label}</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img" aria-label={label}>
        <line x1={padX} y1={y(0)} x2={W - padX} y2={y(0)} stroke="#e3d9c8" strokeWidth="1" />
        <line x1={padX} y1={y(5)} x2={W - padX} y2={y(5)} stroke="#efe8db" strokeWidth="1" />
        <line x1={padX} y1={y(10)} x2={W - padX} y2={y(10)} stroke="#efe8db" strokeWidth="1" />
        {segs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#b7a68d" strokeWidth="1.2" />
        ))}
        {values.map((v, i) =>
          v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2.6" fill="var(--ink)" />
        )}
        {values.map((v, i) =>
          v === null ? null : (
            <text key={"t" + i} x={x(i)} y={y(v) - 5} textAnchor="middle" fontSize="8" fill="#8a7f6d">{v}</text>
          )
        )}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", padding: `0 ${padX}px` }}>
        {[1, 7, 14, len].map((d) => (
          <span key={d} className="muted" style={{ fontSize: 10 }}>{d}</span>
        ))}
      </div>
      {note !== undefined && note !== "" && (
        <p className="muted" style={{ fontSize: 11, margin: "2px 0 0", textAlign: "left" }}>{note}</p>
      )}
    </div>
  );
}

function ozeroKey(): string | null {
  try { return window.localStorage.getItem("ozero_key"); } catch { return null; }
}

export default function ReportPage() {
  const m = useMessages();
  const [state, setState] = useState<"loading" | "nokey" | "nojourney" | "day21" | "failed" | "ready">("loading");
  const [report, setReport] = useState<Report | null>(null);
  const [who5, setWho5] = useState<(number | null)[]>([null, null, null, null, null]);
  const [selfChanged, setSelfChanged] = useState("");
  const [selfNow, setSelfNow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    const key = ozeroKey();
    if (key === null) { setState("nokey"); return; }
    setState("loading");
    fetch("/api/report", { headers: { "x-ozero-key": key } })
      .then(async (r) => {
        if (r.status === 404) { setState("nojourney"); return; }
        if (!r.ok) { setState("failed"); return; }
        const data = (await r.json()) as Report;
        if (data.needsDay21 === true) { setState("day21"); return; }
        setReport(data);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }
  useEffect(load, []);

  if (state === "loading") return <main><p className="muted" style={{ marginTop: "20dvh" }}>{m.me.loading}</p></main>;
  if (state === "nokey" || state === "nojourney") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{state === "nokey" ? m.me.none : m.report.noJourney}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.save.toMe}</Link>
        </div>
      </main>
    );
  }
  if (state === "failed") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.failed}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}>
          <button type="button" className="btn" onClick={load}>{m.report.retry}</button>
        </div>
      </main>
    );
  }

  // 21일째 재설문 (S16 — 보고서 열기 직전 1회) + 자기 문답 2문항 (시작점의 문장과 나란히 놓을 재료)
  if (state === "day21") {
    const filled = who5.every((v) => v !== null) && selfChanged.trim() !== "" && selfNow.trim() !== "";
    return (
      <main>
        <p style={{ marginTop: 32, fontSize: 16, lineHeight: 1.8 }}>{m.report.day21Intro}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 20 }}>
          {WHO5.map((q, i) => (
            <div key={i}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{q}</p>
              <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
                {WHO5_SCALE.map((label, v) => (
                  <button key={v} type="button" title={label} onClick={() => setWho5((p) => p.map((x, j) => (j === i ? v : x)))}
                    style={{
                      padding: "5px 9px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                      border: "1px solid " + (who5[i] === v ? "var(--ink)" : "#d9d2c4"),
                      background: who5[i] === v ? "var(--ink)" : "transparent",
                      color: who5[i] === v ? "var(--bg)" : "var(--muted)",
                    }}>{v}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
          {[
            { q: m.report.day21Q1, v: selfChanged, set: setSelfChanged },
            { q: m.report.day21Q2, v: selfNow, set: setSelfNow },
          ].map((f, i) => (
            <div key={i}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>{f.q}</p>
              <textarea value={f.v} onChange={(e) => f.set(e.target.value)} rows={3} maxLength={2000}
                style={{ width: "100%", marginTop: 6, padding: 10, fontSize: 15, lineHeight: 1.7, border: "1px solid #d9d2c4", borderRadius: 8, background: "transparent", color: "var(--ink)", resize: "vertical" }} />
            </div>
          ))}
        </div>
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "10px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={!filled || busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const key = ozeroKey();
              const res = await fetch("/api/assess", {
                method: "POST",
                headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
                body: JSON.stringify({ phase: "day21", who5, self: [selfChanged.trim(), selfNow.trim()] }),
              });
              if (!res.ok) { setError(m.loop.saveFailed); return; }
              load();
            } catch { setError(m.loop.saveFailed); } finally { setBusy(false); }
          }}>{m.loop.day0Submit}</button>
        </div>
      </main>
    );
  }

  const r = report;
  if (r === null) return null;
  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "36px 0 4px" }}>{m.report.title}</h1>

      <p style={{ marginTop: 18, fontSize: 16 }}>
        {m.report.recorded.replace("{n}", String(r.recordedDays ?? 0)).replace("{miss}", String(r.missingDays ?? 0))}
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 4px" }}>{m.report.scalesTitle}</h2>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 4px" }}>{m.report.scalesHelp}</p>
      {(() => {
        const LEN = 21;
        const arr = (pick: (s: NonNullable<Report["scales"]>[number]) => number) => {
          const out: (number | null)[] = Array.from({ length: LEN }, () => null);
          for (const sc of r.scales ?? []) {
            if (sc.dayNo >= 1 && sc.dayNo <= LEN) out[sc.dayNo - 1] = pick(sc);
          }
          return out;
        };
        // 그래프 아래 한 줄 — 평균 · 가장 높음 · 가장 낮음 (같은 점수가 여러 날이면 첫날 + 외 n일)
        const stats = (vals: (number | null)[]) => {
          const pts = vals.map((v, i) => ({ v, d: i + 1 })).filter((p): p is { v: number; d: number } => p.v !== null);
          if (pts.length === 0) return "";
          const avg = (pts.reduce((s, p) => s + p.v, 0) / pts.length).toFixed(1);
          const fmt = (target: number) => {
            const ds = pts.filter((p) => p.v === target).map((p) => p.d);
            const more = ds.length > 1 ? m.report.statMore.replace("{n}", String(ds.length - 1)) : "";
            return m.report.statDay.replace("{v}", String(target)).replace("{d}", String(ds[0])).replace("{more}", more);
          };
          const hv = Math.max(...pts.map((p) => p.v));
          const lv = Math.min(...pts.map((p) => p.v));
          return `${m.report.statAvg} ${avg} · ${m.report.statHigh} ${fmt(hv)} · ${m.report.statLow} ${fmt(lv)}`;
        };
        const mood = arr((sc) => sc.mood);
        const emotion = arr((sc) => sc.emotion);
        const energy = arr((sc) => sc.energy);
        const sleep = arr((sc) => sc.sleep);
        return (
          <>
            <Sparkline label={m.loop.scaleMoodShort} values={mood} len={LEN} note={stats(mood)} />
            <Sparkline label={m.loop.scaleEmotionShort} values={emotion} len={LEN} note={stats(emotion)} />
            <Sparkline label={m.loop.scaleEnergyShort} values={energy} len={LEN} note={stats(energy)} />
            <Sparkline label={m.loop.scaleSleepShort} values={sleep} len={LEN} note={stats(sleep)} />
          </>
        );
      })()}

      {(() => {
        // 눈금 대조 — 숫자는 그날의 기록과 나란히 놓을 때만 읽힌다 (사용자 지시 2026-07-08)
        const lowD = r.moodDays?.low ?? null;
        const highD = r.moodDays?.high ?? null;
        if (lowD === null && highD === null) return null;
        return (
          <div style={{ marginTop: 18 }}>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 10px" }}>{m.report.scaleDaysHelp}</p>
            {[{ d: lowD, t: m.report.scaleLowDay }, { d: highD, t: m.report.scaleHighDay }].map((x, i) =>
              x.d === null ? null : (
                <div key={i} style={{ marginBottom: 12 }}>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    {m.report.scaleDayLine.replace("{t}", x.t).replace("{d}", String(x.d.dayNo)).replace("{date}", x.d.date).replace("{v}", String(x.d.score))}
                  </p>
                  <p style={{ fontSize: 15, lineHeight: 1.7, margin: "3px 0 0" }}>“{x.d.text}”</p>
                </div>
              )
            )}
          </div>
        );
      })()}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 4px" }}>{m.report.emotionTitle}</h2>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 6px" }}>{m.report.emotionHelp}</p>
      <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0 }}>
        {(r.emotionCounts ?? []).map((e) => `${e.label} ${e.count}`).join(" · ") || m.report.none}
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 4px" }}>{m.report.repeatsTitle}</h2>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 8px" }}>{m.report.repeatsHelp}</p>
      {(r.repeatedDelusions ?? []).length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>{m.report.repeatsNone}</p>
      ) : (
        <div>
          {(r.repeatedDelusions ?? []).map((d, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 1.8, margin: "4px 0" }}>
              “{d.src}” <span className="muted" style={{ fontSize: 13 }}>— {m.report.repeatsDays.replace("{n}", String(d.days))}</span>
            </p>
          ))}
        </div>
      )}

      {(r.returnedWays ?? []).length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 4px" }}>{m.report.returnsTitle}</h2>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 8px" }}>{m.report.returnsHelp}</p>
          <div>
            {(r.returnedWays ?? []).map((w, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>{w.date}</p>
                <p style={{ fontSize: 15, lineHeight: 1.7, margin: "3px 0 0" }}>“{w.src}”</p>
              </div>
            ))}
          </div>
        </>
      )}

      {(() => {
        const stats = r.actionStats ?? [];
        const total = stats.reduce((s, w) => s + w.done + w.partial + w.skipped, 0);
        if (total === 0) return null;
        return (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 4px" }}>{m.report.actionTitle}</h2>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 8px" }}>{m.report.actionHelp}</p>
            {stats.map((w, i) => (
              <p key={i} style={{ fontSize: 14, lineHeight: 1.8, margin: "2px 0" }}>
                <span className="muted">{m.report.actionWeek.replace("{a}", String(w.from)).replace("{b}", String(w.to))}</span>
                {" — "}
                {m.report.actionCounts.replace("{d}", String(w.done)).replace("{p}", String(w.partial)).replace("{s}", String(w.skipped))}
              </p>
            ))}
          </>
        );
      })()}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 8px" }}>{m.report.answersTitle}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {(r.answers ?? []).map((a) => (
          <div key={a.dayNo}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{a.dayNo}{m.report.daysuffix} {a.date ?? ""}</p>
            <p style={{ fontSize: 15, lineHeight: 1.7, margin: "3px 0 0" }}>{a.answer ?? m.report.noRecordDay}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 8px" }}>{m.report.linksTitle}</h2>
      {(r.links ?? []).length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>{m.report.none}</p>
      ) : (
        <div>
          {(r.links ?? []).map((l, i) => (
            <p key={i} className="muted" style={{ fontSize: 14, margin: "4px 0", lineHeight: 1.7 }}>“{l.delusion}” — {l.emotion}</p>
          ))}
        </div>
      )}

      {r.selfWords?.day21 !== null && r.selfWords?.day21 !== undefined && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 4px" }}>{m.report.selfTitle}</h2>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 10px" }}>{m.report.selfHelp}</p>
          <div style={{ marginBottom: 12 }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{m.report.selfStart}{r.selfWords.day0 !== null ? ` · ${r.selfWords.day0.date}` : ""}</p>
            {r.selfWords.day0 === null ? (
              <p className="muted" style={{ fontSize: 14, margin: "3px 0 0" }}>{m.report.selfNoStart}</p>
            ) : (
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: "3px 0 0" }}>“{r.selfWords.day0.texts[0]}”</p>
            )}
          </div>
          <div>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{m.report.selfEnd} · {r.selfWords.day21.date}</p>
            {[m.report.day21Q1, m.report.day21Q2].map((q, i) =>
              r.selfWords?.day21?.texts[i] === undefined ? null : (
                <div key={i} style={{ marginTop: i === 0 ? 3 : 10 }}>
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>{q}</p>
                  <p style={{ fontSize: 15, lineHeight: 1.7, margin: "3px 0 0" }}>“{r.selfWords.day21.texts[i]}”</p>
                </div>
              )
            )}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "28px 0 8px" }}>{m.report.who5Title}</h2>
      <p style={{ fontSize: 15 }}>
        {m.report.who5Line.replace("{d0}", r.who5?.day0 === null || r.who5?.day0 === undefined ? "-" : String(r.who5.day0)).replace("{d21}", String(r.who5?.day21 ?? "-"))}
      </p>

      {r.finalQuestion !== undefined && (
        <div style={{ marginTop: 30, paddingTop: 18, borderTop: "1px solid #e3d9c8" }}>
          {(r.finalQuestion.evidence ?? []).map((e, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{e.date}</p>
              <p style={{ fontSize: 15, lineHeight: 1.7, margin: "3px 0 0" }}>“{e.src}”</p>
            </div>
          ))}
          {typeof r.finalQuestion.reflection === "string" && r.finalQuestion.reflection !== "" && (
            <p style={{ fontSize: 17, lineHeight: 1.9, fontWeight: 600, margin: "14px 0 0" }}>{r.finalQuestion.reflection}</p>
          )}
          {r.finalQuestion.quoteSrc !== null && (r.finalQuestion.evidence ?? []).length === 0 && (
            <>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{r.finalQuestion.quoteDate}</p>
              <p style={{ fontSize: 16, lineHeight: 1.7, margin: "4px 0 0" }}>“{r.finalQuestion.quoteSrc}”</p>
            </>
          )}
          <p style={{ fontSize: 17, lineHeight: 1.8, margin: "14px 0 0" }}>{r.finalQuestion.question}</p>
        </div>
      )}

      <div style={{ marginTop: 30, paddingTop: 18, borderTop: "1px solid #e3d9c8" }}>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
          {m.report.nextDoor1}
          <br />
          {m.report.nextDoor2}
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: "10px 0 0" }}>{m.report.nextDoor3}</p>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 26, paddingBottom: 16 }}>
        <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.save.toMe}</Link>
      </div>
    </main>
  );
}
