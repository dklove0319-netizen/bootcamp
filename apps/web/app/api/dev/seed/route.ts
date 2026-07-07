// 검증용 씨앗 창구 — 3일/21일치 시험 데이터를 시험 전용 관찰자(o999)에게 심는다.
// 목적: 21일을 기다리지 않고 사흘의 거울·중간 거울·보고서·결제 흐름을 실물로 검증 (시간 되감기).
// 보호: 등록된 관찰자의 비밀 열쇠가 있어야 호출 가능. o999 데이터만 만들고 지운다 — 다른 관찰자 데이터는 절대 건드리지 않는다.
// 공개 확장 전 제거 대상 (검증 도구 — plan.md 스코프컷).
import { randomUUID } from "node:crypto";
import { serviceStore, type Store } from "../../../../lib/db";
import { EMOTIONS, loopWindow } from "../../../../lib/course";

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
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });
  // 등록된 관찰자만 (지어낸 열쇠 차단)
  const pr = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&select=user_id`, {
    headers: store.headers, cache: "no-store",
  });
  if (!(pr.ok && ((await pr.json()) as unknown[]).length > 0)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  let days = 3;
  try {
    const body = (await req.json()) as { days?: number };
    days = body.days === 21 ? 21 : 3;
  } catch {
    // 기본 3일
  }

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

  // 하루치씩 심기
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.parse(startDate) + i * 86400000).toISOString().slice(0, 10);
    await fetch(`${store.url}/rest/v1/daily_entries`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=minimal" },
      body: JSON.stringify(seededEntry(uid, journeyId, date, i + 1)),
    });
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
