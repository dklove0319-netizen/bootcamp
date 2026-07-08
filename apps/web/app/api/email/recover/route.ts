// 아이디 복구 (3-1) — POST: 복구 메일 요청 / PUT: 링크 클릭 후 이 기기에 아이디 복원
// 보안: 이메일이 등록돼 있든 없든 응답은 같다 (남의 이메일 등록 여부를 캐낼 수 없게).
import { serviceStore } from "../../../../lib/db";
import { signToken, verifyToken } from "../../../../lib/linktoken";
import { sendMail } from "../../../../lib/mail";
import { adminAuthed } from "../../../../lib/admin";
import { pickLocale } from "../../../../lib/locale";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TTL_SEC = 30 * 60;

function siteUrl(req: Request): string {
  const env = process.env.SITE_URL ?? "";
  if (env !== "") return env.replace(/\/$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  let email = "";
  try {
    email = String(((await req.json()) as { email?: string }).email ?? "").trim().toLowerCase();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) return Response.json({ error: "bad-email" }, { status: 400 });

  const r = await fetch(
    `${store.url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&email_verified_at=not.is.null&deleted_at=is.null&select=user_id,observer_code`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = r.ok ? ((await r.json()) as { user_id: string; observer_code: string }[]) : [];

  let testLink: string | null = null;
  if (rows.length > 0) {
    const token = signToken({ u: rows[0].user_id, e: email, k: "recover", x: Math.floor(Date.now() / 1000) + TTL_SEC });
    if (token !== null) {
      const link = `${siteUrl(req)}/recover?token=${encodeURIComponent(token)}`;
      const ko = pickLocale(req.headers.get("accept-language")) === "ko";
      const sent = await sendMail(
        email,
        ko ? "오제로의 거울 — 아이디 되찾기" : "Ozero's Mirror — recover your ID",
        ko
          ? `<p>아래를 누르면 이 기기에 오제로 아이디 ${rows[0].observer_code} 가 복원돼요. 30분 안에만 유효해요.</p><p><a href="${link}">아이디 되찾기</a></p><p>본인이 요청하지 않았다면 무시하면 돼요.</p>`
          : `<p>Tap below to restore Ozero ID ${rows[0].observer_code} on this device. Valid for 30 minutes.</p><p><a href="${link}">Recover my ID</a></p><p>If you didn't request this, ignore this email.</p>`
      );
      if (!sent && adminAuthed(req)) testLink = link; // 발송기 미연결 시 운영자 시험용
    }
  }
  // 존재 여부와 무관하게 같은 응답 (정보 유출 방지)
  return Response.json({ ok: true, ...(testLink !== null ? { testLink } : {}) });
}

/** 복구 확정 — 토큰 검증 후 이 기기에 심을 신원을 돌려준다 */
export async function PUT(req: Request): Promise<Response> {
  const store = serviceStore();
  if (store === null) return Response.json({ error: "unavailable" }, { status: 503 });
  let token = "";
  try {
    token = String(((await req.json()) as { token?: string }).token ?? "");
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const p = verifyToken(token, "recover");
  if (p === null) return Response.json({ error: "bad-token" }, { status: 400 });
  // 이메일이 여전히 그 계정의 것인지 확인 (그 사이 바뀌었으면 무효)
  const r = await fetch(
    `${store.url}/rest/v1/profiles?user_id=eq.${p.u}&email=eq.${encodeURIComponent(p.e)}&deleted_at=is.null&select=user_id,observer_code`,
    { headers: store.headers, cache: "no-store" }
  );
  const rows = r.ok ? ((await r.json()) as { user_id: string; observer_code: string }[]) : [];
  if (rows.length === 0) return Response.json({ error: "bad-token" }, { status: 400 });
  return Response.json({ ok: true, secret: rows[0].user_id, observerCode: rows[0].observer_code });
}
