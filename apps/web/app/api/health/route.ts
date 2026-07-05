// 서버 건강 확인 창구 — 열쇠 "값"은 절대 노출하지 않고, 꽂힘 여부와 "모양"만 답한다.
// 모양 = 길이대·따옴표 유무·앞뒤 공백 유무·https 시작 여부. 값 자체는 어떤 경우에도 내보내지 않는다.
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

export async function GET(): Promise<Response> {
  return Response.json({
    SUPABASE_URL: shapeOf(process.env.SUPABASE_URL),
    SUPABASE_ANON_KEY: shapeOf(process.env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: shapeOf(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY: shapeOf(process.env.ANTHROPIC_API_KEY),
  });
}
