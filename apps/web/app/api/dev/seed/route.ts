// 검증용 씨앗 창구 — 3일/21일치 시험 데이터를 시험 전용 관찰자(o999)에게 심는다.
// 목적: 21일을 기다리지 않고 사흘의 거울·중간 거울·보고서·결제 흐름을 실물로 검증 (시간 되감기).
// 보호: 등록된 관찰자의 비밀 열쇠가 있어야 호출 가능. o999 데이터만 만들고 지운다 — 다른 관찰자 데이터는 절대 건드리지 않는다.
// 공개 확장 전 제거 대상 (검증 도구 — plan.md 스코프컷).
import { randomUUID } from "node:crypto";
import { getAI } from "@vibe-kit/ai";
import { serviceStore, type Store } from "../../../../lib/db";
import { EMOTIONS, loopWindow, courseLength } from "../../../../lib/course";
import { MEASURE_MODEL } from "../../../../lib/ai-models";

export const runtime = "nodejs";

const SCENARIOS = [
  { text: "회의에서 팀장이 내 보고를 끊고 다음 안건으로 넘어갔다. 또 무시당했다. 가슴이 답답했다.", delusion: "또 무시당했다", answer: "가슴이 조이고 열이 올라왔다.", action: "내일 회의에서 발언 전에 숨 한 번 쉬기" },
  { text: "카톡 답장이 하루 종일 없었다. 나만 진심인 것 같다. 어깨에 힘이 들어갔다.", delusion: "나만 진심인 것 같다", answer: "기다리는 동안 손이 계속 휴대폰으로 갔다.", action: "답장 오기 전까지 휴대폰 뒤집어 두기" },
  { text: "엄마가 전화로 '너는 언제 철들래'라고 말했다. 역시 나는 부족한 사람이다. 목이 막혔다.", delusion: "역시 나는 부족한 사람이다", answer: "그 말을 듣고 배가 차가워졌다.", action: "전화 끊고 물 한 잔 마시기" },
  { text: "지하철을 놓쳤다. 오늘도 되는 일이 없다. 한숨이 나왔다.", delusion: "오늘도 되는 일이 없다", answer: "한숨이 나온 건 몸이 먼저였다.", action: "역까지 걸으며 보이는 것 세 개 세기" },
  { text: "친구가 약속을 미뤘다. 나를 만만하게 보는 게 분명하다. 얼굴이 화끈거렸다.", delusion: "나를 만만하게 보는 게 분명하다", answer: "화끈거림이 먼저였고 생각이 따라왔다.", action: "미룬 날짜를 달력에 적기" },
  { text: "상사가 '알아서 해'라고 말했다. 또 나한테만 떠넘긴다. 어금니를 물었다.", delusion: "또 나한테만 떠넘긴다", answer: "어금니를 물고 있는 걸 한참 뒤에 알았다.", action: "업무 범위를 한 줄로 적어 확인 요청하기" },
  { text: "거울을 보다가 나는 왜 이 모양인가 싶었다. 밥을 대충 먹었다.", delusion: "나는 왜 이 모양인가", answer: "그 생각 뒤에 밥맛이 없어졌다.", action: "내일 아침은 앉아서 먹기" },
];

// 직접 쓴 기록을 하루씩 심을 때 쓰는 판독 — 측정(/api/measure)과 같은 카메라 기준, 세 칸 없이 기록 전체를 가른다
const SEED_SPLIT_PROMPT = `당신은 "오제로의 거울"이에요. 위로하지 않는 목격자예요. 참가자의 하루 기록을 성분 단위로 나누세요.
판별 기준:
- 사실 = 카메라와 녹음기가 있었다면 찍히고 녹음되었을 것. 행동 / 따옴표 속 그대로의 말 / 숫자 / 몸의 반응 / 감정의 발생 보고("지겨움이 올라왔다").
- 망상 = 그 위에 마음이 붙인 모든 것 — 해석·평가어·추측·일반화·예측·인과 단정·의미 부여. 긍정도 카메라에 안 찍히면 똑같이 망상 (교정·경고 톤 금지, 건조하게 분류만).
- 감정의 경계: 발생의 보고만 사실. 현재형 감정 표현·감탄("짜증난다", "지겹다 진짜")은 망상.
- 확신이 없으면 unclear.
규칙:
- src 는 기록 원문의 조각을 한 글자도 바꾸지 말고 그대로 잘라 넣으세요. 기록 전체를 순서대로 빠짐없이 나누세요.
- question: 가장 선명한 망상 성분을 향해 되묻는 질문 딱 하나. "왜"로 시작 금지. 단정·범주명·무의식 언급 금지. 질문 뒤에 답의 후보 금지. 기록과 같은 언어로, 한국어면 ~이에요/~해요체.
다음 JSON 형식으로만 답하세요 (다른 텍스트 금지):
{"items":[{"src":"원문 조각","label":"fact"}],"question":"질문 하나"}`;

type SeedSplit = { items: { src: string; label: string }[]; question: string | null };

async function aiSplit(text: string): Promise<SeedSplit | null> {
  try {
    const res = await getAI().messages.create({
      model: MEASURE_MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: SEED_SPLIT_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    const block = res.content.find((c) => c.type === "text");
    const raw = block !== undefined && block.type === "text" ? block.text : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(jsonText) as { items?: { src?: string; label?: string }[]; question?: string };
    // 지어내기 방지: src 가 기록의 실제 조각이 아니면 버린다 (절대 규칙 2)
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter(
        (c) =>
          typeof c.src === "string" &&
          c.src.trim() !== "" &&
          text.includes(c.src.trim()) &&
          (c.label === "fact" || c.label === "delusion" || c.label === "unclear")
      )
      .map((c) => ({ src: (c.src as string).trim(), label: c.label as string }));
    if (items.length === 0) return null;
    const question = typeof parsed.question === "string" && parsed.question.trim() !== "" ? parsed.question.trim() : null;
    return { items, question };
  } catch {
    return null;
  }
}

function seededEntry(uid: string, journeyId: number, date: string, dayNo: number) {
  const s = SCENARIOS[(dayNo - 1) % SCENARIOS.length];
  const facts = s.text.split(". ")[0] + ".";
  return {
    user_id: uid,
    journey_id: journeyId,
    entry_date: date,
    day_no: dayNo,
    score_mood: 3 + ((dayNo * 7) % 5),
    score_emotion: 4 + ((dayNo * 3) % 5),
    score_energy: 3 + ((dayNo * 5) % 5),
    score_sleep: 4 + ((dayNo * 2) % 4),
    emotion_label: EMOTIONS[4 + (dayNo % 4)], // 불안·짜증/화·슬픔·부끄러움 순환
    free_text: s.text,
    user_split: [
      { src: facts, label: "fact" },
      { src: s.delusion, label: "delusion" },
    ],
    ai_split: [
      { src: facts, label: "fact" },
      { src: s.delusion, label: "delusion" },
    ],
    delusion_emotion_links: dayNo % 2 === 0 ? [{ delusion: s.delusion, emotion: EMOTIONS[4 + (dayNo % 4)] }] : [],
    question_text: "그 순간 몸에서 무엇이 올라왔나요",
    answer_text: s.answer,
    action_text: s.action,
    action_result: dayNo % 3 === 0 ? "skipped" : dayNo % 3 === 1 ? "done" : "partial",
    last_step: 10,
    submitted_at: new Date(Date.parse(date + "T21:30:00Z")).toISOString(),
  };
}

async function wipeByCode(store: Store, code: string): Promise<void> {
  const r = await fetch(`${store.url}/rest/v1/profiles?observer_code=eq.${code}&select=user_id`, {
    headers: store.headers, cache: "no-store",
  });
  const rows = r.ok ? ((await r.json()) as { user_id: string }[]) : [];
  for (const row of rows) {
    for (const table of ["daily_entries", "step_events", "assessments", "payments", "consents", "journeys", "profiles"]) {
      await fetch(`${store.url}/rest/v1/${table}?user_id=eq.${row.user_id}`, { method: "DELETE", headers: store.headers }).catch(() => {});
    }
  }
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });
  // 운영자(o000)·시험 관찰자(o999) 열쇠만 (검증 보고서 2026-07-08 개선 5 — 일반 관찰자의 시험 도구 접근 차단)
  const pr = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&select=user_id,observer_code`, {
    headers: store.headers, cache: "no-store",
  });
  const requester = pr.ok ? ((await pr.json()) as { observer_code: string }[]) : [];
  if (requester.length === 0) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  if (requester[0].observer_code !== "o000" && requester[0].observer_code !== "o999") {
    return Response.json({ error: "operator-only" }, { status: 403 });
  }

  let days = 3;
  let mode = "";
  let dayNo = 0;
  let text = "";
  let answer = "";
  try {
    const body = (await req.json()) as { days?: number; mode?: string; dayNo?: number; text?: string; answer?: string };
    days = body.days === 21 ? 21 : 3;
    mode = typeof body.mode === "string" ? body.mode : "";
    dayNo = typeof body.dayNo === "number" ? body.dayNo : 0;
    text = (body.text ?? "").trim();
    answer = (body.answer ?? "").trim();
  } catch {
    // 기본 3일
  }

  // ---- 직접 쓴 기록 하루 심기: 열쇠가 o999 본인일 때만 (다른 관찰자 데이터에 절대 닿지 않게) ----
  if (mode === "custom-day") {
    const cr = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&select=observer_code`, {
      headers: store.headers, cache: "no-store",
    });
    const codes = cr.ok ? ((await cr.json()) as { observer_code: string }[]) : [];
    if (codes.length === 0 || codes[0].observer_code !== "o999") {
      return Response.json({ error: "not-o999" }, { status: 403 });
    }
    const jr = await fetch(
      `${store.url}/rest/v1/journeys?user_id=eq.${secret}&status=eq.active&select=id,course,start_date&limit=1`,
      { headers: store.headers, cache: "no-store" }
    );
    const js = jr.ok ? ((await jr.json()) as { id: number; course: string; start_date: string }[]) : [];
    if (js.length === 0) return Response.json({ error: "no-journey" }, { status: 404 });
    const len = courseLength(js[0].course);
    if (dayNo < 1 || dayNo > len) return Response.json({ error: "bad-day" }, { status: 400 });
    if (text === "" || text.length > 2000) return Response.json({ error: "bad-text" }, { status: 400 });

    const split = await aiSplit(text);
    if (split === null) return Response.json({ error: "ai-failed" }, { status: 502 });

    const date = new Date(Date.parse(js[0].start_date) + (dayNo - 1) * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`${store.url}/rest/v1/daily_entries?on_conflict=user_id,entry_date`, {
      method: "POST",
      headers: { ...store.headers, prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: secret,
        journey_id: js[0].id,
        entry_date: date,
        day_no: dayNo,
        score_mood: 3 + ((dayNo * 7) % 5),
        score_emotion: 4 + ((dayNo * 3) % 5),
        score_energy: 3 + ((dayNo * 5) % 5),
        score_sleep: 4 + ((dayNo * 2) % 4),
        emotion_label: null, // 감정 이름은 지어내지 않는다 — 직접 심기에서는 비워둔다
        free_text: text,
        user_split: split.items,
        ai_split: split.items,
        delusion_emotion_links: [],
        question_text: split.question ?? "오늘의 기록에서 가장 오래 남는 문장은 무엇인가요.",
        answer_text: answer !== "" ? answer : null,
        action_text: null,
        last_step: 10,
        submitted_at: new Date(Date.parse(date + "T21:30:00Z")).toISOString(),
      }),
    });
    if (!res.ok) return Response.json({ error: "failed" }, { status: 502 });
    return Response.json({ ok: true, dayNo, date });
  }

  const custom = mode === "custom-init"; // 판만 깔고 (프로필·여정·설문) 기록은 하루씩 따로 받는다

  await wipeByCode(store, "o999"); // 이전 시험 데이터 청소

  const uid = randomUUID();
  await fetch(`${store.url}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ user_id: uid, observer_code: "o999", record_hour: 21, timezone: "Asia/Seoul" }),
  });

  // 마지막 날 = 지금 열려 있는 기록 창의 날짜 → 오늘이 정확히 {days}일차가 된다
  const { entryDate: lastDate } = loopWindow(new Date(), "Asia/Seoul", 21);
  const startDate = new Date(Date.parse(lastDate) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const course = days === 21 ? "mirror21" : "trial3";
  const jr = await fetch(`${store.url}/rest/v1/journeys`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=representation" },
    body: JSON.stringify({ user_id: uid, course, start_date: startDate, status: "active" }),
  });
  const journeys = jr.ok ? ((await jr.json()) as { id: number }[]) : [];
  if (journeys.length === 0) return Response.json({ error: "failed" }, { status: 502 });
  const journeyId = journeys[0].id;

  // 하루치씩 심기 (직접 쓰기 모드는 기록을 custom-day 호출로 따로 받는다)
  if (!custom) {
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.parse(startDate) + i * 86400000).toISOString().slice(0, 10);
      await fetch(`${store.url}/rest/v1/daily_entries`, {
        method: "POST",
        headers: { ...store.headers, prefer: "return=minimal" },
        body: JSON.stringify(seededEntry(uid, journeyId, date, i + 1)),
      });
    }
  }

  // 시작점 설문 (21일 검증에서 보고서의 "시작점/21일째 나란히"를 보려면 필요)
  await fetch(`${store.url}/rest/v1/assessments`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ user_id: uid, phase: "day0", instrument: "who5", answers: [3, 2, 3, 2, 3], total_score: 13 }),
  });

  // 21일이면 결제 원장도 (payments 표 있으면 — 환불 규칙 시험용)
  if (days === 21) {
    await fetch(`${store.url}/rest/v1/payments`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: uid, journey_id: journeyId, provider: "test_usd", currency: "USD",
        amount: 39, order_id: "seed-" + uid.slice(0, 8), payment_key: "seed", status: "TEST",
      }),
    }).catch(() => {});
  }

  return Response.json({ code: "o999", secret: uid, days, course });
}
