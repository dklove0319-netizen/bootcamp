// 관리자 대시보드 창구 (블럭 7 · 명세: docs/plan/screens/A01-관리자.md)
// 하는 일: 운영자 암호(x-admin-key = .env ADMIN_KEY)를 확인하고 [사용자 목록 + 이탈 지표 3종 + 환불 집계 자리]를 준다.
// 규칙: 열람만 (수정·삭제 없음 — 사용자 데이터의 주인은 사용자). 암호가 틀리면 404 (존재 자체를 안 알림).
// N+1 금지: 표 4개를 한 번씩만 읽고 코드에서 모은다.
import { serviceStore } from "../../../lib/db";
import { adminAuthed } from "../../../lib/admin";

export const runtime = "nodejs";

type Profile = { user_id: string; observer_code: string; record_hour: number; created_at: string };
type Journey = { user_id: string; course: string; status: string; start_date: string | null };
type EntryLite = { user_id: string; entry_date: string; day_no: number | null; submitted_at: string | null; last_step: number | null; answer_text: string | null };

export async function GET(req: Request): Promise<Response> {
  if (!adminAuthed(req)) return Response.json({ error: "not-found" }, { status: 404 });
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });

  const [pr, jr, er, payr] = await Promise.all([
    fetch(`${store.url}/rest/v1/profiles?deleted_at=is.null&select=user_id,observer_code,record_hour,created_at&order=observer_code.asc`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/journeys?select=user_id,course,status,start_date&order=id.desc`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/daily_entries?deleted_at=is.null&select=user_id,entry_date,day_no,submitted_at,last_step,answer_text`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/payments?select=status,refunded_at`, { headers: store.headers, cache: "no-store" }),
  ]);
  const profiles: Profile[] = pr.ok ? await pr.json() : [];
  const journeys: Journey[] = jr.ok ? await jr.json() : [];
  const entries: EntryLite[] = er.ok ? await er.json() : [];

  // 사용자별 최신 여정 (id 내림차순으로 읽었으니 처음 만난 게 최신)
  const journeyOf = new Map<string, Journey>();
  for (const j of journeys) if (!journeyOf.has(j.user_id)) journeyOf.set(j.user_id, j);

  const countOf = new Map<string, number>();
  const lastOf = new Map<string, string>();
  for (const e of entries) {
    countOf.set(e.user_id, (countOf.get(e.user_id) ?? 0) + 1);
    if ((lastOf.get(e.user_id) ?? "") < e.entry_date) lastOf.set(e.user_id, e.entry_date);
  }

  const users = profiles.map((p) => {
    const j = journeyOf.get(p.user_id) ?? null;
    return {
      code: p.observer_code,
      createdAt: p.created_at.slice(0, 10),
      recordHour: p.record_hour,
      course: j?.course ?? null,
      courseStatus: j?.status ?? null,
      startDate: j?.start_date ?? null,
      entryCount: countOf.get(p.user_id) ?? 0,
      lastEntry: lastOf.get(p.user_id) ?? null,
    };
  });

  // 이탈 지표 3종 (A01 4번): 일차별 제출 수 · 미제출의 단계별 멈춘 곳 · 답변 길이 추세
  const byDaySubmitted = new Map<number, number>();
  const byStepStalled = new Map<number, number>();
  const answerLen = new Map<number, { sum: number; n: number }>();
  for (const e of entries) {
    const d = e.day_no ?? 0;
    if (e.submitted_at !== null) byDaySubmitted.set(d, (byDaySubmitted.get(d) ?? 0) + 1);
    else byStepStalled.set(e.last_step ?? 0, (byStepStalled.get(e.last_step ?? 0) ?? 0) + 1);
    if (typeof e.answer_text === "string" && e.answer_text !== "") {
      const a = answerLen.get(d) ?? { sum: 0, n: 0 };
      a.sum += e.answer_text.length;
      a.n += 1;
      answerLen.set(d, a);
    }
  }
  const toSorted = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ key: k, count: v }));

  // 환불 집계 자리 (payments 표가 아직 없으면 null)
  let refunds: { total: number; refunded: number } | null = null;
  if (payr.ok) {
    const pays = (await payr.json()) as { refunded_at: string | null }[];
    refunds = { total: pays.length, refunded: pays.filter((x) => x.refunded_at !== null).length };
  }

  return Response.json({
    users,
    metrics: {
      dropoffByDay: toSorted(byDaySubmitted),
      stalledByStep: toSorted(byStepStalled),
      answerLenByDay: [...answerLen.entries()].sort((a, b) => a[0] - b[0]).map(([d, a]) => ({ key: d, avg: Math.round(a.sum / a.n) })),
      refunds,
    },
  });
}
