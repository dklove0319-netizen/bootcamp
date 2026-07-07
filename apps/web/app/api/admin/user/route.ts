// 관리자 — 사용자 한 명의 기록 전체 열람 (A01 3번: 전체 필드, 열람만)
// AI 출력(구별·이유·질문·반사 인용)까지 전부 daily_entries 에 구조화 저장돼 있으므로 그대로 돌려준다.
import { serviceStore } from "../../../../lib/db";
import { adminAuthed } from "../../../../lib/admin";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  if (!adminAuthed(req)) return Response.json({ error: "not-found" }, { status: 404 });
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });

  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^o\d{3,4}$/.test(code)) return Response.json({ error: "bad-code" }, { status: 400 });

  const pr = await fetch(
    `${store.url}/rest/v1/profiles?observer_code=eq.${code}&deleted_at=is.null&select=user_id,observer_code,record_hour,timezone,created_at`,
    { headers: store.headers, cache: "no-store" }
  );
  const profiles = pr.ok ? ((await pr.json()) as { user_id: string }[]) : [];
  if (profiles.length === 0) return Response.json({ error: "no-user" }, { status: 404 });
  const uid = profiles[0].user_id;

  const [jr, er, ar] = await Promise.all([
    fetch(`${store.url}/rest/v1/journeys?user_id=eq.${uid}&select=course,status,start_date&order=id.desc`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/daily_entries?user_id=eq.${uid}&deleted_at=is.null&select=*&order=entry_date.desc`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/assessments?user_id=eq.${uid}&select=phase,total_score,created_at&order=created_at.asc`, { headers: store.headers, cache: "no-store" }),
  ]);

  return Response.json({
    profile: profiles[0],
    journeys: jr.ok ? await jr.json() : [],
    entries: er.ok ? await er.json() : [],
    assessments: ar.ok ? await ar.json() : [],
  });
}
