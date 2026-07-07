// 하루 10단계 루프 (블럭 4 · S02~S11) — 오프닝 회수 → 눈금 → 기록 → 구별 → 거울 대조 → 감정 연결 → 질문·답 → 행동 → 완료
// 원칙: 게이팅은 서버가, 구별은 사용자가 먼저, 채점 없음, 위기여도 루프는 멈추지 않음(조용한 한 줄), 제출 후 수정 불가.
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../lib/i18n";
import { EMOTIONS, WHO5, WHO5_SCALE } from "../../lib/course";
import { formatHour, clientLocale } from "../../lib/time";

type TodayState = {
  observerCode: string; recordHour: number; course: string; courseLength: number;
  entryDate: string; dayNo: number; beyondCourse: boolean; needsDay0: boolean;
  today: null | {
    lastStep: number; submitted: boolean; freeText: string | null;
    userSplit: { src: string; label: string }[] | null;
    scores: { mood: number | null; emotion: number | null; energy: number | null; sleep: number | null; emotionLabel: string | null };
    question: string | null; answer: string | null; crisis: boolean;
  };
  yesterday: null | { date: string; quote: string | null; actionText: string | null; actionResult: string | null };
  mid: { seven: boolean; fourteen: boolean; report: boolean };
};
type MirrorItem = { src: string; user: string; mirror: string; reason: string | null };

function ozeroKey(): string | null {
  try { return window.localStorage.getItem("ozero_key"); } catch { return null; }
}

/** S06 기계 조각내기 — 문장 끝·줄바꿈 경계 (판단 없는 문법 기준) */
function splitFragments(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

const boxStyle: React.CSSProperties = {
  width: "100%", padding: 12, background: "#fffdf8", color: "var(--ink)",
  border: "1px solid #e3d9c8", borderRadius: 8, fontSize: 16, fontFamily: "inherit", lineHeight: 1.6, resize: "vertical",
};

function Dots({ value, onPick }: { value: number | null; onPick: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
      {Array.from({ length: 11 }, (_, i) => (
        <button key={i} type="button" onClick={() => onPick(i)}
          style={{
            width: 26, height: 26, borderRadius: 999, fontSize: 11, cursor: "pointer",
            border: "1px solid " + (value === i ? "var(--ink)" : "#d9d2c4"),
            background: value === i ? "var(--ink)" : "transparent",
            color: value === i ? "var(--bg)" : "var(--muted)",
          }}>{i}</button>
      ))}
    </div>
  );
}

export default function Today() {
  const m = useMessages();
  const loc = clientLocale();
  const [state, setState] = useState<"loading" | "nokey" | "failed" | "ready">("loading");
  const [t, setT] = useState<TodayState | null>(null);
  const [step, setStep] = useState<number>(0); // 0=산정 전
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [crisis, setCrisis] = useState(false);
  const [crisisClosed, setCrisisClosed] = useState(false);

  // 단계별 입력 상태
  const [who5, setWho5] = useState<(number | null)[]>([null, null, null, null, null]);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [emo, setEmo] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [emotionLabel, setEmotionLabel] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [fragments, setFragments] = useState<string[]>([]);
  const [labels, setLabels] = useState<(string | null)[]>([]);
  const [contrast, setContrast] = useState<MirrorItem[] | null>(null);
  const [links, setLinks] = useState<{ delusion: string; emotion: string }[]>([]);
  const [pickedDelusion, setPickedDelusion] = useState<string | null>(null);
  const [question, setQuestion] = useState<{ question: string; quoteDate: string | null; quoteSrc: string | null } | null>(null);
  const [answer, setAnswer] = useState("");
  const [shared, setShared] = useState(false);
  const [action, setAction] = useState("");
  const [reminder, setReminder] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  useEffect(() => {
    const key = ozeroKey();
    if (key === null) { setState("nokey"); return; }
    fetch("/api/today", { headers: { "x-ozero-key": key } })
      .then(async (r) => {
        if (!r.ok) { setState(r.status === 401 || r.status === 404 ? "nokey" : "failed"); return; }
        const data = (await r.json()) as TodayState;
        setT(data);
        setCrisis(data.today?.crisis === true);
        if (data.today?.freeText != null) setFreeText(data.today.freeText);
        // 이어가기: last_step 다음 단계부터 (S01 — 중간 재접속)
        const last = data.today?.lastStep ?? 0;
        const order = [1, 2, 3, 5, 6, 7, 9, 10];
        const next = data.today?.submitted === true ? 11 : (order.find((s) => s > last) ?? 11);
        setStep(next);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, []);

  async function post(stepName: string, data: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setError("");
    try {
      const key = ozeroKey();
      const res = await fetch("/api/today", {
        method: "POST",
        headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
        body: JSON.stringify({ step: stepName, data }),
      });
      const out = (await res.json()) as { saved?: boolean; crisis?: boolean; error?: string };
      if (!res.ok || out.saved !== true) { setError(m.loop.saveFailed); return false; }
      if (out.crisis === true) setCrisis(true);
      return true;
    } catch {
      setError(m.loop.saveFailed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <main><p className="muted" style={{ marginTop: "20dvh" }}>{m.me.loading}</p></main>;
  if (state === "nokey") {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.none}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}><Link href="/measure" className="btn">{m.me.toMeasure}</Link></div>
      </main>
    );
  }
  if (state === "failed" || t === null) {
    return (
      <main>
        <p style={{ marginTop: "20dvh", fontSize: 16 }}>{m.me.failed}</p>
        <div style={{ marginTop: "auto", paddingBottom: 16 }}><Link href="/" className="muted" style={{ textDecoration: "underline" }}>{m.me.backHome}</Link></div>
      </main>
    );
  }

  const crisisLine = crisis && !crisisClosed && (
    <div style={{ position: "sticky", bottom: 0, padding: "10px 0", background: "var(--bg)", borderTop: "1px solid #e3d9c8", display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
      <a href="tel:109" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "underline" }}>{m.loop.crisisLine}</a>
      <button type="button" onClick={() => setCrisisClosed(true)} aria-label="닫기"
        style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14 }}>×</button>
    </div>
  );

  const header = (
    <p className="muted" style={{ margin: "28px 0 0", fontSize: 13 }}>
      {m.loop.dayHeader.replace("{n}", String(t.dayNo)).replace("{len}", String(t.courseLength))}
    </p>
  );

  // 코스 기간 종료
  if (t.beyondCourse) {
    return (
      <main>
        {header}
        <p style={{ marginTop: 24, fontSize: 16, lineHeight: 1.8 }}>{t.course === "mirror21" ? m.loop.courseDone21 : m.loop.courseDone3}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {t.course === "mirror21" ? (
            <Link href="/report" className="btn">{m.loop.toReport}</Link>
          ) : (
            <Link href="/course" className="btn">{m.me.courseTitle}</Link>
          )}
          <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.save.toMe}</Link>
        </div>
      </main>
    );
  }

  // S16 시작점 (생애 첫 기록 직전 1회)
  if (t.needsDay0) {
    const filled = who5.every((v) => v !== null);
    return (
      <main>
        <p style={{ marginTop: 32, fontSize: 16, lineHeight: 1.8 }}>{m.loop.day0Intro}</p>
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>{m.loop.day0Scale}</p>
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
        <p className="muted" style={{ fontSize: 11, margin: "14px 0 0" }}>{m.loop.who5Note}</p>
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "10px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={!filled || busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const key = ozeroKey();
              const res = await fetch("/api/assess", {
                method: "POST",
                headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
                body: JSON.stringify({ phase: "day0", who5 }),
              });
              if (!res.ok) { setError(m.loop.saveFailed); return; }
              setT({ ...t, needsDay0: false });
            } catch { setError(m.loop.saveFailed); } finally { setBusy(false); }
          }}>{m.loop.day0Submit}</button>
        </div>
      </main>
    );
  }

  // 완료 상태 (오늘 제출됨)
  if (step >= 11) {
    return (
      <main>
        {header}
        <p style={{ marginTop: 24, fontSize: 17, lineHeight: 1.8 }}>{m.loop.doneToday}</p>
        <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
          {m.loop.nextOpens.replace("{t}", formatHour(t.recordHour, loc))}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          <Link href="/me" className="muted" style={{ textDecoration: "underline" }}>{m.save.toMe}</Link>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 1. 오프닝 — 어제의 회수 (S02)
  if (step === 1) {
    const y = t.yesterday;
    return (
      <main>
        {header}
        {y === null || y.quote === null ? (
          <p style={{ marginTop: 26, fontSize: 16, lineHeight: 1.8 }}>{t.dayNo === 1 ? m.loop.firstDay : m.loop.noYesterday}</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 26, fontSize: 13 }}>{m.loop.yesterdayWrote.replace("{d}", y.date)}</p>
            <p style={{ marginTop: 8, fontSize: 17, lineHeight: 1.8 }}>“{y.quote}”</p>
            {y.actionText !== null && y.actionResult === null && (
              <>
                <p className="muted" style={{ marginTop: 22, fontSize: 13 }}>{m.loop.yesterdayAction} — “{y.actionText}”</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                  {([["done", m.loop.did], ["partial", m.loop.partly], ["skipped", m.loop.didnt]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setActionResult(v)}
                      style={{
                        padding: "6px 16px", borderRadius: 999, fontSize: 14, cursor: "pointer", fontFamily: "var(--font-main)",
                        border: "1px solid " + (actionResult === v ? "var(--ink)" : "#d9d2c4"),
                        background: actionResult === v ? "var(--ink)" : "transparent",
                        color: actionResult === v ? "var(--bg)" : "var(--muted)",
                      }}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            if (await post("opening", actionResult !== null ? { actionResult } : {})) setStep(2);
          }}>{m.loop.next}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 2. 오늘의 눈금 (S03)
  if (step === 2) {
    const ready = mood !== null && emo !== null && energy !== null && sleep !== null && emotionLabel !== null;
    return (
      <main>
        {header}
        {t.dayNo === 1 && <p className="muted" style={{ marginTop: 20, fontSize: 13, lineHeight: 1.7 }}>{m.loop.scalesIntro}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
          <div><p style={{ margin: 0, fontSize: 15 }}>{m.loop.scaleMood}</p><Dots value={mood} onPick={setMood} /></div>
          <div>
            <p style={{ margin: 0, fontSize: 15 }}>{m.loop.scaleEmotion}</p>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
              {EMOTIONS.map((e) => (
                <button key={e} type="button" onClick={() => setEmotionLabel(e)}
                  style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                    border: "1px solid " + (emotionLabel === e ? "var(--ink)" : "#d9d2c4"),
                    background: emotionLabel === e ? "var(--ink)" : "transparent",
                    color: emotionLabel === e ? "var(--bg)" : "var(--muted)",
                  }}>{e}</button>
              ))}
            </div>
            <Dots value={emo} onPick={setEmo} />
          </div>
          <div><p style={{ margin: 0, fontSize: 15 }}>{m.loop.scaleEnergy}</p><Dots value={energy} onPick={setEnergy} /></div>
          <div><p style={{ margin: 0, fontSize: 15 }}>{m.loop.scaleSleep}</p><Dots value={sleep} onPick={setSleep} /></div>
        </div>
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 20, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            if (!ready) { setError(m.loop.scalesIncomplete); return; }
            if (await post("scales", { mood, emotion: emo, energy, sleep, emotionLabel })) setStep(3);
          }}>{m.loop.next}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 3. 자유 기록 (S04)
  if (step === 3) {
    return (
      <main>
        {header}
        <div className="muted" style={{ marginTop: 20, lineHeight: 1.8, whiteSpace: "pre-line" }}>
          <p style={{ margin: 0 }}>{m.measure.guide1}</p>
          <p style={{ margin: "12px 0 0" }}>{m.measure.guide2}</p>
          <p style={{ margin: "12px 0 0" }}>{m.measure.guide3}</p>
          <p style={{ margin: "12px 0 0" }}>{m.loop.privacyLine}</p>
        </div>
        <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={10} style={{ ...boxStyle, marginTop: 14 }} />
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "10px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 16, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            if (freeText.trim() === "") { setError(m.measure.empty); return; }
            if (await post("record", { freeText: freeText.trim() })) {
              const frags = splitFragments(freeText.trim());
              setFragments(frags);
              setLabels(frags.map(() => null));
              setStep(5);
            }
          }}>{m.loop.next}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 5. 사실·망상 구별 (S06) — 사용자가 먼저
  if (step === 5) {
    if (fragments.length === 0 && t.today?.freeText != null) {
      const frags = splitFragments(t.today.freeText);
      setFragments(frags);
      setLabels(frags.map(() => null));
    }
    const taggedCount = labels.filter((l) => l === "fact" || l === "delusion").length;
    return (
      <main>
        {header}
        <p style={{ marginTop: 20, fontSize: 15, lineHeight: 1.7 }}>{m.loop.splitGuide}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
          {fragments.map((frag, i) => (
            <div key={i}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>“{frag}”</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                {([["fact", m.measure.fact], ["delusion", m.measure.delusion], ["na", m.loop.notApplicable]] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setLabels((p) => p.map((x, j) => (j === i ? v : x)))}
                    style={{
                      padding: "5px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                      border: "1px solid " + (labels[i] === v ? "var(--ink)" : "#d9d2c4"),
                      background: labels[i] === v ? "var(--ink)" : "transparent",
                      color: labels[i] === v ? "var(--bg)" : "var(--muted)",
                    }}>{label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 18, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            if (taggedCount === 0) { setError(m.loop.tagAtLeastOne); return; }
            const userSplit = fragments.map((f, i) => ({ src: f, label: labels[i] ?? "na" }));
            if (!(await post("split", { userSplit }))) return;
            // AI 대조 (S07) — 실패해도 루프는 이어진다
            setBusy(true);
            try {
              const key = ozeroKey();
              const res = await fetch("/api/today/contrast", {
                method: "POST",
                headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
                body: JSON.stringify({ fragments: userSplit.filter((f) => f.label === "fact" || f.label === "delusion") }),
              });
              const data = (await res.json()) as { items?: MirrorItem[] };
              setContrast(res.ok && Array.isArray(data.items) ? data.items : null);
            } catch { setContrast(null); } finally { setBusy(false); }
            setStep(6);
          }}>{busy ? m.measure.loading : m.loop.toMirror}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 6. 거울 대조 (S07)
  if (step === 6) {
    return (
      <main>
        {header}
        <p style={{ marginTop: 20, fontSize: 15 }}>{m.loop.contrastGuide}</p>
        {contrast === null ? (
          <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>{m.loop.contrastFailed}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
            {contrast.map((c, i) => {
              const differ = c.mirror !== c.user;
              return (
                <div key={i}>
                  <p style={{ margin: 0, fontSize: 15 }}>“{c.src}”</p>
                  <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>
                    {m.measure.youLabel}: {c.user === "fact" ? m.measure.fact : m.measure.delusion}
                    {" · "}
                    <span style={{ fontWeight: differ ? 600 : 400, color: differ ? "var(--ink)" : undefined }}>
                      {m.measure.mirrorLabel}: {c.mirror === "fact" ? m.measure.fact : c.mirror === "delusion" ? m.measure.delusion : m.measure.unclear}
                    </span>
                  </p>
                  {c.reason !== null && <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.7 }}>{c.reason}</p>}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 18, paddingBottom: 16 }}>
          <button type="button" className="btn" onClick={() => {
            const myDelusions = fragments.filter((_, i) => labels[i] === "delusion");
            setStep(myDelusions.length === 0 ? 9 : 7); // 망상 0개면 감정 연결 건너뜀 (S08)
          }}>{m.loop.next}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 7. 망상·감정 연결 (S08) — 잇는 사람은 사용자
  if (step === 7) {
    const myDelusions = fragments.filter((_, i) => labels[i] === "delusion");
    const targets = [
      `${m.loop.scaleMoodShort} ${mood ?? t.today?.scores.mood ?? "-"}`,
      `${emotionLabel ?? t.today?.scores.emotionLabel ?? m.loop.scaleEmotionShort} ${emo ?? t.today?.scores.emotion ?? "-"}`,
      `${m.loop.scaleEnergyShort} ${energy ?? t.today?.scores.energy ?? "-"}`,
      `${m.loop.scaleSleepShort} ${sleep ?? t.today?.scores.sleep ?? "-"}`,
    ];
    return (
      <main>
        {header}
        <p style={{ marginTop: 20, fontSize: 15, lineHeight: 1.7 }}>{m.loop.linksGuide}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {myDelusions.map((d, i) => (
            <button key={i} type="button" onClick={() => setPickedDelusion(pickedDelusion === d ? null : d)}
              style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 14, cursor: "pointer", textAlign: "left",
                border: "1px solid " + (pickedDelusion === d ? "var(--ink)" : "#d9d2c4"),
                background: "transparent", color: "var(--ink)", fontFamily: "inherit",
              }}>“{d}”</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
          {targets.map((label) => (
            <button key={label} type="button" disabled={pickedDelusion === null} onClick={() => {
              if (pickedDelusion !== null) {
                setLinks((p) => [...p, { delusion: pickedDelusion, emotion: label }]);
                setPickedDelusion(null);
              }
            }}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                border: "1px solid #d9d2c4", background: "transparent",
                color: pickedDelusion === null ? "#c9c2b4" : "var(--muted)",
              }}>{label}</button>
          ))}
        </div>
        {links.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {links.map((l, i) => (
              <p key={i} className="muted" style={{ fontSize: 13, margin: "4px 0", cursor: "pointer" }}
                onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}>
                “{l.delusion}” — {l.emotion} ×
              </p>
            ))}
          </div>
        )}
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 18, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            if (await post("links", { links })) setStep(9);
          }}>{m.loop.next}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 8·9. 오늘의 질문 + 답변 (S09)
  if (step === 9) {
    if (question === null && !busy) {
      setBusy(true);
      const key = ozeroKey();
      fetch("/api/today/question", { method: "POST", headers: { ...(key !== null ? { "x-ozero-key": key } : {}) } })
        .then((r) => r.json())
        .then((d: { question?: string; quoteDate?: string | null; quoteSrc?: string | null }) => {
          setQuestion({ question: d.question ?? m.loop.fallbackQuestion, quoteDate: d.quoteDate ?? null, quoteSrc: d.quoteSrc ?? null });
        })
        .catch(() => setQuestion({ question: m.loop.fallbackQuestion, quoteDate: null, quoteSrc: null }))
        .finally(() => setBusy(false));
    }
    return (
      <main>
        {header}
        {question === null ? (
          <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>{m.loop.questionLoading}</p>
        ) : (
          <>
            {question.quoteSrc !== null && (
              <>
                <p className="muted" style={{ marginTop: 22, fontSize: 13 }}>{m.loop.quotePrefix.replace("{d}", question.quoteDate ?? "")}</p>
                <p style={{ marginTop: 6, fontSize: 16, lineHeight: 1.7 }}>“{question.quoteSrc}”</p>
              </>
            )}
            <p style={{ marginTop: 18, fontSize: 17, lineHeight: 1.8 }}>{question.question}</p>
            <p className="muted" style={{ margin: "16px 0 6px", fontSize: 13 }}>{m.measure.answerLabel}</p>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} style={boxStyle} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, cursor: "pointer", justifyContent: "center" }}>
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              <span className="muted" style={{ fontSize: 13 }}>{m.loop.shareToggle}</span>
            </label>
          </>
        )}
        {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
        <div style={{ marginTop: "auto", paddingTop: 18, paddingBottom: 16 }}>
          <button type="button" className="btn" disabled={busy || question === null} onClick={async () => {
            if (answer.trim() === "") { setError(m.measure.empty); return; }
            if (await post("answer", { answer: answer.trim(), shared })) setStep(10);
          }}>{m.loop.next}</button>
        </div>
        {crisisLine}
      </main>
    );
  }

  // 10. 작은 행동 (S10)
  return (
    <main>
      {header}
      <p style={{ marginTop: 24, fontSize: 16 }}>{m.loop.actionGuide}</p>
      <input value={action} onChange={(e) => setAction(e.target.value)} style={{ ...boxStyle, marginTop: 12, textAlign: "left" }} />
      {suggestions === null ? (
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const key = ozeroKey();
            const res = await fetch("/api/today/suggest", {
              method: "POST",
              headers: { "content-type": "application/json", ...(key !== null ? { "x-ozero-key": key } : {}) },
              body: JSON.stringify({ freeText }),
            });
            const d = (await res.json()) as { suggestions?: string[] };
            setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []);
          } catch { setSuggestions([]); } finally { setBusy(false); }
        }}
          style={{ marginTop: 12, background: "none", border: "none", color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          {m.loop.suggestBtn}
        </button>
      ) : (
        suggestions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {suggestions.map((s, i) => (
              <p key={i} className="muted" style={{ fontSize: 13, margin: "4px 0", cursor: "pointer", textDecoration: "underline" }} onClick={() => setAction(s)}>{s}</p>
            ))}
          </div>
        )
      )}
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, cursor: "pointer", justifyContent: "center" }}>
        <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
        <span className="muted" style={{ fontSize: 13 }}>{m.loop.reminderToggle}</span>
      </label>
      {error !== "" && <p style={{ color: "#a05b3f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
      <div style={{ marginTop: "auto", paddingTop: 18, paddingBottom: 16 }}>
        <button type="button" className="btn" disabled={busy} onClick={async () => {
          if (action.trim() === "") { setError(m.loop.actionEmpty); return; }
          if (await post("action", { action: action.trim(), reminder })) setStep(11);
        }}>{m.loop.finish}</button>
      </div>
      {crisisLine}
    </main>
  );
}
