// 서명 토큰 (3-1) — 이메일 링크에 싣는 일회용 도장. LINK_SECRET 없이는 위조 불가.
// 내용: u=관찰자 비밀열쇠, e=이메일, k=용도(link=연결확인 | recover=아이디복구), x=만료(epoch초)
import { createHmac, timingSafeEqual } from "node:crypto";

export type LinkPayload = { u: string; e: string; k: "link" | "recover"; x: number };

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signToken(payload: LinkPayload): string | null {
  const secret = process.env.LINK_SECRET ?? "";
  if (secret === "") return null;
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return body + "." + b64url(hmac(body, secret));
}

export function verifyToken(token: string, kind: "link" | "recover"): LinkPayload | null {
  const secret = process.env.LINK_SECRET ?? "";
  if (secret === "") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = b64url(hmac(parts[0], secret));
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const p = JSON.parse(raw) as LinkPayload;
    if (p.k !== kind) return null;
    if (typeof p.x !== "number" || p.x * 1000 < Date.now()) return null; // 만료
    if (typeof p.u !== "string" || typeof p.e !== "string") return null;
    return p;
  } catch {
    return null;
  }
}
