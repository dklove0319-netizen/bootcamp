// 이메일 연결 (3-1) — POST: 확인 메일 발송 / PUT: 링크 클릭 후 확정
// 왜 이메일인가: 익명 아이디의 신원은 기기 브라우저에만 있어서, 기기를 잃으면 기록도 잃는다.
// 이메일 하나를 붙여두면 어느 기기에서든 아이디를 되찾을 수 있다 (주소는 복구용으로만 쓴다).
import { serviceStore } from "../../../../lib/db";
import { signToken, verifyToken } from "../../../../lib/linktoken";
import { sendMail, mailReady } from "../../../../lib/mail";
import { adminAuthed } from "../../../../lib/admin";
import { pickLocale } from "../../../../lib/locale";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TTL_SEC = 30 * 60; // 링크 유효 30분

function siteUrl(req: Request): string {
  const env = process.env.SITE_URL ?? "";
  if (env !== "") return env.replace(/\/$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  const secret = req.headers.get("x-ozero-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) return Response.json({ error: "no-key" }, { status: 401 });
  const pr = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${secret}&deleted_at=is.null&select=observer_code`, {
    headers: store.headers, cache: "no-store",
  });
  const me = pr.ok ? ((await pr.json()) as { observer_code: string }[]) : [];
  if (me.length === 0) return Response.json({ error: "not-found" }, { status: 404 });

  let email = "";
  try {
    email = String(((await req.json()) as { email?: string }).email ?? "").trim().toLowerCase();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) return Response.json({ error: "bad-email" }, { status: 400 });

  // 한 이메일 = 한 아이디 (복구가 유일하게 짚을 수 있어야 하니까)
  // ⚠ 보안(리뷰 2026-07-08 중간-3): 이미 쓰이는 이메일이어도 409 로 알려주지 않는다 —
  //    가입 여부를 캐내는 열거 통로가 되기 때문(정신건강 앱에선 가입 사실 자체가 민감).
  //    대신 확인 메일을 보내지 않고 정상과 같은 응답을 준다 (본인 소유 이메일이면 정상 흐름과 구분 불가).
  const dup = await fetch(
    `${store.url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&user_id=neq.${secret}&deleted_at=is.null&select=user_id`,
    { headers: store.headers, cache: "no-store" }
  );
  if (dup.ok && ((await dup.json()) as unknown[]).length > 0) {
    return Response.json({ sent: true }); // 열거 방지 — 실제로는 보내지 않음
  }

  const token = signToken({ u: secret, e: email, k: "link", x: Math.floor(Date.now() / 1000) + TTL_SEC });
  if (token === null) return Response.json({ error: "secret-missing" }, { status: 503 });
  const link = `${siteUrl(req)}/link-email?token=${encodeURIComponent(token)}`;

  const ko = pickLocale(req.headers.get("accept-language")) === "ko";
  const sent = await sendMail(
    email,
    ko ? "오제로의 거울 — 이메일 확인" : "Ozero's Mirror — confirm your email",
    ko
      ? `<p>오제로 아이디 ${me[0].observer_code} 에 이 이메일을 연결하려면 아래를 눌러주세요. 30분 안에만 유효해요.</p><p><a href="${link}">이메일 연결 확인</a></p><p>본인이 요청하지 않았다면 이 메일은 무시하면 돼요.</p>`
      : `<p>Tap below to link this email to Ozero ID ${me[0].observer_code}. The link is valid for 30 minutes.</p><p><a href="${link}">Confirm email link</a></p><p>If you didn't request this, ignore this email.</p>`
  );

  // 발송기 미연결 상태에서는 운영자에게만 시험 링크를 돌려준다 (E2E 검증용 — 일반 사용자에겐 노출 금지)
  if (!sent && adminAuthed(req)) return Response.json({ sent: false, reason: "mail-unavailable", testLink: link });
  if (!sent) return Response.json({ sent: false, reason: mailReady() ? "send-failed" : "mail-unavailable" });
  return Response.json({ sent: true });
}

/** 링크 클릭 확정 — 토큰 검증 후 profiles.email 저장 */
export async function PUT(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  let token = "";
  try {
    token = String(((await req.json()) as { token?: string }).token ?? "");
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const p = verifyToken(token, "link");
  if (p === null) return Response.json({ error: "bad-token" }, { status: 400 });

  // 확정 시점에도 중복 재확인 (토큰 발급 후 다른 아이디가 선점했을 수 있다)
  const dup = await fetch(
    `${store.url}/rest/v1/profiles?email=eq.${encodeURIComponent(p.e)}&user_id=neq.${p.u}&deleted_at=is.null&select=user_id`,
    { headers: store.headers, cache: "no-store" }
  );
  if (dup.ok && ((await dup.json()) as unknown[]).length > 0) {
    return Response.json({ error: "email-taken" }, { status: 409 });
  }
  const r = await fetch(`${store.url}/rest/v1/profiles?user_id=eq.${p.u}&deleted_at=is.null`, {
    method: "PATCH",
    headers: { ...store.headers, prefer: "return=representation" },
    body: JSON.stringify({ email: p.e, email_verified_at: new Date().toISOString() }),
  });
  const rows = r.ok ? ((await r.json()) as { observer_code: string }[]) : [];
  if (rows.length === 0) return Response.json({ error: "failed" }, { status: 502 });
  return Response.json({ ok: true, observerCode: rows[0].observer_code, email: p.e });
}
