// 내 거울 불러오기 (스텝 3-0). 브라우저의 비밀 열쇠(x-ozero-key = user_id)로만 조회.
// 오직 그 신원의 데이터만 돌려준다 — 데이터 격리(절대 원칙 6)는 신원 컬럼(user_id)으로 잠근다.
import { serviceStore } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  const secret = req.headers.get("x-ozero-key") ?? "";
  // user_id 는 UUID. 형식이 아니면 조회 자체를 안 한다 (엉뚱한 필터 방지)
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) {
    return Response.json({ error: "no-key" }, { status: 401 });
  }

  const pr = await fetch(
    `${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=observer_code,record_hour,timezone,email,email_verified_at`,
    { headers: store.headers, cache: "no-store" }
  );
  const profiles = pr.ok ? ((await pr.json()) as { observer_code: string; record_hour: number; timezone: string; email: string | null; email_verified_at: string | null }[]) : [];
  if (profiles.length === 0) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const profile = profiles[0];

  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&deleted_at=is.null&order=created_at.desc&select=entry_date,free_text,user_split,ai_split,question_text`,
    { headers: store.headers, cache: "no-store" }
  );
  const entries = er.ok ? await er.json() : [];

  return Response.json({
    observerCode: profile.observer_code,
    recordHour: profile.record_hour,
    timezone: profile.timezone,
    email: profile.email_verified_at !== null ? profile.email : null,
    entries,
  });
}
