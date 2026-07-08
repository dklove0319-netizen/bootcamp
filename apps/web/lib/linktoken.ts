// 서명+암호화 토큰 (3-1) — 이메일 링크에 싣는 일회용 도장. LINK_SECRET 없이는 위조·복호 불가.
// 내용: u=관찰자 비밀열쇠, e=이메일, k=용도(link=연결확인 | recover=아이디복구), x=만료(epoch초)
// ⚠ 보안(리뷰 2026-07-08 중간-1): 페이로드는 base64가 아니라 AES-256-GCM 으로 암호화한다.
//    토큰 URL이 로그·히스토리·Referer 로 새더라도 비밀열쇠(u)를 꺼낼 수 없다. 30분 만료가 진짜 방어가 된다.
import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type LinkPayload = { u: string; e: string; k: "link" | "recover"; x: number };

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function keyOf(): Buffer | null {
  const secret = process.env.LINK_SECRET ?? "";
  if (secret === "") return null;
  return createHash("sha256").update("ozero-link-v1:" + secret).digest(); // 32바이트 대칭키
}

/** 토큰 = b64url(iv).b64url(ciphertext).b64url(gcmTag) — 세 조각 모두 있어야 열린다 */
export function signToken(payload: LinkPayload): string | null {
  const key = keyOf();
  if (key === null) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return b64url(iv) + "." + b64url(ct) + "." + b64url(tag);
}

export function verifyToken(token: string, kind: "link" | "recover"): LinkPayload | null {
  const key = keyOf();
  if (key === null) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = fromB64url(parts[0]);
    const ct = fromB64url(parts[1]);
    const tag = fromB64url(parts[2]);
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag); // 위조·변조면 여기서 예외
    const raw = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const p = JSON.parse(raw) as LinkPayload;
    if (p.k !== kind) return null;
    if (typeof p.x !== "number" || p.x * 1000 < Date.now()) return null; // 만료
    if (typeof p.u !== "string" || typeof p.e !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

// 과거 HMAC 서명 검증 도우미는 더 이상 쓰지 않지만, 다른 곳에서 상수시간 비교가 필요할 때를 위해 남긴다
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // 길이 노출 방지용 더미 비교
    timingSafeEqual(createHmac("sha256", "x").update(a).digest(), createHmac("sha256", "x").update(a).digest());
    return false;
  }
  return timingSafeEqual(ab, bb);
}
