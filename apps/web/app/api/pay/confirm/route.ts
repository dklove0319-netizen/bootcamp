// 결제 확인 창구 (블럭 10 · 스펙 5단계) — 테스트 모드 (치명 3: 실키 전환은 맨 마지막)
// 하는 일: 결제 승인 확인(서버가 금액 대조) → 21일 여정(mirror21) 시작 + 검증 동의 기록 + 결제 원장 기록.
// KRW = 토스페이먼츠 (문서 공개 테스트 키 · .env 에 실키 넣으면 자동 교체)
// USD = 테스트 모드 시뮬레이션 (해외 결제사 계정 개설 전까지 — provider 'test_usd' 로 명시 기록)
import { serviceStore, type Store } from "../../../../lib/db";
import { COURSE_PRICE, COURSE_PRICE_USD } from "../../../../lib/pricing";

export const runtime = "nodejs";

const TOSS_TEST_SECRET = "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R"; // 토스 문서 공개 테스트 시크릿 (실결제 불가)

async function recordPayment(store: Store, row: Record<string, unknown>): Promise<void> {
  // payments 표가 아직 없어도 결제 자체(여정 시작)는 막지 않는다 — 표 생성 SQL: docs/plan/sql/block10.sql
  try {
    await fetch(`${store.url}/rest/v1/payments`, {
      method: "POST",
      headers: { ...store.headers, prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch {
    // 원장 기록 실패는 로그만 (여정은 이미 시작됨)
  }
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });

  let body: { provider?: string; paymentKey?: string; orderId?: string; amount?: number; currency?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const provider = body.provider === "test_usd" ? "test_usd" : "toss";
  const currency = provider === "test_usd" ? "USD" : "KRW";
  const expected = provider === "test_usd" ? COURSE_PRICE_USD : COURSE_PRICE;
  if (typeof body.amount !== "number" || body.amount !== expected) {
    return Response.json({ error: "amount-mismatch" }, { status: 400 }); // 금액 조작 차단 — 서버가 설정값과 대조
  }
  if (typeof body.orderId !== "string" || body.orderId === "") {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  // 신원 확인
  const pr = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=user_id`, {
    headers: store.headers, cache: "no-store",
  });
  if (!(pr.ok && ((await pr.json()) as unknown[]).length > 0)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  // KRW: 토스 승인 확인 (서버 → 토스)
  let paymentKey = body.paymentKey ?? "";
  if (provider === "toss") {
    if (paymentKey === "") return Response.json({ error: "bad-request" }, { status: 400 });
    const secretKey = process.env.TOSS_SECRET_KEY ?? TOSS_TEST_SECRET;
    const auth = "Basic " + Buffer.from(secretKey + ":").toString("base64");
    const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId: body.orderId, amount: body.amount }),
    });
    if (!tossRes.ok) {
      const err = (await tossRes.json().catch(() => ({}))) as { message?: string };
      return Response.json({ error: err.message ?? "결제 확인에 실패했어요." }, { status: 402 });
    }
  } else {
    paymentKey = "test-usd-" + body.orderId;
  }

  // 기존 활성 여정(trial3)은 종료하고 mirror21 시작 — 1일차는 첫 기록 제출일 (start_date 는 첫 기록 때 채움)
  await fetch(`${store.url}/rest/v1/journeys?user_id=eq.${secret}&status=eq.active`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ status: "done" }),
  });
  const jr = await fetch(`${store.url}/rest/v1/journeys`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=representation" },
    body: JSON.stringify({ user_id: secret, course: "mirror21", start_date: null, status: "active" }),
  });
  const journeys = jr.ok ? ((await jr.json()) as { id: number }[]) : [];
  if (journeys.length === 0) return Response.json({ error: "failed" }, { status: 502 });
  const journeyId = journeys[0].id;

  // 검증 동의 기록 (스펙: "그 동의가 이 가격의 조건" — 화면에서 체크 필수)
  await fetch(`${store.url}/rest/v1/consents`, {
    method: "POST",
    headers: { ...store.headers, prefer: "return=minimal" },
    body: JSON.stringify({ user_id: secret, consent_type: "research_price", policy_version: "v1" }),
  }).catch(() => {});

  await recordPayment(store, {
    user_id: secret,
    journey_id: journeyId,
    provider,
    currency,
    amount: body.amount,
    order_id: body.orderId,
    payment_key: paymentKey,
    status: provider === "toss" ? "DONE" : "TEST",
  });

  return Response.json({ ok: true, journeyId, course: "mirror21" });
}
