// 관리자 암호 확인 (블럭 7) — .env 의 ADMIN_KEY 와 대조. 미설정이면 항상 거절 (안전 기본값).
// ⚠ 보안(리뷰 2026-07-08 낮음-7): 전 사용자 일기를 여는 열쇠라 상수시간 비교로 타이밍 누출을 막는다.
import { createHmac, timingSafeEqual } from "node:crypto";

export function adminAuthed(req: Request): boolean {
  const k = process.env.ADMIN_KEY ?? "";
  if (k === "") return false;
  const given = req.headers.get("x-admin-key") ?? "";
  // 길이가 달라도 같은 비용이 들도록 HMAC 지문끼리 비교 (길이 자체가 힌트가 되지 않게)
  const a = createHmac("sha256", "ozero-admin").update(given).digest();
  const b = createHmac("sha256", "ozero-admin").update(k).digest();
  return timingSafeEqual(a, b);
}
