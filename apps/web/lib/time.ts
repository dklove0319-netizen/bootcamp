// 배달 시각(0~23시)을 사람이 읽는 문구로. 한국어면 오전/오후 N시, 그 외엔 N AM/PM.
export function formatHour(hour: number, locale: "ko" | "en"): string {
  const h = ((hour % 24) + 24) % 24;
  if (locale === "ko") {
    return h < 12 ? `오전 ${h === 0 ? 12 : h}시` : `오후 ${h === 12 ? 12 : h - 12}시`;
  }
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/** 지금 브라우저가 어느 언어인지 (시간 표기용 — 서버의 Accept-Language 판별과 같은 규칙) */
export function clientLocale(): "ko" | "en" {
  if (typeof navigator === "undefined") return "ko";
  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}
