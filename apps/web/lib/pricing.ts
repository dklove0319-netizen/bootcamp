// 가격 설정 — 하드코딩 금지 (PRICING_SPEC 절대 규칙 4: 인상은 시간이 아니라 근거로 49,000 → 79,000 → 120,000)
// 화면·결제·문구가 전부 이 파일 하나만 본다. 바꿀 땐 여기 숫자만.
export const COURSE_PRICE = 49000; // 21일 검증 코스 (원)
export const LIST_PRICE = 120000; // 정가 (취소선 표시용)
export const COURSE_PRICE_USD = 39; // 달러 가격
export const LIST_PRICE_USD = 89; // 달러 정가

export function formatKrw(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}
export function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

// 토스페이먼츠 — 문서 공개 테스트 키 (실결제 불가 모래상자 · 가입 없이 사용 가능하도록 토스가 문서에 공개한 키).
// 실키 전환은 .env 의 TOSS_CLIENT_KEY / TOSS_SECRET_KEY 만 채우면 된다 (치명 3: 테스트 키 먼저, 실키는 맨 마지막).
export const TOSS_TEST_CLIENT_KEY = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
