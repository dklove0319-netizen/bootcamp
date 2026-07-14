// 하루 루프 창구 (블럭 4·5 · 명세: S01~S11)
// GET: 오늘의 상태 — 게이팅(서버 판단), 어제의 회수, 오늘 진행 위치, 격자, 중간 거울 노출 여부
// POST: 단계 저장 — opening/scales/record/split/links/answer/action (수정 불가 원칙: 제출 후 잠금)
import { serviceStore, type Store } from "../../../lib/db";
import { loopWindow, dayNoOf, courseLength, detectCrisis } from "../../../lib/course";

export const runtime = "nodejs";

type Journey = { id: number; course: string; start_date: string | null; status: string };
type Entry = Record<string, unknown> & { entry_date: string; day_no: number };

async function findObserver(store: Store, secret: string) {
  const r = await fetch(
    `${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=observer_code,record_hour,timezone`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = r.ok ? ((await r.json()) as { observer_code: string; record_hour: number; timezone: string }[]) : [];
  return rows.length > 0 ? rows[0] : null;
}

async function activeJourney(store: Store, secret: string): Promise<Journey | null> {
  const r = await fetch(
    `${store.url}/rest/v1/journeys?user_id=eq.${secret}&status=eq.active&select=id,course,start_date,status&order=created_at.desc&limit=1`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = r.ok ? ((await r.json()) as Journey[]) : [];
  return rows.length > 0 ? rows[0] : null;
}

/** 어제(가장 최근 과거) 기록에서 회수할 인용 한 문장 — 서버가 고르고 원문 일치는 자명(원문에서 자름) */
function pickQuote(text: string): string {
  const pieces = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);
  if (pieces.length === 0) return text.slice(0, 80);
  // 가장 긴 조각 하나 (무게가 실린 문장일 확률이 높다 — 판단이 아니라 길이 기준)
  return pieces.reduce((a, b) => (b.length > a.length ? b : a)).slice(0, 120);
}

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  const profile = await findObserver(store, secret);
  if (profile === null) return Response.json({ error: "not-found" }, { status: 404 });

  const journey = await activeJourney(store, secret);
  const { entryDate } = loopWindow(new Date(), profile.timezone, profile.record_hour);
  const startDate = journey?.start_date ?? entryDate; // 여정 없으면 오늘이 1일차가 된다
  const course = journey?.course ?? "trial3";
  const dayNo = Math.max(1, dayNoOf(entryDate, startDate));
  const len = courseLength(course);

  // 내 기록 전부 (격자 + 어제 회수 + 오늘 상태를 한 번에 — N+1 금지)
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&order=entry_date.desc&limit=40&select=entry_date,day_no,free_text,user_split,ai_split,score_mood,score_emotion,score_energy,score_sleep,emotion_label,delusion_emotion_links,question_text,question_quote_date,answer_text,action_text,action_reminder,action_result,crisis_detected,last_step,submitted_at`,
    { headers: store.headers, cache: "no-store" }
  );
  const entries = er.ok ? ((await er.json()) as Entry[]) : [];
  const today = entries.find((e) => e.entry_date === entryDate) ?? null;
  const past = entries.filter((e) => e.entry_date < entryDate);
  const yesterday = past.length > 0 ? past[0] : null;

  // 시작점 설문(day0) 여부
  const ar = await fetch(
    `${store.url}/rest/v1/assessments?user_id=eq.${secret}&phase=eq.day0&select=id&limit=1`,
    { headers: store.headers, cache: "no-store" }
  );
  const needsDay0 = !(ar.ok && ((await ar.json()) as unknown[]).length > 0);

  // 21(또는 3)일 격자 — 기록한 날만 채움, 빠진 날 강조 금지
  const grid = Array.from({ length: len }, (_, i) => {
    const date = new Date(Date.parse(startDate) + i * 86400000).toISOString().slice(0, 10);
    const e = entries.find((x) => x.entry_date === date);
    return { dayNo: i + 1, date, submitted: e !== null && e !== undefined && e.submitted_at !== null };
  });

  return Response.json({
    observerCode: profile.observer_code,
    recordHour: profile.record_hour,
    timezone: profile.timezone,
    course,
    courseLength: len,
    hasJourney: journey !== null,
    startDate,
    entryDate,
    dayNo,
    beyondCourse: dayNo > len,
    needsDay0,
    today: today === null ? null : {
      lastStep: (today.last_step as number) ?? 0,
      submitted: today.submitted_at !== null,
      freeText: today.free_text ?? null,
      userSplit: today.user_split ?? null,
      aiSplit: today.ai_split ?? null,
      scores: {
        mood: today.score_mood ?? null,
        emotion: today.score_emotion ?? null,
        energy: today.score_energy ?? null,
        sleep: today.score_sleep ?? null,
        emotionLabel: today.emotion_label ?? null,
      },
      links: today.delusion_emotion_links ?? null,
      question: today.question_text ?? null,
      answer: today.answer_text ?? null,
      action: today.action_text ?? null,
      crisis: today.crisis_detected === true,
    },
    yesterday: yesterday === null ? null : {
      date: yesterday.entry_date,
      quote: typeof yesterday.free_text === "string" && yesterday.free_text !== "" ? pickQuote(yesterday.free_text as string) : null,
      actionText: yesterday.action_text ?? null,
      actionResult: yesterday.action_result ?? null,
    },
    mid: { seven: dayNo >= 7, fourteen: dayNo >= 14, report: dayNo >= 21 && course === "mirror21" },
    grid,
  });
}

const STEP_NO: Record<string, number> = {
  opening: 1, scales: 2, record: 3, close: 4, split: 5, links: 7, answer: 9, action: 10,
};

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  const profile = await findObserver(store, secret);
  if (profile === null) return Response.json({ error: "not-found" }, { status: 404 });

  let body: { step?: string; data?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const step = body.step ?? "";
  const data = body.data ?? {};
  if (!(step in STEP_NO)) return Response.json({ error: "bad-request" }, { status: 400 });

  let journey = await activeJourney(store, secret);
  const { entryDate } = loopWindow(new Date(), profile.timezone, profile.record_hour);

  // 여정이 없으면 첫 기록과 함께 trial3 시작 (1일차 = 첫 기록일)
  if (journey === null) {
    const cr = await fetch(`${store.url}/rest/v1/journeys`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=representation" },
      body: JSON.stringify({ user_id: secret, course: "trial3", start_date: entryDate, status: "active" }),
    });
    const created = cr.ok ? ((await cr.json()) as Journey[]) : [];
    journey = created.length > 0 ? created[0] : null;
    if (journey === null) return Response.json({ error: "failed" }, { status: 502 });
  }
  // 결제 직후 여정은 start_date 가 비어 있다 — 1일차 = 첫 기록 제출일 (지금)
  if (journey.start_date === null) {
    await fetch(`${store.url}/rest/v1/journeys?id=eq.${journey.id}`, {
      method: "PATCH",
      headers: { ...store.headers, prefer: "return=minimal" },
      body: JSON.stringify({ start_date: entryDate }),
    });
    journey.start_date = entryDate;
  }
  const startDate = journey.start_date ?? entryDate;
  const dayNo = Math.max(1, dayNoOf(entryDate, startDate));
  if (dayNo > courseLength(journey.course)) {
    return Response.json({ error: "course-done" }, { status: 409 });
  }

  // 제출된 날은 수정 완전 불가 (오프닝의 어제 행동 회수는 예외 — 어제 행이 대상이므로)
  const tr = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${entryDate}&select=submitted_at`,
    { headers: store.headers, cache: "no-store" }
  );
  const todayRows = tr.ok ? ((await tr.json()) as { submitted_at: string | null }[]) : [];
  if (step !== "opening" && todayRows.length > 0 && todayRows[0].submitted_at !== null) {
    return Response.json({ error: "locked" }, { status: 409 });
  }

  const patch: Record<string, unknown> = {
    user_id: secret,
    journey_id: journey.id,
    entry_date: entryDate,
    day_no: dayNo,
    last_step: STEP_NO[step],
    updated_at: new Date().toISOString(),
  };
  let crisis = false;

  if (step === "opening") {
    // 어제 행의 행동 실행 여부 저장 (어제 기록이 있을 때만)
    const result = typeof data.actionResult === "string" ? data.actionResult : "";
    if (["done", "partial", "skipped"].includes(result)) {
      await fetch(
        `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=lt.${entryDate}&order=entry_date.desc&limit=1`,
        { headers: store.headers, cache: "no-store" }
      ).then(async (r) => {
        const rows = r.ok ? ((await r.json()) as { entry_date: string }[]) : [];
        if (rows.length > 0) {
          await fetch(`${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${rows[0].entry_date}`, {
            method: "PATCH",
            headers: { ...store.headers, prefer: "return=minimal" },
            body: JSON.stringify({ action_result: result }),
          });
        }
      });
    }
  } else if (step === "scales") {
    patch.score_mood = data.mood;
    patch.score_emotion = data.emotion;
    patch.score_energy = data.energy;
    patch.score_sleep = data.sleep;
    patch.emotion_label = data.emotionLabel;
  } else if (step === "record") {
    const text = typeof data.freeText === "string" ? data.freeText.trim() : "";
    if (text === "") return Response.json({ error: "empty" }, { status: 400 });
    crisis = detectCrisis(text);
    patch.free_text = text;
    patch.crisis_detected = crisis;
  } else if (step === "close") {
    // 조기 닫기 (S-1) — 감정이 높은 날 "여기까지 남기고 닫기". 기록이 있어야 하고, 닫으면 제출과 같은 잠금.
    const cr = await fetch(
      `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${entryDate}&select=free_text`,
      { headers: store.headers, cache: "no-store" }
    );
    const rows = cr.ok ? ((await cr.json()) as { free_text: string | null }[]) : [];
    if (rows.length === 0 || typeof rows[0].free_text !== "string" || rows[0].free_text === "") {
      return Response.json({ error: "empty" }, { status: 400 });
    }
    patch.submitted_at = new Date().toISOString(); // 관찰만 하고 닫음 — 제출로 집계, 이후 수정 불가
  } else if (step === "split") {
    patch.user_split = Array.isArray(data.userSplit) ? data.userSplit : [];
  } else if (step === "links") {
    patch.delusion_emotion_links = Array.isArray(data.links) ? data.links : [];
  } else if (step === "answer") {
    const answer = typeof data.answer === "string" ? data.answer.trim() : "";
    if (answer === "") return Response.json({ error: "empty" }, { status: 400 });
    patch.answer_text = answer;
    patch.answer_shared = data.shared === true;
    if (data.shared === true) {
      patch.answer_share_consented_at = new Date().toISOString();
      patch.answer_share_version = "v1";
    }
  } else if (step === "action") {
    const action = typeof data.action === "string" ? data.action.trim() : "";
    if (action === "") return Response.json({ error: "empty" }, { status: 400 });
    patch.action_text = action;
    patch.action_reminder = data.reminder === true;
    patch.submitted_at = new Date().toISOString(); // 오늘 루프 종료 — 이후 수정 불가
  }

  const ur = await fetch(`${store.url}/rest/v1/daily_entries?on_conflict=user_id,entry_date`, {
    method: "POST",
    headers: { ...store.headers, prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!ur.ok) return Response.json({ error: "failed" }, { status: 502 });

  // 이탈 측정 로그 (지시서 7번) — 실패해도 루프를 막지 않는다
  fetch(`${store.url}/rest/v1/step_events`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ user_id: secret, entry_date: entryDate, day_no: dayNo, step: STEP_NO[step], event: "submit" }),
  }).catch(() => {});

  return Response.json({ saved: true, crisis, dayNo });
}
