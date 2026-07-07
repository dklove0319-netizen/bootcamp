// 오늘의 거울 저장 — 이미 오제로 아이디가 있는 기기용 (스텝 3-0b)
// 하는 일: 비밀 열쇠(x-ozero-key)로 신원 확인 → 오늘 날짜의 기록을 저장(하루 1건, 다시 오면 갱신).
// 이게 있어야 "내일 돌아온다"는 약속이 기존 사용자에게도 지켜진다 — 안 그러면 둘째 날부터 기록이 증발한다.
import { serviceStore, today } from "../../../../lib/db";

export const runtime = "nodejs";

type Split = { src: string; label: string };
type Body = {
  freeText?: string;
  userSplit?: Split[];
  aiSplit?: Split[];
  question?: string | null;
  answer?: string | null;
};

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const freeText = typeof body.freeText === "string" ? body.freeText.trim() : "";
  if (freeText === "") {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  // 신원 확인 (지어낸 열쇠 차단)
  const pr = await fetch(
    `${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=user_id`,
    { headers: store.headers, cache: "no-store" }
  );
  const profiles = pr.ok ? ((await pr.json()) as unknown[]) : [];
  if (profiles.length === 0) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  // 여정 찾기(없으면 trial3 시작) — day_no 는 여정 시작일 기준 1부터
  let journeyId: number | null = null;
  let startDate = today();
  const jr = await fetch(
    `${store.url}/rest/v1/journeys?user_id=eq.${secret}&status=eq.active&select=id,start_date&order=created_at.desc&limit=1`,
    { headers: store.headers, cache: "no-store" }
  );
  const journeys = jr.ok ? ((await jr.json()) as { id: number; start_date: string | null }[]) : [];
  if (journeys.length > 0) {
    journeyId = journeys[0].id;
    startDate = journeys[0].start_date ?? today();
  } else {
    const cr = await fetch(`${store.url}/rest/v1/journeys`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=representation" },
      body: JSON.stringify({ user_id: secret, course: "trial3", start_date: today(), status: "active" }),
    });
    const created = cr.ok ? ((await cr.json()) as { id: number }[]) : [];
    journeyId = created.length > 0 ? created[0].id : null;
  }
  if (journeyId === null) {
    return Response.json({ error: "failed" }, { status: 502 });
  }

  const dayNo = Math.max(
    1,
    Math.floor((Date.parse(today()) - Date.parse(startDate)) / 86400000) + 1
  );

  // 오늘 기록 저장 — 같은 날 다시 오면 덮어쓴다 (unique user_id+entry_date)
  const r = await fetch(`${store.url}/rest/v1/daily_entries?on_conflict=user_id,entry_date`, {
    method: "POST",
    headers: { ...store.headers, prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: secret,
      journey_id: journeyId,
      entry_date: today(),
      day_no: dayNo,
      free_text: freeText,
      user_split: Array.isArray(body.userSplit) ? body.userSplit : null,
      ai_split: Array.isArray(body.aiSplit) ? body.aiSplit : null,
      question_text: typeof body.question === "string" ? body.question : null,
      answer_text: typeof body.answer === "string" && body.answer.trim() !== "" ? body.answer.trim() : null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    return Response.json({ error: "failed" }, { status: 502 });
  }
  return Response.json({ saved: true, dayNo });
}
