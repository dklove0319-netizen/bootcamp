// 가격 설정 — 하드코딩 금지 (PRICING_SPEC 절대 규칙 4: 인상은 시간이 아니라 근거로 49,000 → 79,000 → 120,000)
// 화면·결제·문구가 전부 이 파일 하나만 본다. 바꿀 땐 여기 숫자만.
export const COURSE_PRICE = 49000; // 21일 검증 코스
export const LIST_PRICE = 120000; // 정가 (취소선 표시용)

export function formatKrw(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}
