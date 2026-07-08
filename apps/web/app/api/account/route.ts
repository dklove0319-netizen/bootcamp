// 설정·동의·완전 삭제 창구 (3-2 + 3-4 · 명세: S15)
// GET: 설정 상태(기록 시각·연구 동의·동의 내역) / PATCH: 기록 시각 변경
// PUT: 연구 동의 켜기·끄기 (이력으로 남김 — 켜면 새 줄, 끄면 revoked_at) / DELETE: 전 표 실삭제
import { serviceStore } from "../../../lib/db";

export const runtime = "nodejs";

const RESEARCH_VERSION = "v1"; // PRICING_SPEC 동의 문구 버전

type StoreT = { url: string; headers: Record<string, string> };

async function ownerOf(store: StoreT, secret: string): Promise<boolean> {
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return false;
  const r = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=user_id`, {
    headers: store.headers, cache: "no-store",
  });
  return r.ok && ((await r.json()) as unknown[]).length > 0;
}

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!(await ownerOf(store, secret))) return Response.json({ error: "no-key" }, { status: 401 });
  const [pr, cr] = await Promise.all([
    fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&select=observer_code,record_hour,email`, { headers: store.headers, cache: "no-store" }),
    fetch(`${store.url}/rest/v1/consents?user_id=eq.${secret}&select=consent_type,policy_version,granted_at,revoked_at&order=granted_at.desc`, { headers: store.headers, cache: "no-store" }),
  ]);
  const profile = pr.ok ? ((await pr.json()) as { observer_code: string; record_hour: number; email: string | null }[])[0] : undefined;
  const consents = cr.ok
    ? ((await cr.json()) as { consent_type: string; policy_version: string; granted_at: string; revoked_at: string | null }[])
    : [];
  const research = consents.some((c) => c.consent_type === "research" && c.revoked_at === null);
  return Response.json({
    observerCode: profile?.observer_code ?? null,
    recordHour: profile?.record_hour ?? 21,
    research,
    consents,
  });
}

export async function PATCH(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!(await ownerOf(store, secret))) return Response.json({ error: "no-key" }, { status: 401 });
  let hour = -1;
  try {
    const body = (await req.json()) as { recordHour?: number };
    hour = typeof body.recordHour === "number" ? Math.floor(body.recordHour) : -1;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (hour < 0 || hour > 23) return Response.json({ error: "bad-hour" }, { status: 400 });
  const r = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ record_hour: hour }),
  });
  if (!r.ok) return Response.json({ error: "failed" }, { status: 502 });
  return Response.json({ ok: true, recordHour: hour });
}

/** 연구 동의 (3-2) — 기본 해제, 켜고 끈 시각이 전부 이력으로 남는다 */
export async function PUT(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!(await ownerOf(store, secret))) return Response.json({ error: "no-key" }, { status: 401 });
  let granted: boolean | null = null;
  try {
    const body = (await req.json()) as { research?: boolean };
    granted = typeof body.research === "boolean" ? body.research : null;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (granted === null) return Response.json({ error: "bad-request" }, { status: 400 });

  if (granted) {
    // 이미 유효한 동의가 있으면 중복으로 쌓지 않는다
    const cur = await fetch(
      `${store.url}/rest/v1/consents?user_id=eq.${secret}&consent_type=eq.research&revoked_at=is.null&select=id&limit=1`,
      { headers: store.headers, cache: "no-store" }
    );
    if (cur.ok && ((await cur.json()) as unknown[]).length > 0) return Response.json({ ok: true, research: true });
    const r = await fetch(`${store.url}/rest/v1/consents`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=minimal" },
      body: JSON.stringify({ user_id: secret, consent_type: "research", policy_version: RESEARCH_VERSION }),
    });
    if (!r.ok) return Response.json({ error: "failed" }, { status: 502 });
    return Response.json({ ok: true, research: true });
  }
  const r = await fetch(`${store.url}/rest/v1/consents?user_id=eq.${secret}&consent_type=eq.research&revoked_at=is.null`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  if (!r.ok) return Response.json({ error: "failed" }, { status: 502 });
  return Response.json({ ok: true, research: false });
}

/** 완전 삭제 (3-4 · S15) — 확인 문구가 맞아야 하고, 전 표에서 실삭제한다.
 *  profiles 를 마지막에 지운다 — 중간 실패 시 신원이 남아 재시도할 수 있게 (부분 삭제 방치 방지). */
export async function DELETE(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!(await ownerOf(store, secret))) return Response.json({ error: "no-key" }, { status: 401 });
  let confirm = "";
  try {
    confirm = String(((await req.json()) as { confirm?: string }).confirm ?? "");
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (confirm !== "삭제합니다" && confirm !== "DELETE") return Response.json({ error: "confirm-mismatch" }, { status: 400 });

  for (const t of ["daily_entries", "step_events", "assessments", "consents", "payments", "push_subs", "journeys", "profiles"]) {
    const r = await fetch(`${store.url}/rest/v1/${t}?user_id=eq.${secret}`, { method: "DELETE", headers: store.headers });
    // payments·push_subs 표가 없던 시절 계정도 있다 — 404 계열은 없음으로 취급
    if (!r.ok && r.status !== 404) return Response.json({ error: "failed", table: t }, { status: 502 });
  }
  return Response.json({ ok: true });
}
