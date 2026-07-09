// 시작점·21일째 설문 저장 (S16 · WHO-5). 점수는 그 자리에서 보여주지 않는다 — 회수는 보고서에서.
import { serviceStore } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });
  const phase = new URL(req.url).searchParams.get("phase") === "day21" ? "day21" : "day0"; // 화이트리스트 (리뷰 2026-07-08 낮음-6)
  const r = await fetch(
    `${store.url}/rest/v1/assessments?user_id=eq.${secret}&phase=eq.${phase}&instrument=eq.who5&select=id&limit=1`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = r.ok ? ((await r.json()) as unknown[]) : [];
  return Response.json({ exists: rows.length > 0 });
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  let body: { phase?: string; who5?: number[]; self?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const phase = body.phase === "day21" ? "day21" : "day0";
  const who5 = Array.isArray(body.who5) ? body.who5 : [];
  if (who5.length !== 5 || who5.some((v) => typeof v !== "number" || v < 0 || v > 5)) {
    return Response.json({ error: "incomplete" }, { status: 400 });
  }
  const total = who5.reduce((a, b) => a + b, 0);
  // 자기 문답 (선택 — 있으면 검사: day0 1문항 / day21 2문항, 원문 그대로 보관)
  const rows: Record<string, unknown>[] = [{ user_id: secret, phase, instrument: "who5", answers: who5, total_score: total }];
  if (body.self !== undefined) {
    const self = Array.isArray(body.self) ? body.self.map((s) => (typeof s === "string" ? s.trim() : "")) : [];
    const want = phase === "day21" ? 2 : 1;
    if (self.length !== want || self.some((s) => s === "" || s.length > 2000)) {
      return Response.json({ error: "incomplete" }, { status: 400 });
    }
    // 일괄 넣기는 두 행의 칸 구성이 같아야 한다 (PostgREST) — 합계는 빈 값으로 칸만 맞춘다
    rows.push({ user_id: secret, phase, instrument: "self", answers: self, total_score: null });
  }
  const r = await fetch(`${store.url}/rest/v1/assessments`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) return Response.json({ error: "failed" }, { status: 502 });
  return Response.json({ saved: true });
}
