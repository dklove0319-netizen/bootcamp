// 서버 건강 확인 창구 — 열쇠 "값"은 절대 노출하지 않고, 꽂혔는지 여부(참/거짓)만 답한다.
// 배포 후 "왜 저장이 안 되지?"를 추측 없이 진단하기 위한 점검 문.
export const runtime = "nodejs";

function looksLikeUrl(v: string | undefined): boolean {
  return typeof v === "string" && v.startsWith("https://");
}
function filled(v: string | undefined): boolean {
  return typeof v === "string" && v.trim().length > 20;
}

export async function GET(): Promise<Response> {
  return Response.json({
    supabase_url_ok: looksLikeUrl(process.env.SUPABASE_URL),
    supabase_anon_key_ok: filled(process.env.SUPABASE_ANON_KEY),
    supabase_service_role_key_ok: filled(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic_api_key_ok: filled(process.env.ANTHROPIC_API_KEY),
  });
}
