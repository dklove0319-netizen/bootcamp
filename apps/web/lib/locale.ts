// 언어 판별 — 브라우저가 보내는 Accept-Language 헤더(브라우저의 언어 명함)로 정한다.
// 규칙: 첫 선호 언어가 한국어면 ko, 그 외 전부 en (영어권 자동 영어 — 사용자 지시 2026-07-05).
// 헤더가 없으면(봇·직접 호출) ko — 브랜드의 본거지 언어.
export type Locale = "ko" | "en";

export function pickLocale(acceptLanguage: string | null): Locale {
  if (acceptLanguage === null || acceptLanguage.trim() === "") return "ko";
  return acceptLanguage.trim().toLowerCase().startsWith("ko") ? "ko" : "en";
}

/** AI 출력 언어 지시 — 기록의 언어가 아니라 "화면 언어"를 따른다 (사용자 지시 2026-07-08:
 *  영어 화면인데 한글 기록을 쓰면 질문이 한글로 나오던 것 수정. 인용(원문 조각)만 원문 그대로 유지). */
export function langLine(locale: Locale): string {
  return locale === "ko"
    ? "출력 언어·말투: 모든 출력(질문·이유·관찰·되비춤)은 한국어 ~이에요/~해요체(존댓말)로만 쓰세요. 참가자가 반말·비속어·캐주얼하게 썼더라도 거울은 절대 그 말투를 따라가지 말고 항상 존댓말을 지켜요 — 반말('~야', '~해', '기억나?')로 끝내지 마세요. 인용 조각(src, quote)만 참가자 원문 그대로 두세요."
    : "Output language & register: write ALL output (questions, reasons, notes, reflections) in English with the same dry, calm, polite witness tone. Even if the participant wrote casually or with slang, never mirror their register — keep it steady. Only quoted fragments (src, quote) stay verbatim in the participant's original words.";
}

/** 모든 질문은 물음표로 끝난다 (사용자 지시 2026-07-08) — AI가 빼먹어도 서버가 보정한다 */
export function ensureQuestionMark(q: string): string {
  const t = q.trim().replace(/[.。．]+$/, "");
  return /[?？]$/.test(t) ? t : t + "?";
}
