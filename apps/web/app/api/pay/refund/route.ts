// 환불 창구 (10-2 · 스펙: 결제 후 72시간 이내 + 기록 3건 이하면 전액. 환불자 데이터는 연구셋 제외)
import { serviceStore } from "../../../../lib/db";

export const runtime = "nodejs";

const TOSS_TEST_SECRET = "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  let reason = "";
  try {
    const body = (await req.json()) as { reason?: string };
    reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  // 최근 결제 (payments 표 — block10.sql 필요)
  const payR = await fetch(
    `${store.url}/rest/v1/payments?user_id=eq.${secret}&refunded_at=is.null&order=created_at.desc&limit=1&select=id,journey_id,provider,payment_key,created_at`,
    { headers: store.headers, cache: "no-store" }
  );
  if (!payR.ok) return Response.json({ error: "결제 원장을 찾지 못했어요. (payments 표 필요)" }, { status: 503 });
  const pays = (await payR.json()) as { id: number; journey_id: number; provider: string; payment_key: string; created_at: string }[];
  if (pays.length === 0) return Response.json({ error: "환불할 결제가 없어요." }, { status: 404 });
  const pay = pays[0];

  // 조건 1: 72시간 이내
  if (Date.now() - Date.parse(pay.created_at) > 72 * 3600 * 1000) {
    return Response.json({ error: "환불 가능 시간(결제 후 72시간)이 지났어요." }, { status: 409 });
  }
  // 조건 2: 그 여정의 제출 기록 3건 이하
  const er = await fetch(
    `${store.url}/rest/v1/daily_entries?user_id=eq.${secret}&journey_id=eq.${pay.journey_id}&submitted_at=not.is.null&select=id`,
    { headers: store.headers, cache: "no-store" }
  );
  const count = er.ok ? ((await er.json()) as unknown[]).length : 0;
  if (count > 3) {
    return Response.json({ error: "기록이 3건을 넘어 환불 대상이 아니에요." }, { status: 409 });
  }

  // 토스 결제면 취소 호출 (테스트 모드)
  if (pay.provider === "toss") {
    const secretKey = process.env.TOSS_SECRET_KEY ?? TOSS_TEST_SECRET;
    const auth = "Basic " + Buffer.from(secretKey + ":").toString("base64");
    const cancel = await fetch(`https://api.tosspayments.com/v1/payments/${pay.payment_key}/cancel`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ cancelReason: reason === "" ? "사용자 요청" : reason }),
    });
    if (!cancel.ok) {
      const err = (await cancel.json().catch(() => ({}))) as { message?: string };
      return Response.json({ error: err.message ?? "결제 취소에 실패했어요." }, { status: 502 });
    }
  }

  // 원장 갱신 + 여정 refunded (연구 추출 쿼리는 status=refunded 제외 — 스펙)
  await fetch(`${store.url}/rest/v1/payments?id=eq.${pay.id}`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ refunded_at: new Date().toISOString(), refund_reason: reason }),
  });
  await fetch(`${store.url}/rest/v1/journeys?id=eq.${pay.journey_id}`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ status: "refunded" }),
  });

  return Response.json({ refunded: true });
}
