// 동료 존재감 (블럭 9 · S11) — 오늘 제출을 마친 사람에게만, 같은 날짜의 [제출 인원 N + 익명 공유 답변 1개].
// 절대 규칙: 제출 전엔 어떤 경로로도 남의 콘텐츠를 보여주지 않는다 (서버가 제출 여부를 먼저 확인).
// 공유 답변은 사용자가 그 답변 하나에만 건별로 켠 것만 (지시서 6번 — 일괄 공개 없음).
import { serviceStore } from "../../../../lib/db";
import { loopWindow } from "../../../../lib/course";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  const pr = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=record_hour,timezone`, {
    headers: store.headers, cache: "no-store",
  });
  const profiles = pr.ok ? ((await pr.json()) as { record_hour: number; timezone: string }[]) : [];
  if (profiles.length === 0) return Response.json({ error: "not-found" }, { status: 404 });
  const { entryDate } = loopWindow(new Date(), profiles[0].timezone, profiles[0].record_hour);

  // 문지기: 오늘 제출을 마쳤는가
  const mine = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&entry_date=eq.${entryDate}&submitted_at=not.is.null&select=id&limit=1`,
    { headers: store.headers, cache: "no-store" }
  );
  if (!(mine.ok && ((await mine.json()) as unknown[]).length > 0)) {
    return Response.json({ eligible: false });
  }

  // 같은 날짜 제출 인원 (본인 포함)
  const cr = await fetch(
    `${store.url}/rest/v1/daily_entries?entry_date=eq.${entryDate}&submitted_at=not.is.null&deleted_at=is.null&select=id`,
    { headers: { ...store.headers, prefer: "count=exact", range: "0-0" }, cache: "no-store" }
  );
  const range = cr.headers.get("content-range") ?? "/0";
  const count = parseInt(range.split("/")[1] ?? "0", 10) || 0;

  // 익명 공유 답변 1개 — 같은 날짜, 본인 제외, 건별 공개 켠 것만
  const sr = await fetch(
    `${store.url}/rest/v1/daily_entries?entry_date=eq.${entryDate}&answer_shared=eq.true&answer_text=not.is.null&user_id=neq.${secret}&deleted_at=is.null&select=answer_text&limit=20`,
    { headers: store.headers, cache: "no-store" }
  );
  const shared = sr.ok ? ((await sr.json()) as { answer_text: string }[]) : [];
  const pick = shared.length > 0 ? shared[Math.floor(Math.random() * shared.length)].answer_text : null;

  return Response.json({ eligible: true, count, shared: pick });
}
