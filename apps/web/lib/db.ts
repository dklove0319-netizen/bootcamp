// 서버 전용 창고 접근 (마스터 열쇠 = SERVICE_ROLE). 브라우저에 절대 노출 안 됨 — 서버 라우트에서만.
// 블럭 1~4의 데이터 접근은 전부 이 헬퍼를 거친다 (결정 2026-07-05: 서버 경유 + RLS 유지).
export type Store = { url: string; headers: Record<string, string> };

/** 열쇠가 채워졌으면 창고 접속 정보를, 아니면 null (개발 중 열쇠 없으면 저장 기능만 조용히 꺼짐) */
export function serviceStore(): Store | null {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.startsWith("https://") || key.length <= 20) return null;
  return {
    url,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
  };
}

/** 오늘 날짜 (서버 UTC 기준, YYYY-MM-DD) */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
