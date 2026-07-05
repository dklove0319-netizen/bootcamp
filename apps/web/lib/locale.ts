// 언어 판별 — 브라우저가 보내는 Accept-Language 헤더(브라우저의 언어 명함)로 정한다.
// 규칙: 첫 선호 언어가 한국어면 ko, 그 외 전부 en (영어권 자동 영어 — 사용자 지시 2026-07-05).
// 헤더가 없으면(봇·직접 호출) ko — 브랜드의 본거지 언어.
export type Locale = "ko" | "en";

export function pickLocale(acceptLanguage: string | null): Locale {
  if (acceptLanguage === null || acceptLanguage.trim() === "") return "ko";
  return acceptLanguage.trim().toLowerCase().startsWith("ko") ? "ko" : "en";
}
