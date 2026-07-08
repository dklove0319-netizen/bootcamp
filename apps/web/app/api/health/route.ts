// 서버 건강 확인 창구 — 열쇠 "값"은 절대 노출하지 않고, 꽂힘 여부와 "모양"만 답한다.
// 모양 = 길이대·따옴표 유무·앞뒤 공백 유무·https 시작 여부. 값 자체는 어떤 경우에도 내보내지 않는다.
// ⚠ 보안(리뷰 2026-07-08 중간-2): 열쇠의 꽂힘·길이대도 정찰 재료라 운영자 암호 뒤로 잠근다.
import { adminAuthed } from "../../../lib/admin";

export const runtime = "nodejs";

type Shape = {
  present: boolean;
  length_band: "빈값" | "너무 짧음" | "충분히 김";
  quoted: boolean;
  padded: boolean;
  starts_https: boolean;
};

function shapeOf(v: string | undefined): Shape {
  const s = typeof v === "string" ? v : "";
  const t = s.trim();
  return {
    present: s !== "",
    length_band: t.length === 0 ? "빈값" : t.length <= 20 ? "너무 짧음" : "충분히 김",
    quoted: /^["']/.test(t) || /["']$/.test(t),
    padded: s !== t,
    starts_https: t.startsWith("https://"),
  };
}

export async function GET(req: Request): Promise<Response> {
  if (!adminAuthed(req)) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json({
    build: "v7-잠금", // 어느 배포가 응답 중인지 식별용

    SUPABASE_URL: shapeOf(process.env.SUPABASE_URL),
    SUPABASE_ANON_KEY: shapeOf(process.env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: shapeOf(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY: shapeOf(process.env.ANTHROPIC_API_KEY),
    ADMIN_KEY: shapeOf(process.env.ADMIN_KEY),
    VAPID_PUBLIC_KEY: shapeOf(process.env.VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: shapeOf(process.env.VAPID_PRIVATE_KEY),
  });
}
